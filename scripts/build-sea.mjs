#!/usr/bin/env node
// Build a standalone az2aws executable with Node Single Executable
// Applications (SEA): bundle the CLI with esbuild, generate the SEA blob, and
// inject it into the official Node.js binary for the requested target.
//
// Usage:
//   node scripts/build-sea.mjs [--target <target>] [--archive]
//
// Targets: linux-x64, linux-arm64, darwin-x64, darwin-arm64, win-x64
// (darwin targets must be built on macOS because injection re-signs the
// binary with codesign; the blob itself is platform-independent).
//
// The Node.js runtime downloaded for the target matches the version running
// this script, so CI pins the runtime through actions/setup-node.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import postject from "postject";

const SUPPORTED_TARGETS = [
  "linux-x64",
  "linux-arm64",
  "darwin-x64",
  "darwin-arm64",
  "win-x64",
];
// Fixed fuse from the Node.js SEA documentation.
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function downloadAsync(url) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed with HTTP ${res.status}: ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function verifyNodeDownload(data, shasums, assetName) {
  let expectedDigest;
  for (const line of shasums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (match?.[2] === assetName) {
      expectedDigest = match[1].toLowerCase();
      break;
    }
  }

  if (!expectedDigest) {
    throw new Error(`No checksum found for '${assetName}' in SHASUMS256.txt.`);
  }

  const actualDigest = crypto.createHash("sha256").update(data).digest("hex");
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `Checksum mismatch for '${assetName}': expected ${expectedDigest}, received ${actualDigest}.`,
    );
  }
  console.log(`Verified ${assetName} (sha256 ${actualDigest})`);
}

const hostTarget = `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
const target = argValue("--target") ?? hostTarget;
if (!SUPPORTED_TARGETS.includes(target)) {
  throw new Error(
    `Unsupported target '${target}'. Supported: ${SUPPORTED_TARGETS.join(", ")}`,
  );
}
const isDarwinTarget = target.startsWith("darwin");
const isWindowsTarget = target === "win-x64";
if (isDarwinTarget && process.platform !== "darwin") {
  throw new Error(
    "darwin targets must be built on macOS (codesign is required).",
  );
}

const seaDir = path.join(repoRoot, "dist", "sea");
const binDir = path.join(repoRoot, "dist", "bin");
fs.rmSync(seaDir, { recursive: true, force: true });
fs.mkdirSync(seaDir, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });

// --- 1. Bundle the CLI into a single CommonJS file ---------------------------
const bundlePath = path.join(seaDir, "az2aws.cjs");
const bundleResult = await esbuild.build({
  entryPoints: [path.join(repoRoot, "src", "index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile: bundlePath,
  minify: true,
  // Error-type checks compare error.name (e.g. puppeteer-core's
  // TargetCloseError); keep original class/function names under minification.
  keepNames: true,
  logLevel: "warning",
  inject: [path.join(repoRoot, "scripts", "sea-proxy-agent-shim.mjs")],
  metafile: true,
  // Optional native accelerators probed by ws inside try/catch; leaving them
  // external keeps the probe a harmless runtime miss instead of a build error.
  external: ["bufferutil", "utf-8-validate"],
});

if (
  !Object.keys(bundleResult.metafile.inputs).some((input) =>
    /node_modules[\\/]https-proxy-agent[\\/]/.test(input),
  )
) {
  throw new Error("SEA bundle is missing the https-proxy-agent dependency.");
}

// SEA evaluates the main script directly; drop the CLI shebang line.
const bundleSource = fs.readFileSync(bundlePath, "utf8");
if (bundleSource.startsWith("#!")) {
  fs.writeFileSync(bundlePath, bundleSource.slice(bundleSource.indexOf("\n") + 1));
}

// --- 2. Generate the (platform-independent) SEA blob -------------------------
const seaConfigPath = path.join(seaDir, "sea-config.json");
const blobPath = path.join(seaDir, "az2aws.blob");
fs.writeFileSync(
  seaConfigPath,
  JSON.stringify({
    main: bundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
  stdio: "inherit",
});

// --- 3. Fetch the official Node.js binary for the target ---------------------
const nodeVersion = process.version;
const nodeDistributionUrl = `https://nodejs.org/dist/${nodeVersion}`;
const nodeShasums = (
  await downloadAsync(`${nodeDistributionUrl}/SHASUMS256.txt`)
).toString("utf8");
const outPath = path.join(
  binDir,
  `az2aws-${target}${isWindowsTarget ? ".exe" : ""}`,
);

