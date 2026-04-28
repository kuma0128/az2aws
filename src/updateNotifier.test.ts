import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import https from "https";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { checkForUpdate } from "./updateNotifier";

vi.mock("fs");
vi.mock("https");

function createMockResponse(body: string, statusCode = 200) {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    resume: () => void;
  };
  res.statusCode = statusCode;
  res.resume = vi.fn();
  process.nextTick(() => {
    res.emit("data", Buffer.from(body));
    res.emit("end");
  });
  return res;
}

function createMockRequest() {
  const req = new EventEmitter() as EventEmitter & { destroy: () => void };
  req.destroy = vi.fn();
  return req;
}

describe("checkForUpdate", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(
    process,
    "platform",
  )!;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as never);
    vi.mocked(fs.chmodSync).mockImplementation(() => undefined as never);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", originalPlatformDescriptor);
    vi.restoreAllMocks();
  });

  it("should show update message when a newer version is available", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0");

    expect(message).toContain("Update available!");
    expect(message).toContain("1.5.0 -> 2.0.0");
    expect(message).toContain("npm install -g az2aws");
    expect(message).not.toContain("mise use -g npm:az2aws");
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(
        `${process.platform === "win32" ? "\\" : "/"}az2aws`,
      ),
      { recursive: true, mode: 0o700 },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("update-check.json"),
      expect.any(String),
      { mode: 0o600 },
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should colorize the update message when color output is enabled", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0", { useColor: true });

    expect(message).toContain("\u001b[33m");
    expect(message).toContain("\u001b[0m");
    expect(message).toContain("Update available!");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should not show message when already on latest version", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "1.5.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0");

    expect(message).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should not show message when on a newer version than registry", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "1.4.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0");

    expect(message).toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should use cached version if cache is fresh", async () => {
    const cache = JSON.stringify({
      latestVersion: "3.0.0",
      checkedAt: Date.now(),
    });
    vi.mocked(fs.readFileSync).mockReturnValue(cache);

    const message = await checkForUpdate("1.5.0");

    expect(https.get).not.toHaveBeenCalled();
    expect(message).toContain("1.5.0 -> 3.0.0");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should ignore expired cache and fetch fresh data", async () => {
    const expiredCache = JSON.stringify({
      latestVersion: "2.0.0",
      checkedAt: Date.now() - 1000 * 60 * 60 * 7, // 7 hours ago
    });
    vi.mocked(fs.readFileSync).mockReturnValue(expiredCache);

    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.1.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0");

    expect(https.get).toHaveBeenCalled();
    expect(message).toContain("1.5.0 -> 2.1.0");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should tailor the update command for mise installs", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0", { installMethod: "mise" });

    expect(message).toContain("Run: mise use -g npm:az2aws");
    expect(message).not.toContain("npm install -g az2aws");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should use npm when install method is unknown", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    const message = await checkForUpdate("1.5.0", { installMethod: "unknown" });

    expect(message).toContain("Run: npm install -g az2aws");
    expect(message).not.toContain("mise use -g npm:az2aws");
    expect(message).not.toContain("snap refresh");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should allow forcing the latest version through an environment variable", async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        latestVersion: "1.5.0",
        checkedAt: Date.now(),
      }),
    );

    const message = await checkForUpdate("1.5.0", {
      env: { AZ2AWS_FAKE_LATEST_VERSION: "9.9.9" },
    });

    expect(message).toContain("1.5.0 -> 9.9.9");
    expect(https.get).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("should use LOCALAPPDATA for the Windows update cache when available", async () => {
    Object.defineProperty(process, "platform", {
      ...originalPlatformDescriptor,
      value: "win32",
    });
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\alice");

    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    await checkForUpdate("1.5.0", {
      env: { LOCALAPPDATA: "C:\\Users\\alice\\AppData\\Local" },
    });

    const expectedDir = path.win32.join(
      "C:\\Users\\alice\\AppData\\Local",
      "az2aws",
    );
    const expectedPath = path.win32.join(expectedDir, "update-check.json");
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
      mode: 0o700,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      { mode: 0o600 },
    );
  });

  it("should fall back to APPDATA for the Windows update cache", async () => {
    Object.defineProperty(process, "platform", {
      ...originalPlatformDescriptor,
      value: "win32",
    });
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\alice");

    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    await checkForUpdate("1.5.0", {
      env: { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" },
    });

    const expectedDir = path.win32.join(
      "C:\\Users\\alice\\AppData\\Roaming",
      "az2aws",
    );
    const expectedPath = path.win32.join(expectedDir, "update-check.json");
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
      mode: 0o700,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      { mode: 0o600 },
    );
  });

  it("should fall back to the home directory for the Windows update cache", async () => {
    Object.defineProperty(process, "platform", {
      ...originalPlatformDescriptor,
      value: "win32",
    });
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\alice");

    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    await checkForUpdate("1.5.0", { env: {} });

    const expectedDir = path.win32.join("C:\\Users\\alice", "az2aws");
    const expectedPath = path.win32.join(expectedDir, "update-check.json");
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
      mode: 0o700,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      { mode: 0o600 },
    );
  });

  it("should fall back past empty-string env vars on Windows", async () => {
    Object.defineProperty(process, "platform", {
      ...originalPlatformDescriptor,
      value: "win32",
    });
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\alice");

    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, cb) => {
      const callback = cb as (res: EventEmitter) => void;
      callback(createMockResponse(JSON.stringify({ version: "2.0.0" })));
      return req as never;
    });

    await checkForUpdate("1.5.0", {
      env: { LOCALAPPDATA: "", APPDATA: "  " },
    });

    const expectedDir = path.win32.join("C:\\Users\\alice", "az2aws");
    const expectedPath = path.win32.join(expectedDir, "update-check.json");
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, "utf-8");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, {
      recursive: true,
      mode: 0o700,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      { mode: 0o600 },
    );
  });

  it("should silently fail on network error", async () => {
    const req = createMockRequest();
    vi.mocked(https.get).mockImplementation((_url, _opts, _cb) => {
      process.nextTick(() => req.emit("error", new Error("Network error")));
      return req as never;
    });

    await expect(checkForUpdate("1.5.0")).resolves.toBeNull();
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
