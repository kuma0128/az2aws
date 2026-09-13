import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ini from "ini";

describe("concurrent configuration writes in separate processes", () => {
  let directory: string;
  let workerPath: string;
  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "az2aws-concurrent-"));
    workerPath = path.join(directory, "worker.cjs");
    const result = await build({
      stdin: {
        contents: `import { awsConfig } from './src/awsConfig';
          process.send('ready');
          process.once('message', async () => {
            try {
              if (process.argv[2] === 'config') await awsConfig.setProfileConfigValuesAsync(process.argv[3], {region:'us-east-1'});
              else await awsConfig.setProfileCredentialsAsync(process.argv[3], {aws_access_key_id:'DUMMY',aws_secret_access_key:'dummy',aws_session_token:'dummy==',aws_expiration:'2030-01-01T00:00:00Z'});
              process.disconnect();
            } catch (error) { console.error(error); process.exit(1); }
          });`,
        resolveDir: process.cwd(),
      },
      platform: "node",
      format: "cjs",
      bundle: true,
      write: false,
    });
    await fs.writeFile(workerPath, result.outputFiles[0].text);
  });
  afterAll(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(["config", "credentials"])(
    "retains every profile after simultaneous %s updates",
    async (type) => {
      const file = path.join(directory, type);
      const processes = Array.from({ length: 6 }, (_, index) => {
        const child = fork(workerPath, [type, `profile${index}`], {
          execArgv: [],
          env: {
            ...process.env,
            AWS_CONFIG_FILE: file,
            AWS_SHARED_CREDENTIALS_FILE: file,
          },
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        });
        let stderr = "";
        child.stderr!.on("data", (chunk) => {
          stderr += chunk;
        });
        return {
          child,
          ready: new Promise<void>((resolve, reject) => {
            child.once("message", () => resolve());
            child.once("error", reject);
          }),
          exited: new Promise<void>((resolve, reject) => {
            child.once("exit", (code) =>
              code === 0
                ? resolve()
                : reject(new Error(stderr || `worker exited ${code}`)),
            );
            child.once("error", reject);
          }),
        };
      });
      try {
        await Promise.all(processes.map((worker) => worker.ready));
        for (const worker of processes) worker.child.send("go");
        await Promise.all(processes.map((worker) => worker.exited));
        expect(Object.keys(ini.parse(await fs.readFile(file, "utf8")))).toEqual(
          expect.arrayContaining(
            Array.from(
              { length: 6 },
              (_, index) =>
                `${type === "config" ? "profile " : ""}profile${index}`,
            ),
          ),
        );
        if (process.platform !== "win32")
          expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
      } finally {
        for (const worker of processes)
          if (worker.child.exitCode === null) worker.child.kill();
      }
    },
    20_000,
  );
});
