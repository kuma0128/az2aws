import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveErrorScreenshotAsync } from "./errorScreenshot";

describe("error screenshot files", () => {
  let directory: string;
  const image = Buffer.from("test screenshot bytes");

  beforeEach(async () => {
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "az2aws-screenshot-test-"),
    );
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("writes the captured bytes with private permissions from creation", async () => {
    const output = path.join(directory, "login.png");
    const page = { screenshot: vi.fn().mockResolvedValue(image) };
    await saveErrorScreenshotAsync(page, output);
    expect(await fs.readFile(output)).toEqual(image);
    expect(page.screenshot).toHaveBeenCalledWith({ type: "png" });
    if (process.platform !== "win32") {
      expect((await fs.stat(output)).mode & 0o777).toBe(0o600);
    }
  });

  it("refuses to overwrite an existing file", async () => {
    const output = path.join(directory, "login.png");
    await fs.writeFile(output, "existing content", { mode: 0o644 });
    const page = { screenshot: vi.fn().mockResolvedValue(image) };
    await expect(saveErrorScreenshotAsync(page, output)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await fs.readFile(output, "utf8")).toBe("existing content");
  });

  it.skipIf(process.platform === "win32")(
    "refuses existing and dangling symbolic links without changing their targets",
    async () => {
      const target = path.join(directory, "target");
      const output = path.join(directory, "login.png");
      const page = { screenshot: vi.fn().mockResolvedValue(image) };
      await fs.writeFile(target, "untouched");
      await fs.symlink(target, output);
      await expect(
        saveErrorScreenshotAsync(page, output),
      ).rejects.toMatchObject({
        code: "EEXIST",
      });
      expect(await fs.readFile(target, "utf8")).toBe("untouched");
      await fs.unlink(target);
      await expect(
        saveErrorScreenshotAsync(page, output),
      ).rejects.toMatchObject({
        code: "EEXIST",
      });
      await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("does not create a file when browser capture fails", async () => {
    const output = path.join(directory, "login.png");
    const page = {
      screenshot: vi.fn().mockRejectedValue(new Error("capture failed")),
    };
    await expect(saveErrorScreenshotAsync(page, output)).rejects.toThrow(
      "capture failed",
    );
    expect(await fs.readdir(directory)).toEqual([]);
  });
});
