import { describe, it, expect, beforeEach, vi } from "vitest";
import { states } from "./loginStates";
import { CLIError } from "./CLIError";

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("bluebird", () => ({
  default: {
    delay: vi.fn().mockResolvedValue(undefined),
  },
}));

import inquirer from "inquirer";

// Helper to create mock page
const createMockPage = () => ({
  $: vi.fn(),
  evaluate: vi.fn(),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  focus: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  keyboard: {
    press: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
  },
});

// Helper to create mock element handle
const createMockElementHandle = () => ({});

describe("loginStates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("states array", () => {
    it("should have 9 states", () => {
      expect(states).toHaveLength(9);
    });

    it("should have unique names for each state", () => {
      const names = states.map((s) => s.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should have all required state names", () => {
      const names = states.map((s) => s.name);
      expect(names).toContain("username input");
      expect(names).toContain("account selection");
      expect(names).toContain("passwordless");
      expect(names).toContain("password input");
      expect(names).toContain("TFA instructions");
      expect(names).toContain("TFA failed");
      expect(names).toContain("TFA code input");
      expect(names).toContain("Remember me");
      expect(names).toContain("Service exception");
    });
  });

  describe("username input handler", () => {
    const getUsernameState = () => states.find((s) => s.name === "username input")!;

    it("should use defaultUsername when noPrompt is true and defaultUsername is provided", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No error message

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "default@example.com", // defaultUsername
        undefined,
        false
      );

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("default@example.com");
    });

    it("should prompt for username when noPrompt is false", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({ username: "user@example.com" });

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false, // noPrompt
        "",
        undefined,
        false
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("user@example.com");
    });

    it("should prompt for username when noPrompt is true but defaultUsername is empty", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({ username: "prompted@example.com" });

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "", // empty defaultUsername
        undefined,
        false
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("prompted@example.com");
    });

    it("should display error message when present", async () => {
      const mockPage = createMockPage();
      const mockError = {};
      mockPage.$.mockResolvedValue(mockError);
      mockPage.evaluate.mockResolvedValue("Error message");
      vi.mocked(inquirer.prompt).mockResolvedValue({ username: "user@example.com" });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false
      );

      expect(consoleSpy).toHaveBeenCalledWith("Error message");
      consoleSpy.mockRestore();
    });
  });

  describe("password input handler", () => {
    const getPasswordState = () => states.find((s) => s.name === "password input")!;

    it("should use defaultPassword when noPrompt is true and no error", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No error

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "",
        "defaultPassword123",
        false
      );

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("defaultPassword123");
    });

    it("should prompt for password when error is present (invalidating default)", async () => {
      const mockPage = createMockPage();
      const mockError = {};
      mockPage.$.mockResolvedValue(mockError);
      mockPage.evaluate.mockResolvedValue("Wrong password");
      vi.mocked(inquirer.prompt).mockResolvedValue({ password: "newPassword" });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt - but error present means we should still prompt
        "",
        "defaultPassword",
        false
      );

      expect(consoleSpy).toHaveBeenCalledWith("Wrong password");
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("newPassword");
      consoleSpy.mockRestore();
    });

    it("should prompt for password when noPrompt is false", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({ password: "userPassword" });

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        "",
        false
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("userPassword");
    });
  });

  describe("account selection handler", () => {
    const getAccountSelectionState = () =>
      states.find((s) => s.name === "account selection")!;

    it("should throw CLIError when no accounts found", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // Neither aadTile nor msaTile found

      await expect(
        getAccountSelectionState().handler(
          mockPage as never,
          createMockElementHandle() as never,
          false,
          "",
          undefined,
          false
        )
      ).rejects.toThrow(CLIError);
      await expect(
        getAccountSelectionState().handler(
          mockPage as never,
          createMockElementHandle() as never,
          false,
          "",
          undefined,
          false
        )
      ).rejects.toThrow("No accounts found on account selection screen.");
    });

    it("should auto-select when only one account is found", async () => {
      const mockPage = createMockPage();
      const mockAadTile = {};
      mockPage.$.mockImplementation((selector: string) => {
        if (selector === "#aadTileTitle") return Promise.resolve(mockAadTile);
        return Promise.resolve(null);
      });
      mockPage.evaluate.mockResolvedValue("Work Account");

      await getAccountSelectionState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false
      );

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mockPage.click).toHaveBeenCalledWith("#aadTileTitle");
    });

    it("should prompt when multiple accounts found", async () => {
      const mockPage = createMockPage();
      const mockAadTile = {};
      const mockMsaTile = {};
      mockPage.$.mockImplementation((selector: string) => {
        if (selector === "#aadTileTitle") return Promise.resolve(mockAadTile);
        if (selector === "#msaTileTitle") return Promise.resolve(mockMsaTile);
        return Promise.resolve(null);
      });
      mockPage.evaluate.mockImplementation((_fn: unknown, el: unknown) => {
        if (el === mockAadTile) return Promise.resolve("Work Account");
        if (el === mockMsaTile) return Promise.resolve("Personal Account");
        return Promise.resolve("");
      });
      vi.mocked(inquirer.prompt).mockResolvedValue({ account: "Personal Account" });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getAccountSelectionState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.click).toHaveBeenCalledWith("#msaTileTitle");
      consoleSpy.mockRestore();
    });
  });

  describe("Remember me handler", () => {
    const getRememberMeState = () => states.find((s) => s.name === "Remember me")!;

    it("should click yes button when rememberMe is true", async () => {
      const mockPage = createMockPage();

      await getRememberMeState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        true // rememberMe
      );

      expect(mockPage.click).toHaveBeenCalledWith("#idSIButton9");
    });

    it("should click no button when rememberMe is false", async () => {
      const mockPage = createMockPage();

      await getRememberMeState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false // rememberMe
      );

      expect(mockPage.click).toHaveBeenCalledWith("#idBtn_Back");
    });
  });

  describe("TFA failed handler", () => {
    const getTfaFailedState = () => states.find((s) => s.name === "TFA failed")!;

    it("should throw CLIError with description message", async () => {
      const mockPage = createMockPage();
      const mockElement = {};
      mockPage.evaluate.mockResolvedValue("Authentication failed. Please try again.");

      await expect(
        getTfaFailedState().handler(
          mockPage as never,
          mockElement as never,
          false,
          "",
          undefined,
          false
        )
      ).rejects.toThrow(CLIError);
      await expect(
        getTfaFailedState().handler(
          mockPage as never,
          mockElement as never,
          false,
          "",
          undefined,
          false
        )
      ).rejects.toThrow("Authentication failed. Please try again.");
    });
  });

  describe("Service exception handler", () => {
    const getServiceExceptionState = () =>
      states.find((s) => s.name === "Service exception")!;

    it("should throw CLIError with service exception message", async () => {
      const mockPage = createMockPage();
      const mockElement = {};
      mockPage.evaluate.mockResolvedValue("Service temporarily unavailable");

      await expect(
        getServiceExceptionState().handler(
          mockPage as never,
          mockElement as never,
          false,
          "",
          undefined,
          false
        )
      ).rejects.toThrow(CLIError);
      await expect(
        getServiceExceptionState().handler(
          mockPage as never,
          mockElement as never,
          false,
          "",
          undefined,
          false
        )
      ).rejects.toThrow("Service temporarily unavailable");
    });
  });

  describe("TFA code input handler", () => {
    const getTfaCodeInputState = () => states.find((s) => s.name === "TFA code input")!;

    it("should prompt for verification code and submit", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No error
      vi.mocked(inquirer.prompt).mockResolvedValue({ verificationCode: "123456" });

      await getTfaCodeInputState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("123456");
      expect(mockPage.click).toHaveBeenCalledWith("input[type=submit]");
    });

    it("should display error message when present", async () => {
      const mockPage = createMockPage();
      const mockError = {};
      mockPage.$.mockResolvedValue(mockError);
      mockPage.evaluate.mockResolvedValue("Invalid code");
      vi.mocked(inquirer.prompt).mockResolvedValue({ verificationCode: "654321" });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaCodeInputState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false
      );

      expect(consoleSpy).toHaveBeenCalledWith("Invalid code");
      consoleSpy.mockRestore();
    });
  });
});
