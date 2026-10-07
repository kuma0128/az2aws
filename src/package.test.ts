import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("packages runtime files without local credentials, screenshots, or caches", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "az2aws-package-test-"),
  );
  try {
    await fs.copyFile("package.json", path.join(directory, "package.json"));
    const fixtureFiles = [
      "lib/index.js",
      "lib/login.js",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "az2aws-unrecognized-state.png",
      ".env",
      ".pnpm-store/index.db",
      "lib/az2aws-unrecognized-state.png",
      "lib/src/login.js",
      "src/login.ts",
      "eslint.config.cjs",
      "pnpm-workspace.yaml",
    ];
    for (const filename of fixtureFiles) {
      const target = path.join(directory, filename);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "synthetic packaging fixture\n");
    }

    // Use a fixed shell command so npm.cmd also works on Windows.
    const output = execSync("npm pack --dry-run --json --ignore-scripts", {
      cwd: directory,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const packages = JSON.parse(output) as
      | Array<{ files: Array<{ path: string }> }>
      | Record<string, { files: Array<{ path: string }> }>;
    const contents = Object.values(packages)[0];
    expect(contents.files.map((file) => file.path).sort()).toEqual(
      [
        "CHANGELOG.md",
        "LICENSE",
        "README.md",
        "lib/index.js",
        "lib/login.js",
        "package.json",
      ].sort(),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 40_000);
