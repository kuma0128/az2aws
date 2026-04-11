import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import path from "path";

describe("paths", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("os");
    vi.doUnmock("path");
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.doUnmock("os");
    vi.doUnmock("path");
    process.env = originalEnv;
  });

  it("should have awsDir set to ~/.aws", async () => {
    const { paths } = await import("./paths");
    const expectedAwsDir = path.join(os.homedir(), ".aws");
    expect(paths.awsDir).toBe(expectedAwsDir);
  });

  it("should use default config path when AWS_CONFIG_FILE is not set", async () => {
    delete process.env.AWS_CONFIG_FILE;
    const { paths } = await import("./paths");
    const expectedConfigPath = path.join(os.homedir(), ".aws", "config");
    expect(paths.config).toBe(expectedConfigPath);
  });

  it("should use AWS_CONFIG_FILE when set", async () => {
    process.env.AWS_CONFIG_FILE = "/custom/path/config";
    const { paths } = await import("./paths");
    expect(paths.config).toBe("/custom/path/config");
  });

  it("should use default credentials path when AWS_SHARED_CREDENTIALS_FILE is not set", async () => {
    delete process.env.AWS_SHARED_CREDENTIALS_FILE;
    const { paths } = await import("./paths");
    const expectedCredentialsPath = path.join(
      os.homedir(),
      ".aws",
      "credentials",
    );
    expect(paths.credentials).toBe(expectedCredentialsPath);
  });

  it("should use AWS_SHARED_CREDENTIALS_FILE when set", async () => {
    process.env.AWS_SHARED_CREDENTIALS_FILE = "/custom/path/credentials";
    const { paths } = await import("./paths");
    expect(paths.credentials).toBe("/custom/path/credentials");
  });

  it("should have chromium path set under awsDir", async () => {
    const { paths } = await import("./paths");
    const expectedChromiumPath = path.join(os.homedir(), ".aws", "chromium");
    expect(paths.chromium).toBe(expectedChromiumPath);
  });

  it("should read BROWSER_CHROME_BIN from environment", async () => {
    process.env.BROWSER_CHROME_BIN = "/usr/bin/chrome";
    const { paths } = await import("./paths");
    expect(paths.chromeBin).toBe("/usr/bin/chrome");
  });

  it("should read BROWSER_USER_DATA_DIR from environment", async () => {
    process.env.BROWSER_USER_DATA_DIR = "/home/user/.config/chrome";
    const { paths } = await import("./paths");
    expect(paths.userDataDir).toBe("/home/user/.config/chrome");
  });

  it("should read BROWSER_PROFILE_DIR from environment", async () => {
    process.env.BROWSER_PROFILE_DIR = "Default";
    const { paths } = await import("./paths");
    expect(paths.profileDir).toBe("Default");
  });

  it("should support Windows default paths and browser environment values", async () => {
    delete process.env.AWS_CONFIG_FILE;
    delete process.env.AWS_SHARED_CREDENTIALS_FILE;
    process.env.BROWSER_CHROME_BIN =
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    process.env.BROWSER_USER_DATA_DIR =
      "C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data";
    process.env.BROWSER_PROFILE_DIR = "Profile 2";

    vi.doMock("os", () => ({
      default: {
        homedir: () => "C:\\Users\\alice",
      },
    }));
    vi.doMock("path", async () => {
      const actual = await vi.importActual<typeof import("path")>("path");
      return {
        ...actual,
        ...actual.win32,
        default: actual.win32,
      };
    });

    const { paths } = await import("./paths");

    expect(paths.awsDir).toBe("C:\\Users\\alice\\.aws");
    expect(paths.config).toBe("C:\\Users\\alice\\.aws\\config");
    expect(paths.credentials).toBe("C:\\Users\\alice\\.aws\\credentials");
    expect(paths.chromium).toBe("C:\\Users\\alice\\.aws\\chromium");
    expect(paths.chromeBin).toBe(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
    expect(paths.userDataDir).toBe(
      "C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data",
    );
    expect(paths.profileDir).toBe("Profile 2");
  });
});
