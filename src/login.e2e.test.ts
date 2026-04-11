import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

interface E2eConfig {
  appIdUri: string;
  durationHours: string;
  password: string;
  profileName: string;
  region: string;
  roleArn: string;
  tenantId: string;
  username: string;
}

interface CredentialProcessOutput {
  AccessKeyId: string;
  Expiration: string;
  SecretAccessKey: string;
  SessionToken: string;
  Version: number;
}

const originalEnv = { ...process.env };

function getRequiredEnv(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required E2E environment variable: ${name}`);
  }

  return value;
}

function loadE2eConfig(): E2eConfig {
  return {
    tenantId: getRequiredEnv("AZ2AWS_E2E_AZURE_TENANT_ID"),
    appIdUri: getRequiredEnv("AZ2AWS_E2E_AZURE_APP_ID_URI"),
    username: getRequiredEnv("AZ2AWS_E2E_AZURE_DEFAULT_USERNAME"),
    password: getRequiredEnv("AZ2AWS_E2E_AZURE_DEFAULT_PASSWORD"),
    roleArn: getRequiredEnv("AZ2AWS_E2E_AZURE_DEFAULT_ROLE_ARN"),
    profileName: process.env.AZ2AWS_E2E_PROFILE?.trim() || "e2e",
    region: process.env.AZ2AWS_E2E_AWS_REGION?.trim() || "us-east-1",
    durationHours: process.env.AZ2AWS_E2E_DURATION_HOURS?.trim() || "1",
  };
}

function buildProfileConfig(profileName: string, region: string): string {
  const sectionName =
    profileName === "default" ? "default" : `profile ${profileName}`;

  return [
    `[${sectionName}]`,
    `region = ${region}`,
    "azure_tenant_id = placeholder",
    "azure_app_id_uri = placeholder",
    "azure_default_role_arn = placeholder",
    "azure_default_duration_hours = 1",
    "azure_default_remember_me = false",
    "",
  ].join("\n");
}

describe("login e2e", () => {
  it(
    "retrieves live AWS credentials through the Azure SSO flow",
    async () => {
      const e2eConfig = loadE2eConfig();
      const tempDir = await mkdtemp(path.join(os.tmpdir(), "az2aws-e2e-"));
      const homeDir = path.join(tempDir, "home");
      const awsDir = path.join(homeDir, ".aws");
      const configPath = path.join(awsDir, "config");
      const credentialsPath = path.join(awsDir, "credentials");
      const logSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);

      process.env = {
        ...originalEnv,
        HOME: homeDir,
        USERPROFILE: homeDir,
        AWS_CONFIG_FILE: configPath,
        AWS_SHARED_CREDENTIALS_FILE: credentialsPath,
        AZURE_TENANT_ID: e2eConfig.tenantId,
        AZURE_APP_ID_URI: e2eConfig.appIdUri,
        AZURE_DEFAULT_USERNAME: e2eConfig.username,
        AZURE_DEFAULT_PASSWORD: e2eConfig.password,
        AZURE_DEFAULT_ROLE_ARN: e2eConfig.roleArn,
        AZURE_DEFAULT_DURATION_HOURS: e2eConfig.durationHours,
      };

      try {
        await mkdir(awsDir, { recursive: true });
        await writeFile(
          configPath,
          buildProfileConfig(e2eConfig.profileName, e2eConfig.region),
          "utf8",
        );
        await writeFile(credentialsPath, "", "utf8");

        vi.resetModules();
        const { login } = await import("./login");

        await login.loginAsync(
          e2eConfig.profileName,
          "cli",
          true,
          true,
          false,
          false,
          false,
          false,
          true,
          true,
          true,
        );

        const jsonPayload = logSpy.mock.calls.at(-1)?.[0];

        expect(jsonPayload).toBeDefined();

        const credentials = JSON.parse(
          String(jsonPayload),
        ) as CredentialProcessOutput;

        expect(credentials.Version).toBe(1);
        expect(credentials.AccessKeyId).toBeTruthy();
        expect(credentials.SecretAccessKey).toBeTruthy();
        expect(credentials.SessionToken).toBeTruthy();
        expect(new Date(credentials.Expiration).getTime()).toBeGreaterThan(
          Date.now(),
        );

        const persistedCredentials = await readFile(credentialsPath, "utf8");
        expect(persistedCredentials.trim()).toBe("");
      } finally {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
        vi.resetModules();
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    10 * 60 * 1000,
  );
});
