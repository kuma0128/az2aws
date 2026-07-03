import { constants } from "fs";
import fs from "fs/promises";
import path from "path";
import _debug from "debug";

const debug = _debug("az2aws");

// Entra ID can treat the bundled Chrome for Testing browser as untrusted
// (e.g., refusing to reuse sign-in sessions), so prefer a real system
// browser when one is installed. Chrome is preferred over Edge; both are
// Chromium-based and work with the same launch options.
const DARWIN_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const LINUX_CANDIDATES = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/opt/google/chrome/chrome",
  "/usr/bin/microsoft-edge",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const WINDOWS_RELATIVE_CANDIDATES = [
  path.join("Google", "Chrome", "Application", "chrome.exe"),
  path.join("Microsoft", "Edge", "Application", "msedge.exe"),
];

function windowsCandidates(env: NodeJS.ProcessEnv): string[] {
  const bases = [
    env["PROGRAMFILES"],
    env["PROGRAMFILES(X86)"],
    env["LOCALAPPDATA"],
  ].filter((base): base is string => !!base);

  const candidates: string[] = [];
  for (const relativeCandidate of WINDOWS_RELATIVE_CANDIDATES) {
    for (const base of bases) {
      candidates.push(path.join(base, relativeCandidate));
    }
  }
  return candidates;
}

export function isSystemChromeDetectionDisabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const optOut = (env.BROWSER_USE_SYSTEM_CHROME || "").toLowerCase();
  if (optOut === "0" || optOut === "false") {
    return true;
  }

  // CI environments should keep using the pinned bundled browser for
  // reproducibility.
  return !!env.CI || !!env.GITHUB_ACTIONS;
}

export async function detectSystemChromeAsync(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  let candidates: string[];
  if (platform === "darwin") {
    candidates = DARWIN_CANDIDATES;
  } else if (platform === "win32") {
    candidates = windowsCandidates(env);
  } else {
    candidates = LINUX_CANDIDATES;
  }

  for (const candidate of candidates) {
    try {
      await fs.access(candidate, constants.X_OK);
      debug(`Detected system browser: ${candidate}`);
      return candidate;
    } catch {
      // Not installed at this location; try the next candidate.
    }
  }

  debug("No system browser detected; using the bundled browser");
  return undefined;
}
