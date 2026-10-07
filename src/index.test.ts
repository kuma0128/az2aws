import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "./login";
import { configureProfileAsync } from "./configureProfileAsync";

vi.mock("./login", () => ({
  login: {
    loginAsync: vi.fn().mockResolvedValue(undefined),
    loginAll: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("./configureProfileAsync", () => ({
  configureProfileAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./updateNotifier", () => ({
  checkForUpdate: vi.fn().mockResolvedValue(undefined),
}));

describe("CLI prompt options", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(process, "on").mockReturnValue(process);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it.each([
    { flags: [], noPrompt: true },
    { flags: ["--no-prompt"], noPrompt: true },
    { flags: ["--prompt"], noPrompt: false },
    { flags: ["--no-prompt", "--prompt"], noPrompt: false },
    { flags: ["--prompt", "--no-prompt"], noPrompt: true },
  ])("passes noPrompt=$noPrompt for $flags", async ({ flags, noPrompt }) => {
    process.argv = ["node", "az2aws", "--profile", "test", ...flags];
    await import("./index");
    expect(login.loginAsync).toHaveBeenCalledTimes(1);
    expect(vi.mocked(login.loginAsync).mock.calls[0][3]).toBe(noPrompt);
  });

  it.each([false, true])(
    "honors --prompt=%s for all profiles",
    async (prompt) => {
      process.argv = [
        "node",
        "az2aws",
        "--all-profiles",
        ...(prompt ? ["--prompt"] : []),
      ];
      await import("./index");
      expect(login.loginAll).toHaveBeenCalledTimes(1);
      expect(vi.mocked(login.loginAll).mock.calls[0][2]).toBe(!prompt);
    },
  );

  it("keeps profile configuration interactive", async () => {
    process.argv = ["node", "az2aws", "--profile", "test", "--configure"];
    await import("./index");
    expect(configureProfileAsync).toHaveBeenCalledWith("test");
    expect(login.loginAsync).not.toHaveBeenCalled();
  });
});
