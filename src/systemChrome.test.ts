import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockFsAccess } = vi.hoisted(() => ({ mockFsAccess: vi.fn() }));

vi.mock("fs/promises", () => ({
  default: {
    access: mockFsAccess,
  },
}));

import {
  detectSystemChromeAsync,
  isSystemChromeDetectionDisabled,
} from "./systemChrome";

const CHROME_MAC =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EDGE_MAC =
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";

describe("detectSystemChromeAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return Chrome on macOS when installed", async () => {
    mockFsAccess.mockImplementation((candidate: string) =>
      candidate === CHROME_MAC
        ? Promise.resolve()
        : Promise.reject(new Error("ENOENT")),
    );

    await expect(detectSystemChromeAsync("darwin", {})).resolves.toBe(
      CHROME_MAC,
    );
  });

  it("should fall back to Edge on macOS when Chrome is missing", async () => {
    mockFsAccess.mockImplementation((candidate: string) =>
      candidate === EDGE_MAC
        ? Promise.resolve()
        : Promise.reject(new Error("ENOENT")),
    );

    await expect(detectSystemChromeAsync("darwin", {})).resolves.toBe(EDGE_MAC);
  });

  it("should prefer Chrome over Edge when both are installed", async () => {
    mockFsAccess.mockResolvedValue(undefined);

    await expect(detectSystemChromeAsync("darwin", {})).resolves.toBe(
      CHROME_MAC,
    );
  });

  it("should return undefined when no browser is installed", async () => {
    mockFsAccess.mockRejectedValue(new Error("ENOENT"));

    await expect(
      detectSystemChromeAsync("darwin", {}),
    ).resolves.toBeUndefined();
  });

  it("should detect Chrome on Linux", async () => {
    mockFsAccess.mockImplementation((candidate: string) =>
      candidate === "/usr/bin/google-chrome-stable"
        ? Promise.resolve()
        : Promise.reject(new Error("ENOENT")),
    );

    await expect(detectSystemChromeAsync("linux", {})).resolves.toBe(
      "/usr/bin/google-chrome-stable",
    );
  });

  it("should build Windows candidates from environment variables", async () => {
    const env = {
      PROGRAMFILES: "C:\\Program Files",
      "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\alice\\AppData\\Local",
    };
    mockFsAccess.mockImplementation((candidate: string) =>
      candidate.includes("AppData") && candidate.endsWith("chrome.exe")
        ? Promise.resolve()
        : Promise.reject(new Error("ENOENT")),
    );

    const detected = await detectSystemChromeAsync("win32", env);
    expect(detected).toContain("AppData");
    expect(detected).toContain("chrome.exe");
  });

  it("should return undefined on Windows when no base directories are set", async () => {
    mockFsAccess.mockRejectedValue(new Error("ENOENT"));

    await expect(detectSystemChromeAsync("win32", {})).resolves.toBeUndefined();
    expect(mockFsAccess).not.toHaveBeenCalled();
  });
});

describe("isSystemChromeDetectionDisabled", () => {
  it("should be enabled by default", () => {
    expect(isSystemChromeDetectionDisabled({})).toBe(false);
  });

  it.each(["0", "false", "FALSE"])(
    "should be disabled when BROWSER_USE_SYSTEM_CHROME=%s",
    (value) => {
      expect(
        isSystemChromeDetectionDisabled({ BROWSER_USE_SYSTEM_CHROME: value }),
      ).toBe(true);
    },
  );

  it("should stay enabled for other values", () => {
    expect(
      isSystemChromeDetectionDisabled({ BROWSER_USE_SYSTEM_CHROME: "1" }),
    ).toBe(false);
  });

  it("should be disabled in CI environments", () => {
    expect(isSystemChromeDetectionDisabled({ CI: "true" })).toBe(true);
    expect(isSystemChromeDetectionDisabled({ GITHUB_ACTIONS: "true" })).toBe(
      true,
    );
  });
});
