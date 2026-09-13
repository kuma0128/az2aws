import fs from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { CLIError } from "./CLIError";

/** Lock the resource across CLI processes, including through directory symlinks. */
export async function withFileLock<T>(
  resource: string,
  operation: (resolvedPath: string) => Promise<T>,
  timeoutMs = 30_000,
): Promise<T> {
  const absolutePath = path.resolve(resource);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    resolvedPath = path.join(
      await fs.realpath(path.dirname(absolutePath)),
      path.basename(absolutePath),
    );
  }

  // Keep the lock beside the resource: browser recovery may delete its data
  // directory, and atomic config writes replace the file's inode.
  let release: () => Promise<void>;
  try {
    release = await lock(resolvedPath, {
      realpath: false,
      stale: 30_000,
      update: 10_000,
      retries: {
        retries: Math.ceil(timeoutMs / 100),
        minTimeout: 100,
        maxTimeout: 100,
        factor: 1,
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") {
      throw new CLIError(
        "Timed out waiting for another az2aws process to finish. Retry after it completes.",
      );
    }
    throw error;
  }
  try {
    return await operation(resolvedPath);
  } finally {
    await release();
  }
}
