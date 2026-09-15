import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { awsConfig } from "./awsConfig";
import { paths } from "./paths";
import { buildCredentialProcessCommand } from "./credentialProcess";

const awsAvailable =
  spawnSync("aws", ["--version"], { timeout: 10_000 }).status === 0;
if (process.env.AZ2AWS_REQUIRE_AWS_CLI_TESTS && !awsAvailable) {
  throw new Error("AWS CLI is required for compatibility tests");
}

describe.skipIf(!awsAvailable)(
  "real AWS CLI configuration compatibility",
  // Real CLI startup can exceed the default 5s on ubuntu-slim with coverage.
  { timeout: 30_000 },
  () => {
    const originalPaths = { ...paths };
    let directory: string;
    let env: NodeJS.ProcessEnv;

    beforeEach(async () => {
      directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "az2aws-aws-compat-"),
      );
      paths.awsDir = directory;
      paths.config = path.join(directory, "config");
      paths.credentials = path.join(directory, "credentials");
      env = {
        ...process.env,
        AWS_CONFIG_FILE: paths.config,
        AWS_SHARED_CREDENTIALS_FILE: paths.credentials,
        AWS_EC2_METADATA_DISABLED: "true",
        PATH: directory + path.delimiter + process.env.PATH,
        AZ2AWS_TEST_ARGV: path.join(directory, "argv.json"),
      };
      for (const key of [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_SECURITY_TOKEN",
      ])
        delete env[key];
    });
    afterEach(async () => {
      Object.assign(paths, originalPaths);
      await fs.rm(directory, { recursive: true, force: true });
    });

    const aws = (...args: string[]) =>
      execFileSync("aws", args, {
        env,
        encoding: "utf8",
        timeout: 15_000,
      }).trim();

    it("loads the exact saved token through the consumer, including base64 padding", async () => {
      await awsConfig.setProfileCredentialsAsync("target", {
        aws_access_key_id: "DUMMY",
        aws_secret_access_key: "dummySecret",
        aws_session_token: "dummySession==",
        aws_expiration: "2030-01-01T00:00:00Z",
      });
      expect(
        aws("configure", "get", "aws_session_token", "--profile", "target"),
      ).toBe("dummySession==");
    });

    it("preserves usable S3 settings after updating another profile", async () => {
      await fs.writeFile(
        paths.config,
        "[profile other]\ns3 =\n  addressing_style = path\n  max_concurrent_requests = 20\n\n[profile target]\nregion = us-east-1\n",
      );
      await awsConfig.setProfileConfigValuesAsync("target", {
        region: "us-west-2",
      });
      expect(
        aws("configure", "get", "s3.addressing_style", "--profile", "other"),
      ).toBe("path");
      expect(
        aws(
          "configure",
          "get",
          "s3.max_concurrent_requests",
          "--profile",
          "other",
        ),
      ).toBe("20");
    });

    it.each(["normal", "team.prod", "R&D team", "team=prod"])(
      "passes profile %s unchanged to the configured helper",
      async (profileName) => {
        const script =
          "require('node:fs').writeFileSync(process.env.AZ2AWS_TEST_ARGV, JSON.stringify(process.argv.slice(2))); process.stdout.write(JSON.stringify({Version:1,AccessKeyId:process.argv[2],SecretAccessKey:'dummy',SessionToken:'dummy',Expiration:'2030-01-01T00:00:00Z'}));";
        if (process.platform === "win32") {
          await fs.writeFile(path.join(directory, "helper.cjs"), script);
          await fs.writeFile(
            path.join(directory, "az2aws.cmd"),
            `@"${process.execPath}" "%~dp0helper.cjs" %*\r\n`,
          );
        } else {
          await fs.writeFile(
            path.join(directory, "az2aws"),
            `#!${process.execPath}\n${script}`,
            { mode: 0o700 },
          );
        }
        await awsConfig.setProfileConfigValuesAsync(profileName, {
          credential_process: buildCredentialProcessCommand(profileName),
          region: "us-east-1",
        });
        // Available in AWS CLI v1 as well as v2; credential resolution happens
        // locally and never invokes an AWS API.
        const output = aws("configure", "list", "--profile", profileName);
        expect(output).toContain("custom-process");
        expect(
          JSON.parse(await fs.readFile(env.AZ2AWS_TEST_ARGV!, "utf8")),
        ).toEqual([`--profile=${profileName}`, "--credential-process"]);
      },
    );
  },
);
