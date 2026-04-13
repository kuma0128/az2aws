import https from "https";
import fs from "fs";
import path from "path";
import os from "os";

const PACKAGE_NAME = "az2aws";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const FAKE_LATEST_VERSION_ENV = "AZ2AWS_FAKE_LATEST_VERSION";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_RESET = "\u001b[0m";
const CONFIG_DIR_MODE = 0o700;
const CACHE_FILE_MODE = 0o600;

type InstallMethod = "mise" | "snap" | "unknown";

interface CacheData {
  latestVersion: string;
  checkedAt: number;
}

interface CheckForUpdateOptions {
  env?: NodeJS.ProcessEnv;
  executablePath?: string;
  installMethod?: InstallMethod;
  useColor?: boolean;
}

function getCachePath(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === "win32") {
    const cacheRoot =
      env.LOCALAPPDATA?.trim() || env.APPDATA?.trim() || os.homedir();
    return path.win32.join(cacheRoot, PACKAGE_NAME, "update-check.json");
  }

  return path.join(os.homedir(), ".config", PACKAGE_NAME, "update-check.json");
}

function readCache(env: NodeJS.ProcessEnv = process.env): CacheData | null {
  try {
    const data = fs.readFileSync(getCachePath(env), "utf-8");
    const cache = JSON.parse(data) as CacheData;
    if (Date.now() - cache.checkedAt < CACHE_TTL_MS) {
      return cache;
    }
  } catch {
    // Cache doesn't exist or is invalid
  }
  return null;
}

function writeCache(
  latestVersion: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  try {
    const cachePath = getCachePath(env);
    const pathModule = process.platform === "win32" ? path.win32 : path;
    const dir = pathModule.dirname(cachePath);
    fs.mkdirSync(dir, { recursive: true, mode: CONFIG_DIR_MODE });
    if (process.platform !== "win32") {
      fs.chmodSync(dir, CONFIG_DIR_MODE);
    }
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ latestVersion, checkedAt: Date.now() }),
      { mode: CACHE_FILE_MODE },
    );
    if (process.platform !== "win32") {
      fs.chmodSync(cachePath, CACHE_FILE_MODE);
    }
  } catch {
    // Ignore cache write failures
  }
}

function compareVersions(current: string, latest: string): number {
  const currentParts = current.split(".").map(Number);
  const latestParts = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
}

function fetchLatestVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
    const req = https.get(url, { timeout: 3000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(
          new Error(`Unexpected npm registry status code: ${res.statusCode}`),
        );
        return;
      }

      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(body) as { version: string };
          resolve(data.version);
        } catch {
          reject(new Error("Failed to parse npm registry response"));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

function detectInstallMethod(
  env: NodeJS.ProcessEnv,
  executablePath: string | undefined,
): InstallMethod {
  if (env.SNAP) {
    return "snap";
  }

  if (executablePath?.includes(`${path.sep}mise${path.sep}`)) {
    return "mise";
  }

  return "unknown";
}

function getForcedLatestVersion(env: NodeJS.ProcessEnv): string | null {
  const forcedLatestVersion = env[FAKE_LATEST_VERSION_ENV]?.trim();
  return forcedLatestVersion ? forcedLatestVersion : null;
}

function getUpdateInstructions(installMethod: InstallMethod): string {
  switch (installMethod) {
    case "mise":
      return `Run: mise use -g npm:${PACKAGE_NAME}`;
    case "snap":
      return `Run: sudo snap refresh ${PACKAGE_NAME}`;
    default:
      return `Run: npm install -g ${PACKAGE_NAME}`;
  }
}

function createUpdateMessage(
  currentVersion: string,
  latestVersion: string,
  installMethod: InstallMethod,
  useColor = false,
): string {
  const message = [
    "",
    `Update available! ${currentVersion} -> ${latestVersion}`,
    getUpdateInstructions(installMethod),
    "",
  ].join("\n");

  return useColor ? `${ANSI_YELLOW}${message}${ANSI_RESET}` : message;
}

export async function checkForUpdate(
  currentVersion: string,
  options: CheckForUpdateOptions = {},
): Promise<string | null> {
  try {
    const env = options.env ?? process.env;
    const forcedLatestVersion = getForcedLatestVersion(env);
    let latestVersion: string;

    if (forcedLatestVersion) {
      latestVersion = forcedLatestVersion;
    } else {
      const cache = readCache(env);
      if (cache) {
        latestVersion = cache.latestVersion;
      } else {
        latestVersion = await fetchLatestVersion();
        writeCache(latestVersion, env);
      }
    }

    if (compareVersions(currentVersion, latestVersion) > 0) {
      const installMethod =
        options.installMethod ??
        detectInstallMethod(env, options.executablePath ?? process.argv[1]);

      return createUpdateMessage(
        currentVersion,
        latestVersion,
        installMethod,
        options.useColor ?? false,
      );
    }
  } catch {
    // Silently ignore update check failures
  }

  return null;
}
