import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";
import esbuild from "esbuild";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const optionalNativeModules = ["bufferutil", "utf-8-validate"];
const allowedExternalModules = [
  ...optionalNativeModules,
  "supports-color", // debug: optional terminal color detection
  "kerberos", // proxy-agent: optional native Negotiate authentication
  "proxy-agent",
  "yauzl", // @puppeteer/browsers: unused browser download helpers
];
const supplementalLicenses = {
  "proxy-agent-negotiate": ["MIT", "proxy-agents-LICENSE"],
  "@aws-sdk/credential-provider-http": ["Apache-2.0", "aws-sdk-LICENSE"],
  "@aws-sdk/nested-clients": ["Apache-2.0", "aws-sdk-LICENSE"],
  "@aws-sdk/credential-provider-login": ["Apache-2.0", "aws-sdk-LICENSE"],
  "puppeteer-core": ["Apache-2.0", "puppeteer-LICENSE"],
  "@puppeteer/browsers": ["Apache-2.0", "puppeteer-LICENSE"],
};

// Shared by npm, SEA, and browser integration tests so their dependency loading
// (including the ESM proxy agent) stays identical.
export async function buildBundle({
  outfile,
  entryPoints = ["src/index.ts"],
  injectProxyAgent = true,
}) {
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    outfile,
    minify: true,
    // Runtime error handling compares class names such as TargetCloseError.
    keepNames: true,
    banner: {
      js: "// Dependency code bundled and minified by az2aws. See THIRD_PARTY_NOTICES.txt.",
    },
    logLevel: "warning",
    inject: injectProxyAgent
      ? [path.join(repoRoot, "scripts/sea-proxy-agent-shim.mjs")]
      : [],
    metafile: true,
    // ws probes these optional accelerators inside try/catch.
    external: optionalNativeModules,
  });
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      if (
        dependency.external &&
        !isBuiltin(dependency.path) &&
        !allowedExternalModules.includes(dependency.path)
      ) {
        throw new Error(
          `Bundle requires an external dependency: ${dependency.path}`,
        );
      }
    }
  }
  if (
    injectProxyAgent &&
    !Object.keys(result.metafile.inputs).some((input) =>
      /node_modules[\\/]https-proxy-agent[\\/]/.test(input),
    )
  ) {
    throw new Error("Bundle is missing the https-proxy-agent dependency.");
  }
  return result.metafile;
}

export function buildPuppeteerBundle(outfile) {
  return buildBundle({
    outfile,
    entryPoints: ["src/puppeteer.ts"],
    injectProxyAgent: false,
  });
}

// Preserve full license/NOTICE files, not only comments retained by esbuild.
export async function writeDependencyNotices(metafile, destination) {
  const packages = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const normalized = input.replaceAll("\\", "/");
    const match = /^(.*\/)?node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(
      normalized,
    );
    if (!match) continue;
    const directory = path.resolve(
      repoRoot,
      `${match[1] ?? ""}node_modules/${match[2]}`,
    );
    if (packages.has(directory)) continue;
    const manifest = JSON.parse(
      await fs.readFile(path.join(directory, "package.json"), "utf8"),
    );
    const files = (await fs.readdir(directory))
      .filter((name) => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name))
      .sort();
    const notices = [];
    for (const file of files) {
      const filename = path.join(directory, file);
      if ((await fs.stat(filename)).isFile()) {
        notices.push(`${file}\n${await fs.readFile(filename, "utf8")}`);
      }
    }
    if (manifest.name === "chromium-bidi") {
      notices.push(
        await fs.readFile(
          path.join(
            directory,
            "out/Default/gen/src/mapper_bundle_THIRD_PARTY_NOTICES",
          ),
          "utf8",
        ),
      );
    }
    const supplemental = supplementalLicenses[manifest.name];
    if (!notices.length && supplemental?.[0] === manifest.license) {
      notices.push(
        await fs.readFile(
          path.join(repoRoot, "scripts/licenses", supplemental[1]),
          "utf8",
        ),
      );
    }
    if (!notices.length)
      throw new Error(`Missing license text for ${manifest.name}`);
    // Puppeteer vendors several libraries whose plain leading comments are
    // removed by minification. Preserve those complete license blocks too.
    if (manifest.name === "puppeteer-core") {
      for (const input of Object.keys(metafile.inputs).sort()) {
        const relative = path
          .relative(directory, path.resolve(repoRoot, input))
          .replaceAll("\\", "/");
        if (
          !relative.startsWith("lib/third_party/") ||
          !relative.endsWith(".js")
        )
          continue;
        const source = await fs.readFile(path.resolve(repoRoot, input), "utf8");
        const license = source.match(/^\s*\/\*+([\s\S]*?)\*\//)?.[1];
        if (!license || !/license|copyright/i.test(license)) {
          throw new Error(`Missing vendored license: ${relative}`);
        }
        notices.push(`${relative}\n${license.trim()}`);
      }
    }
    packages.set(
      directory,
      `${manifest.name}@${manifest.version} (${manifest.license ?? "see license below"})\n\n${notices.join("\n\n")}`,
    );
  }
  await fs.writeFile(
    destination,
    "Third-party code bundled and minified with esbuild for az2aws.\nOriginal license and attribution texts follow.\n\n" +
      [...packages.values()].sort().join("\n\n" + "=".repeat(80) + "\n\n") +
      "\n",
  );
}
