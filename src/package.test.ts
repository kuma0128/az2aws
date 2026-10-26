import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  buildPuppeteerBundle,
  writeDependencyNotices,
} from "../scripts/bundle.mjs";

it("packages runtime files without local credentials, screenshots, or caches", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "az2aws-package-test-"),
  );
  try {
    await fs.copyFile("package.json", path.join(directory, "package.json"));
    const fixtureFiles = [
      "lib/index.js",
      "lib/login.js",
      "lib/puppeteer.js",
      "lib/THIRD_PARTY_NOTICES.txt",
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
        "lib/puppeteer.js",
        "lib/THIRD_PARTY_NOTICES.txt",
        "package.json",
      ].sort(),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 40_000);

it("loads bundled Puppeteer without node_modules and preserves its licenses", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "az2aws-puppeteer-test-"),
  );
  try {
    const outfile = path.join(directory, "puppeteer.cjs");
    const metafile = await buildPuppeteerBundle(outfile);
    const noticesPath = path.join(directory, "THIRD_PARTY_NOTICES.txt");
    await writeDependencyNotices(metafile, noticesPath);
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        'const p = require(process.argv[1]).default; if (typeof p.launch !== "function") process.exit(1); p.defaultArgs().then(args => console.log(args.includes("--no-first-run")));',
        outfile,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      },
    );
    expect(output.trim()).toBe("true");
    const notices = await fs.readFile(noticesPath, "utf8");
    expect(notices).toContain("puppeteer-core@");
    expect(notices).toContain("chromium-bidi@");
    expect(notices).toContain("Apache License");
    expect(notices).toContain("Jason Miller");
    expect(notices).toContain("Lea Verou");
    expect(notices).toContain("Intel Corporation");
    expect(notices).not.toContain("@aws-sdk/");
    const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
    expect(manifest.dependencies["puppeteer-core"]).toBeUndefined();
    expect(manifest.dependencies["@aws-sdk/client-sts"]).toBeDefined();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 40_000);
