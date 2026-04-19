const fs = require("node:fs");
const path = require("node:path");

const lockfilePath = path.join(__dirname, "..", "pnpm-lock.yaml");
const lockfile = fs.readFileSync(lockfilePath, "utf8");
const documentMarkers = [...lockfile.matchAll(/^---\s*$/gm)];

if (documentMarkers.length > 1) {
  console.error(
    [
      "pnpm-lock.yaml contains multiple YAML documents.",
      "This usually means a standalone pnpm binary prepended packageManagerDependencies.",
      "Use the repo's Corepack path instead of a globally managed pnpm and restore the lockfile before retrying.",
    ].join(" "),
  );
  process.exit(1);
}

console.log("pnpm-lock.yaml uses a single YAML document.");
