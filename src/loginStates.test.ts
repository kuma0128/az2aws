import { describe, it, expect, beforeEach, vi } from "vitest";
import { states } from "./loginStates";
import { CLIError } from "./CLIError";

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

import inquirer from "inquirer";

// Helper to create mock page
const createMockPage = () => ({
  $: vi.fn(),
  $eval: vi.fn().mockResolvedValue(undefined),
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
    const getUsernameState = () =>
      states.find((s) => s.name === "username input")!;

    it("should use defaultUsername when noPrompt is true and defaultUsername is provided", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No error message

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "default@example.com", // defaultUsername
        undefined,
        false,
      );

      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith(
        "default@example.com",
      );
    });

    it("should prompt for username when noPrompt is false", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        username: "user@example.com",
      });

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false, // noPrompt
        "",
        undefined,
        false,
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("user@example.com");
    });

    it("should prompt for username when noPrompt is true but defaultUsername is empty", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        username: "prompted@example.com",
      });

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "", // empty defaultUsername
        undefined,
        false,
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith(
        "prompted@example.com",
      );
    });

    it("should display error message when present", async () => {
      const mockPage = createMockPage();
      const mockError = {};
      mockPage.$.mockResolvedValue(mockError);
      mockPage.evaluate.mockResolvedValue("Error message");
      vi.mocked(inquirer.prompt).mockResolvedValue({
        username: "user@example.com",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      expect(consoleSpy).toHaveBeenCalledWith("Error message");
      consoleSpy.mockRestore();
    });

    it("should wait for input, focus, clear, type, and submit", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);

      await getUsernameState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true,
        "test@example.com",
        undefined,
        false,
      );

      // Should wait for username input to be visible
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        'input[name="loginfmt"]',
        { visible: true, timeout: 60000 },
      );

      // Should focus on username input
      expect(mockPage.focus).toHaveBeenCalledWith('input[name="loginfmt"]');

      // Should select all text and delete with single backspace
      expect(mockPage.$eval).toHaveBeenCalledWith(
        'input[name="loginfmt"]',
        expect.any(Function),
      );
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");

      // Should type username
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("test@example.com");

      // Should wait for submit button and click
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "input[type=submit]",
        { visible: true, timeout: 60000 },
      );
      expect(mockPage.click).toHaveBeenCalledWith("input[type=submit]");
    });
  });

  describe("password input handler", () => {
    const getPasswordState = () =>
      states.find((s) => s.name === "password input")!;

    it("should use defaultPassword when noPrompt is true and no error", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No error

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "",
        "defaultPassword123",
        false,
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
        false,
      );

      expect(consoleSpy).toHaveBeenCalledWith("Wrong password");
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("newPassword");
      consoleSpy.mockRestore();
    });

    it("should prompt for password when noPrompt is false", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        password: "userPassword",
      });

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        "",
        false,
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("userPassword");
    });

    it("should prompt for password when noPrompt is true but defaultPassword is empty", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        password: "promptedPassword",
      });

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true, // noPrompt
        "",
        "", // empty defaultPassword
        false,
      );

      // Should still prompt because defaultPassword is empty
      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("promptedPassword");
    });

    it("should focus, clear input, type password, and submit form", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);

      const callOrder: string[] = [];
      mockPage.focus.mockImplementation(() => {
        callOrder.push("focus");
        return Promise.resolve();
      });
      mockPage.$eval.mockImplementation(() => {
        callOrder.push("$eval");
        return Promise.resolve();
      });
      mockPage.keyboard.press.mockImplementation(() => {
        callOrder.push("press");
        return Promise.resolve();
      });
      mockPage.keyboard.type.mockImplementation(() => {
        callOrder.push("type");
        return Promise.resolve();
      });

      const passwordSelector =
        'input[name="Password"]:not(.moveOffScreen),input[name="passwd"]:not(.moveOffScreen)';

      await getPasswordState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        true,
        "",
        "testPassword",
        false,
      );

      // Should focus on password input with :not(.moveOffScreen) filter
      expect(mockPage.focus).toHaveBeenCalledWith(passwordSelector);

      // Should select all text and delete with single backspace
      expect(mockPage.$eval).toHaveBeenCalledWith(
        passwordSelector,
        expect.any(Function),
      );
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");

      // Should type password
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("testPassword");

      // Should click submit
      expect(mockPage.click).toHaveBeenCalledWith(
        "span[class=submit],input[type=submit]",
      );

      // Verify clear happens before type (regression for #166)
      expect(callOrder).toEqual(["focus", "$eval", "press", "type"]);
    });
  });

  describe("account selection handler", () => {
    const getAccountSelectionState = () =>
      states.find((s) => s.name === "account selection")!;

    it("should throw CLIError when no accounts found", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // Neither aadTile nor msaTile found

      const error = await getAccountSelectionState()
        .handler(
          mockPage as never,
          createMockElementHandle() as never,
          false,
          "",
          undefined,
          false,
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
        "No accounts found on account selection screen.",
      );
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
        false,
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
      vi.mocked(inquirer.prompt).mockResolvedValue({
        account: "Personal Account",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getAccountSelectionState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.click).toHaveBeenCalledWith("#msaTileTitle");
      consoleSpy.mockRestore();
    });

    it("should throw Error when inquirer returns unknown account", async () => {
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
      // Return an account that doesn't exist in the list
      vi.mocked(inquirer.prompt).mockResolvedValue({
        account: "Non-Existent Account",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const error = await getAccountSelectionState()
        .handler(
          mockPage as never,
          createMockElementHandle() as never,
          false,
          "",
          undefined,
          false,
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Unable to find account");
      consoleSpy.mockRestore();
    });
  });

  describe("Remember me handler", () => {
    const getRememberMeState = () =>
      states.find((s) => s.name === "Remember me")!;

    it("should click yes button when rememberMe is true", async () => {
      const mockPage = createMockPage();

      await getRememberMeState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        true, // rememberMe
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
        false, // rememberMe
      );

      expect(mockPage.click).toHaveBeenCalledWith("#idBtn_Back");
    });
  });

  describe("passwordless handler", () => {
    const getPasswordlessState = () =>
      states.find((s) => s.name === "passwordless")!;

    it("should click send notification and display auth code", async () => {
      const mockPage = createMockPage();
      const mockMessageElement = {};
      const mockCodeElement = {};

      mockPage.$.mockImplementation((selector: string) => {
        if (selector === "#idDiv_RemoteNGC_PollingDescription")
          return Promise.resolve(mockMessageElement);
        if (selector === "#idRemoteNGC_DisplaySign")
          return Promise.resolve(mockCodeElement);
        return Promise.resolve(null);
      });

      mockPage.evaluate.mockImplementation((_fn: unknown, el: unknown) => {
        if (el === mockMessageElement)
          return Promise.resolve("Approve the sign-in request");
        if (el === mockCodeElement) return Promise.resolve("42");
        return Promise.resolve("");
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getPasswordlessState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      expect(mockPage.click).toHaveBeenCalledWith(
        "input[value='Send notification']",
      );
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "#idRemoteNGC_DisplaySign",
        { visible: true, timeout: 60000 },
      );
      expect(consoleSpy).toHaveBeenCalledWith("Approve the sign-in request");
      expect(consoleSpy).toHaveBeenCalledWith("42");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "#idRemoteNGC_DisplaySign",
        { hidden: true, timeout: 60000 },
      );

      consoleSpy.mockRestore();
    });
  });

  describe("TFA instructions handler", () => {
    const getTfaInstructionsState = () =>
      states.find((s) => s.name === "TFA instructions")!;

    it("should display description and authentication code", async () => {
      const mockPage = createMockPage();
      const mockSelectedElement = {};
      const mockAuthCodeElement = {};

      mockPage.evaluate.mockImplementation((_fn: unknown, el: unknown) => {
        if (el === mockSelectedElement)
          return Promise.resolve("Open your Authenticator app");
        if (el === mockAuthCodeElement) return Promise.resolve("58");
        return Promise.resolve("");
      });

      mockPage.$.mockResolvedValue(mockAuthCodeElement);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaInstructionsState().handler(
        mockPage as never,
        mockSelectedElement as never,
        false,
        "",
        undefined,
        false,
      );

      expect(consoleSpy).toHaveBeenCalledWith("Open your Authenticator app");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "#idRichContext_DisplaySign",
        { visible: true, timeout: 5000 },
      );
      expect(consoleSpy).toHaveBeenCalledWith("58");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "#idDiv_SAOTCAS_Description",
        { hidden: true, timeout: 60000 },
      );

      consoleSpy.mockRestore();
    });

    it("should handle missing authentication code gracefully", async () => {
      const mockPage = createMockPage();
      const mockSelectedElement = {};

      mockPage.evaluate.mockResolvedValue("Open your Authenticator app");
      mockPage.waitForSelector.mockImplementation((selector: string) => {
        if (selector === "#idRichContext_DisplaySign") {
          return Promise.reject(new Error("Timeout"));
        }
        return Promise.resolve(undefined);
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaInstructionsState().handler(
        mockPage as never,
        mockSelectedElement as never,
        false,
        "",
        undefined,
        false,
      );

      expect(consoleSpy).toHaveBeenCalledWith("Open your Authenticator app");
      // Should not throw, just continue
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "#idDiv_SAOTCAS_Description",
        { hidden: true, timeout: 60000 },
      );

      consoleSpy.mockRestore();
    });
  });

  describe("TFA failed handler", () => {
    const getTfaFailedState = () =>
      states.find((s) => s.name === "TFA failed")!;

    it("should throw CLIError with description message", async () => {
      const mockPage = createMockPage();
      const mockElement = {};
      mockPage.evaluate.mockResolvedValue(
        "Authentication failed. Please try again.",
      );

      const error = await getTfaFailedState()
        .handler(
          mockPage as never,
          mockElement as never,
          false,
          "",
          undefined,
          false,
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
        "Authentication failed. Please try again.",
      );
    });
  });

  describe("Service exception handler", () => {
    const getServiceExceptionState = () =>
      states.find((s) => s.name === "Service exception")!;

    it("should throw CLIError with service exception message", async () => {
      const mockPage = createMockPage();
      const mockElement = {};
      mockPage.evaluate.mockResolvedValue("Service temporarily unavailable");

      const error = await getServiceExceptionState()
        .handler(
          mockPage as never,
          mockElement as never,
          false,
          "",
          undefined,
          false,
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
        "Service temporarily unavailable",
      );
    });
  });

  describe("TFA code input handler", () => {
    const getTfaCodeInputState = () =>
      states.find((s) => s.name === "TFA code input")!;

    it("should prompt for verification code and submit", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null); // No error
      vi.mocked(inquirer.prompt).mockResolvedValue({
        verificationCode: "123456",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaCodeInputState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("123456");
      expect(mockPage.click).toHaveBeenCalledWith("input[type=submit]");
      consoleSpy.mockRestore();
    });

    it("should display error message when present", async () => {
      const mockPage = createMockPage();
      const mockError = {};
      mockPage.$.mockResolvedValue(mockError);
      mockPage.evaluate.mockResolvedValue("Invalid code");
      vi.mocked(inquirer.prompt).mockResolvedValue({
        verificationCode: "654321",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaCodeInputState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      expect(consoleSpy).toHaveBeenCalledWith("Invalid code");
      consoleSpy.mockRestore();
    });

    it("should wait for form submission to finish after clicking submit", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        verificationCode: "123456",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaCodeInputState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      // Verify waitForSelector was called with correct selectors for form completion
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        "input[name=otc].has-error,input[name=otc].moveOffScreen",
        { timeout: 60000 },
      );
      consoleSpy.mockRestore();
    });

    it("should focus on input and clear before typing verification code", async () => {
      const mockPage = createMockPage();
      mockPage.$.mockResolvedValue(null);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        verificationCode: "999999",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await getTfaCodeInputState().handler(
        mockPage as never,
        createMockElementHandle() as never,
        false,
        "",
        undefined,
        false,
      );

      expect(mockPage.focus).toHaveBeenCalledWith('input[name="otc"]');
      // Should select all text and delete with single backspace
      expect(mockPage.$eval).toHaveBeenCalledWith(
        'input[name="otc"]',
        expect.any(Function),
      );
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
      expect(mockPage.keyboard.type).toHaveBeenCalledWith("999999");
      consoleSpy.mockRestore();
    });
  });
});
