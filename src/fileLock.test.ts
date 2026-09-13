import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { withFileLock } from "./fileLock";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "az2aws-lock-"));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

it("releases the lock after an operation fails", async () => {
  const resource = path.join(directory, "config");
  await expect(
    withFileLock(resource, async () => {
      throw new Error("write failed");
    }),
  ).rejects.toThrow("write failed");
  await expect(
    withFileLock(resource, async () => "reacquired", 0),
  ).resolves.toBe("reacquired");
});

it("reports contention without executing the waiting operation", async () => {
  const resource = path.join(directory, "config");
  await withFileLock(resource, async () => {
    await expect(
      withFileLock(resource, async () => "unexpected", 0),
    ).rejects.toThrow("Timed out waiting");
  });
});

it.skipIf(process.platform === "win32")(
  "uses the same lock through a file symlink",
  async () => {
    const resource = path.join(directory, "config");
    const alias = path.join(directory, "alias");
    await fs.writeFile(resource, "original");
    await fs.symlink(resource, alias);
    await withFileLock(resource, async () => {
      await expect(
        withFileLock(alias, async () => "unexpected", 0),
      ).rejects.toThrow("Timed out waiting");
    });
    await withFileLock(alias, async (resolvedPath) => {
      expect(resolvedPath).toBe(await fs.realpath(resource));
    });
  },
);
