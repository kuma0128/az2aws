import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ini from "ini";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssumeRoleWithSAML } = vi.hoisted(() => ({
  mockAssumeRoleWithSAML: vi.fn(),
}));

vi.mock("@aws-sdk/client-sts", () => ({
  STS: class MockSTS {
    assumeRoleWithSAML = mockAssumeRoleWithSAML;
  },
}));

const AZURE_ENV_KEYS = [
  "azure_tenant_id",
  "AZURE_TENANT_ID",
  "azure_app_id_uri",
  "AZURE_APP_ID_URI",
  "azure_app_id",
  "AZURE_APP_ID",
  "azure_default_username",
  "AZURE_DEFAULT_USERNAME",
  "azure_default_password",
  "AZURE_DEFAULT_PASSWORD",
  "azure_default_role_arn",
  "AZURE_DEFAULT_ROLE_ARN",
  "azure_default_duration_hours",
  "AZURE_DEFAULT_DURATION_HOURS",
  "azure_duration_hours",
  "AZURE_DURATION_HOURS",
];

describe("login integration: standard mode persists credentials to disk", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let configPath: string;
  let credentialsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "az2aws-integ-"));
    const awsDir = path.join(tempDir, ".aws");
    configPath = path.join(awsDir, "config");
    credentialsPath = path.join(awsDir, "credentials");
    await mkdir(awsDir, { recursive: true });

    process.env = {
      ...originalEnv,
      HOME: tempDir,
      USERPROFILE: tempDir,
      AWS_CONFIG_FILE: configPath,
      AWS_SHARED_CREDENTIALS_FILE: credentialsPath,
    };
    for (const key of AZURE_ENV_KEYS) {
      delete process.env[key];
    }

    vi.resetModules();
    mockAssumeRoleWithSAML.mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes AccessKeyId/SecretAccessKey/SessionToken/Expiration under the expected profile when credentialProcess is false", async () => {
    const profileName = "integration";
    const roleArn = "arn:aws:iam::123456789012:role/TestRole";
    const principalArn = "arn:aws:iam::123456789012:saml-provider/TestProvider";

    const configIni = [
      `[profile ${profileName}]`,
      "region = us-east-1",
      "azure_tenant_id = tenant-xyz",
      "azure_app_id_uri = https://app.example.com",
      `azure_default_role_arn = ${roleArn}`,
      "azure_default_duration_hours = 1",
      "azure_default_remember_me = false",
      "",
    ].join("\n");
    await writeFile(configPath, configIni, "utf8");

    const expectedExpiration = new Date(Date.now() + 60 * 60 * 1000);
    mockAssumeRoleWithSAML.mockResolvedValue({
      Credentials: {
        AccessKeyId: "ASIAIOSFODNN7EXAMPLE",
        SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        SessionToken: "session-token-value",
        Expiration: expectedExpiration,
      },
    });

    const { login } = await import("./login");

    vi.spyOn(login, "_performLoginAsync").mockResolvedValue(
      "fake-saml-response",
    );
    vi.spyOn(login, "_parseRolesFromSamlResponse").mockReturnValue([
      { roleArn, principalArn },
    ]);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const disableSandbox = true;
    const noPrompt = true;
    const enableChromeNetworkService = false;
    const awsNoVerifySsl = false;
    const enableChromeSeamlessSso = false;
    const noDisableExtensions = false;
    const disableGpu = true;
    const incognito = false;
    const credentialProcess = false;

    await login.loginAsync(
      profileName,
      "cli",
      disableSandbox,
      noPrompt,
      enableChromeNetworkService,
      awsNoVerifySsl,
      enableChromeSeamlessSso,
      noDisableExtensions,
      disableGpu,
      incognito,
      credentialProcess,
    );

    expect(console.log).toHaveBeenCalledWith(
      `Credentials expire at ${expectedExpiration.toISOString()}.`,
    );
    expect(console.log).toHaveBeenCalledWith(
      `Use them with AWS CLI by passing --profile "${profileName}".`,
    );

    const persisted = await readFile(credentialsPath, "utf8");
    expect(persisted.trim()).not.toBe("");

    const parsed = ini.parse(persisted) as Record<
      string,
      Record<string, string>
    >;
    const section = parsed[profileName];
    expect(section).toBeDefined();
    expect(section.aws_access_key_id).toBe("ASIAIOSFODNN7EXAMPLE");
    expect(section.aws_secret_access_key).toBe(
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    );
    expect(section.aws_session_token).toBe("session-token-value");
    expect(section.aws_expiration).toBe(expectedExpiration.toISOString());
    expect(new Date(section.aws_expiration).getTime()).toBeGreaterThan(
      Date.now(),
    );

    expect(mockAssumeRoleWithSAML).toHaveBeenCalledTimes(1);
    expect(mockAssumeRoleWithSAML).toHaveBeenCalledWith(
      expect.objectContaining({
        PrincipalArn: principalArn,
        RoleArn: roleArn,
        SAMLAssertion: "fake-saml-response",
        DurationSeconds: 3600,
      }),
    );

    // Verify the real FS preserves 0600 through the atomic rename in
    // awsConfig._saveAsync — fs-mocked unit tests cannot catch regressions here.
    if (process.platform !== "win32") {
      const stats = await stat(credentialsPath);
      expect(stats.mode & 0o777).toBe(0o600);
    }
  });
});