if (isWindowsTarget) {
  const assetName = "win-x64/node.exe";
  const nodeBinary = await downloadAsync(
    `${nodeDistributionUrl}/${assetName}`,
  );
  verifyNodeDownload(nodeBinary, nodeShasums, assetName);
  fs.writeFileSync(outPath, nodeBinary);
} else {
  const tarName = `node-${nodeVersion}-${target}`;
  const assetName = `${tarName}.tar.gz`;
  const tarPath = path.join(seaDir, `${tarName}.tar.gz`);
  const nodeArchive = await downloadAsync(
    `${nodeDistributionUrl}/${assetName}`,
  );
  verifyNodeDownload(nodeArchive, nodeShasums, assetName);
  fs.writeFileSync(tarPath, nodeArchive);
  const nodeBinary = execFileSync(
    "tar",
    ["-xzf", tarPath, "-O", `${tarName}/bin/node`],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  fs.writeFileSync(outPath, nodeBinary);
}

// --- 4. Inject the blob (and re-sign on macOS) --------------------------------
if (isDarwinTarget) {
  execFileSync("codesign", ["--remove-signature", outPath], {
    stdio: "inherit",
  });
}
await postject.inject(outPath, "NODE_SEA_BLOB", fs.readFileSync(blobPath), {
  sentinelFuse: SEA_FUSE,
  ...(isDarwinTarget ? { machoSegmentName: "NODE_SEA" } : {}),
});
if (isDarwinTarget) {
  execFileSync("codesign", ["--sign", "-", outPath], { stdio: "inherit" });
}
if (!isWindowsTarget) {
  fs.chmodSync(outPath, 0o755);
}
console.log(`Built ${outPath}`);

// --- 5. Smoke test when the binary can run on this host ----------------------
if (target === hostTarget) {
  const reportedVersion = execFileSync(outPath, ["--version"], {
    encoding: "utf8",
  }).trim();
  const expectedVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version;
  if (reportedVersion !== expectedVersion) {
    throw new Error(
      `Smoke test failed: --version printed '${reportedVersion}', expected '${expectedVersion}'`,
    );
  }
  console.log(`Smoke test passed: --version -> ${reportedVersion}`);
} else {
  console.log(`Skipping smoke test (host is ${hostTarget}, target ${target})`);
}

// --- 6. Optionally create the release archive + checksum ---------------------
if (hasFlag("--archive")) {
  const releaseDir = path.join(repoRoot, "dist", "release");
  fs.mkdirSync(releaseDir, { recursive: true });

  const [osPart, archPart] = target.split("-");
  const osName = isWindowsTarget ? "windows" : osPart;
  const binaryName = isWindowsTarget ? "az2aws.exe" : "az2aws";
  const assetPath = path.join(
    releaseDir,
    `az2aws-${osName}-${archPart}.${isWindowsTarget ? "zip" : "tar.gz"}`,
  );

  const stageDir = path.join(seaDir, `stage-${target}`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  fs.copyFileSync(outPath, path.join(stageDir, binaryName));
  if (!isWindowsTarget) {
    fs.chmodSync(path.join(stageDir, binaryName), 0o755);
  }

  fs.rmSync(assetPath, { force: true });
  if (isWindowsTarget) {
    // bsdtar (preinstalled on all GitHub runners) picks zip from the extension.
    // A drive-qualified archive path (for example D:\\...) is interpreted as
    // a remote archive by tar, so run inside the stage directory and pass a
    // relative path with portable separators instead.
    const relativeAssetPath = path
      .relative(stageDir, assetPath)
      .split(path.sep)
      .join("/");
    execFileSync("tar", ["-a", "-cf", relativeAssetPath, binaryName], {
      cwd: stageDir,
      stdio: "inherit",
    });
  } else {
    execFileSync("tar", ["-czf", assetPath, "-C", stageDir, binaryName], {
      stdio: "inherit",
    });
  }

  const digest = crypto
    .createHash("sha256")
    .update(fs.readFileSync(assetPath))
    .digest("hex");
  fs.writeFileSync(
    `${assetPath}.sha256`,
    `${digest}  ${path.basename(assetPath)}\n`,
  );
  console.log(`Created ${assetPath} (sha256 ${digest})`);
}
