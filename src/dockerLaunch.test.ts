import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe.skipIf(process.platform === "win32")(
  "Docker launcher isolation",
  () => {
    let directory: string;
    let env: NodeJS.ProcessEnv;

    beforeEach(async () => {
      directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "az2aws-docker-test-"),
      );
      directory = await fs.realpath(directory);
      const bin = path.join(directory, "bin");
      await fs.mkdir(bin);
      await fs.writeFile(
        path.join(bin, "docker"),
        '#!/bin/sh\nprintf "%s\\0" "$@"\n',
        { mode: 0o700 },
      );
      await fs.writeFile(
        path.join(bin, "id"),
        '#!/bin/sh\nif [ "$1" = -u ]; then echo "${TEST_UID:-1234}"; else echo 2345; fi\n',
        { mode: 0o700 },
      );
      env = {
        ...process.env,
        HOME: directory,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        XDG_CONFIG_HOME: "",
        AZ2AWS_DOCKER_AWS_DIR: "",
        TEST_UID: "1234",
      };
    });

    afterEach(async () => {
      await fs.rm(directory, { recursive: true, force: true });
    });

    function launch(args: string[] = []) {
      return spawnSync("bash", [path.resolve("docker-launch.sh"), ...args], {
        env,
        encoding: "utf8",
      });
    }

    it("shares only a private dedicated directory and preserves sandbox defaults", async () => {
      const result = launch(["--profile", "profile with spaces"]);
      expect(result.status, result.stderr).toBe(0);
      const args = result.stdout.split("\0").slice(0, -1);
      const awsDir = path.join(directory, ".config", "az2aws", "docker");
      expect(args[args.indexOf("--volume") + 1]).toBe(`${awsDir}:/tmp/.aws`);
      expect(args[args.indexOf("--user") + 1]).toBe("1234:2345");
      expect(args[args.indexOf("--env") + 1]).toBe("HOME=/tmp");
      expect(args).not.toContain("--no-sandbox");
      expect(args).not.toContain("-t");
      expect(args.slice(-3)).toEqual([
        "taiseiito1000/az2aws",
        "--profile",
        "profile with spaces",
      ]);
      expect((await fs.stat(awsDir)).mode & 0o777).toBe(0o700);
    });

    it("honors an explicit dedicated directory and explicit sandbox opt-out", () => {
      env.AZ2AWS_DOCKER_AWS_DIR = path.join(directory, "selected profiles");
      const result = launch(["--no-sandbox", "--version"]);
      expect(result.status, result.stderr).toBe(0);
      const args = result.stdout.split("\0").slice(0, -1);
      expect(args[args.indexOf("--volume") + 1]).toBe(
        `${env.AZ2AWS_DOCKER_AWS_DIR}:/tmp/.aws`,
      );
      expect(args.slice(-2)).toEqual(["--no-sandbox", "--version"]);
    });

    it("refuses to replace the image's non-root user with host root", () => {
      env.TEST_UID = "0";
      const result = launch();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("non-root user");
      expect(result.stdout).toBe("");
    });
  },
);
