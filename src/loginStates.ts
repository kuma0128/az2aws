import { setTimeout } from "node:timers/promises";
import inquirer from "inquirer";
import type { ElementHandle, Page } from "puppeteer-core";
import _debug from "debug";
import { CLIError } from "./CLIError";

const debug = _debug("az2aws");

export type StateHandler = (
  page: Page,
  selected: ElementHandle,
  noPrompt: boolean,
  defaultUsername: string,
  defaultPassword: string | undefined,
  rememberMe: boolean,
  allowSensitiveOutput: boolean,
) => Promise<void>;

export interface State {
  name: string;
  selector: string;
  handler: StateHandler;
}

type AccountChoice = {
  message: string;
  selector: string;
};

async function readTextContent<T extends Node>(
  page: Page,
  element: ElementHandle<T> | null,
): Promise<string> {
  if (!element) {
    return "";
  }

  return page.evaluate((node) => node.textContent ?? "", element);
}

const PASSWORD_SELECTOR =
  'input[name="Password"]:not(.moveOffScreen),input[name="passwd"]:not(.moveOffScreen)';

// The number-matching code element differs across Entra sign-in page variants.
const TFA_DISPLAY_SIGN_SELECTOR =
  "#idRichContext_DisplaySign,#idRemoteNGC_DisplaySign";

function printPageMessage(message: string, allowSensitiveOutput = true): void {
  if (allowSensitiveOutput) {
    console.log(message);
  }
}

function createSensitiveCliError(
  message: string,
  sanitizedMessage: string,
  allowSensitiveOutput = true,
): CLIError {
  return new CLIError(allowSensitiveOutput ? message : sanitizedMessage);
}

/**
 * To proxy the input/output of the Azure login page, it's easiest to run a loop that
 * monitors the state of the page and then perform the corresponding CLI behavior.
 * The states have a name that is used for the debug messages, a selector that is used
 * with puppeteer's page.$(selector) to determine if the state is active, and a handler
 * that is called if the state is active.
 */
export const states: State[] = [
  {
    name: "username input",
    selector: `input[name="loginfmt"]:not(.moveOffScreen)`,
    async handler(
      page: Page,
      _selected: ElementHandle,
      noPrompt: boolean,
      defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      const error = await page.$(".alert-error");
      if (error) {
        debug("Found error message. Displaying");
        const errorMessage = await readTextContent(page, error);
        printPageMessage(errorMessage, allowSensitiveOutput);
      }

      let username: string;

      if (noPrompt && defaultUsername) {
        debug("Not prompting user for username");
        username = defaultUsername;
      } else {
        debug("Prompting user for username");
        ({ username } = await inquirer.prompt<{ username: string }>([
          {
            type: "input" as const,
            name: "username",
            message: "Username:",
            default: defaultUsername,
          },
        ]));
      }

      debug("Waiting for username input to be visible");
      await page.waitForSelector(`input[name="loginfmt"]`, {
        visible: true,
        timeout: 60000,
      });

      debug("Focusing on username input");
      await page.focus(`input[name="loginfmt"]`);

      debug("Clearing input");
      await page.$eval('input[name="loginfmt"]', (el) => {
        el.select();
      });
      await page.keyboard.press("Backspace");

      debug("Typing username");
      await page.keyboard.type(username);

      await setTimeout(500);

      debug("Waiting for submit button to be visible");
      await page.waitForSelector(`input[type=submit]`, {
        visible: true,
        timeout: 60000,
      });

      debug("Submitting form");
      await page.click("input[type=submit]");

      await setTimeout(500);

      debug("Waiting for submission to finish");
      await Promise.race([
        page.waitForSelector(
          `input[name=loginfmt].has-error,input[name=loginfmt].moveOffScreen`,
          { timeout: 60000 },
        ),
        (async (): Promise<void> => {
          await setTimeout(1000);
          await page.waitForSelector(`input[name=loginfmt]`, {
            hidden: true,
            timeout: 60000,
          });
        })(),
      ]);
    },
  },
  {
    name: "account selection",
    selector: `#aadTile > div > div.table-cell.tile-img > img`,
    async handler(
      page: Page,
      _selected: ElementHandle,
      noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      debug("Multiple accounts associated with username.");
      const aadTile = await page.$("#aadTileTitle");
      const aadTileMessage = await readTextContent(page, aadTile);

      const msaTile = await page.$("#msaTileTitle");
      const msaTileMessage = await readTextContent(page, msaTile);

      const accounts: AccountChoice[] = [
        aadTile ? { message: aadTileMessage, selector: "#aadTileTitle" } : null,
        msaTile ? { message: msaTileMessage, selector: "#msaTileTitle" } : null,
      ].filter((account): account is AccountChoice => account !== null);

      let account: AccountChoice | undefined;
      if (accounts.length === 0) {
        throw new CLIError("No accounts found on account selection screen.");
      } else if (accounts.length === 1) {
        account = accounts[0];
      } else if (noPrompt) {
        debug("Skipping account prompt and using default account");
        account = accounts.find((candidate) => {
          return candidate.message === aadTileMessage;
        });
      } else {
        debug("Asking user to choose account");
        printPageMessage(
          "It looks like this Username is used with more than one account from Microsoft. Which one do you want to use?",
          allowSensitiveOutput,
        );
        const { account: selectedAccount } = await inquirer.prompt<{
          account: string;
        }>([
          {
            name: "account",
            message: "Account:",
            type: "select",
            choices: accounts.map((a) => a.message),
            default: aadTileMessage,
          },
        ]);

        account = accounts.find((candidate) => {
          return candidate.message === selectedAccount;
        });
      }

      if (!account) {
        throw new Error("Unable to find account");
      }

      debug(`Proceeding with account ${account.selector}`);
      await page.click(account.selector);
      await setTimeout(500);
    },
  },
  {
    name: "passwordless",
    selector: `input[value='Send notification']`,
    async handler(
      page: Page,
      _selected: ElementHandle,
      _noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ) {
      debug("Sending notification");
      await page.click("input[value='Send notification']");
      debug("Waiting for auth code");
      await page.waitForSelector(`#idRemoteNGC_DisplaySign`, {
        visible: true,
        timeout: 60000,
      });
      debug("Printing the message displayed");
      const messageElement = await page.$(
        "#idDiv_RemoteNGC_PollingDescription",
      );
      const codeElement = await page.$("#idRemoteNGC_DisplaySign");
      const message = await readTextContent(page, messageElement);
      printPageMessage(message, allowSensitiveOutput);
      debug("Printing the auth code");
      const authCode = await readTextContent(page, codeElement);
      printPageMessage(authCode, allowSensitiveOutput);
      debug("Waiting for response");
      await page.waitForSelector(`#idRemoteNGC_DisplaySign`, {
        hidden: true,
        timeout: 60000,
      });
    },
  },
  {
    name: "password input",
    selector: PASSWORD_SELECTOR,
    async handler(
      page: Page,
      _selected: ElementHandle,
      noPrompt: boolean,
      _defaultUsername: string,
      defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      const error = await page.$(".alert-error");
      if (error) {
        debug("Found error message. Displaying");
        const errorMessage = await readTextContent(page, error);
        printPageMessage(errorMessage, allowSensitiveOutput);
        defaultPassword = ""; // Password error. Unset the default and allow user to enter it.
      }

      let password: string;

      if (noPrompt && defaultPassword) {
        debug("Not prompting user for password");
        password = defaultPassword;
      } else {
        debug("Prompting user for password");
        ({ password } = await inquirer.prompt<{ password: string }>([
          {
            name: "password",
            message: "Password:",
            type: "password",
          },
        ]));
      }

      debug("Focusing on password input");
      await page.focus(PASSWORD_SELECTOR);

      debug("Clearing input");
      await page.$eval(PASSWORD_SELECTOR, (el) => {
        el.select();
      });
      await page.keyboard.press("Backspace");

      debug("Typing password");
      await page.keyboard.type(password);

      debug("Submitting form");
      await page.click("span[class=submit],input[type=submit]");

      debug("Waiting for a delay");
      await setTimeout(500);
    },
  },
  {
    name: "TFA instructions",
    selector: `#idDiv_SAOTCAS_Description`,
    async handler(
      page: Page,
      selected: ElementHandle,
      _noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      const descriptionMessage = await readTextContent(page, selected);
      printPageMessage(descriptionMessage, allowSensitiveOutput);

      try {
        debug("Waiting for authentication code to be displayed");
        await page.waitForSelector(TFA_DISPLAY_SIGN_SELECTOR, {
          visible: true,
          timeout: 15000,
        });
        debug("Checking if authentication code is displayed");
        const authenticationCodeElement = await page.$(
          TFA_DISPLAY_SIGN_SELECTOR,
        );
        debug("Reading the authentication code");
        const authenticationCode = await readTextContent(
          page,
          authenticationCodeElement,
        );
        debug("Printing the authentication code to console");
        printPageMessage(authenticationCode, allowSensitiveOutput);
      } catch {
        debug("No authentication code found on page");
        console.warn(
          "Could not read the verification code from the sign-in page. " +
            "If your Authenticator app asks for a number, rerun az2aws with --mode debug or --mode gui to see it.",
        );
      }

      debug("Waiting for response");
      await page.waitForSelector(`#idDiv_SAOTCAS_Description`, {
        hidden: true,
        timeout: 60000,
      });
    },
  },
  {
    name: "TFA failed",
    selector: `#idDiv_SAASDS_Description,#idDiv_SAASTO_Description`,
    async handler(
      page: Page,
      selected: ElementHandle,
      _noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      const descriptionMessage = await readTextContent(page, selected);
      throw createSensitiveCliError(
        descriptionMessage,
        "Authentication failed during MFA challenge.",
        allowSensitiveOutput,
      );
    },
  },
  {
    name: "TFA code input",
    selector: "input[name=otc]:not(.moveOffScreen)",
    async handler(
      page: Page,
      _selected: ElementHandle,
      _noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      const error = await page.$(".alert-error");
      if (error) {
        debug("Found error message. Displaying");
        const errorMessage = await readTextContent(page, error);
        printPageMessage(errorMessage, allowSensitiveOutput);
      } else {
        const description = await page.$("#idDiv_SAOTCC_Description");
        const descriptionMessage = await readTextContent(page, description);
        printPageMessage(descriptionMessage, allowSensitiveOutput);
      }

      const { verificationCode } = await inquirer.prompt<{
        verificationCode: string;
      }>([
        {
          type: "input" as const,
          name: "verificationCode",
          message: "Verification Code:",
        },
      ]);

      debug("Focusing on verification code input");
      await page.focus(`input[name="otc"]`);

      debug("Clearing input");
      await page.$eval('input[name="otc"]', (el) => {
        el.select();
      });
      await page.keyboard.press("Backspace");

      debug("Typing verification code");
      await page.keyboard.type(verificationCode);

      debug("Submitting form");
      await page.click("input[type=submit]");

      debug("Waiting for submission to finish");
      await Promise.race([
        page.waitForSelector(
          `input[name=otc].has-error,input[name=otc].moveOffScreen`,
          { timeout: 60000 },
        ),
        (async (): Promise<void> => {
          await setTimeout(1000);
          await page.waitForSelector(`input[name=otc]`, {
            hidden: true,
            timeout: 60000,
          });
        })(),
      ]);
    },
  },
  {
    name: "Remember me",
    selector: `#KmsiDescription`,
    async handler(
      page: Page,
      _selected: ElementHandle,
      _noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      rememberMe: boolean,
    ): Promise<void> {
      if (rememberMe) {
        debug("Clicking remember me button");
        await page.click("#idSIButton9");
      } else {
        debug("Clicking don't remember button");
        await page.click("#idBtn_Back");
      }

      debug("Waiting for a delay");
      await setTimeout(500);
    },
  },
  {
    name: "Service exception",
    selector: "#service_exception_message",
    async handler(
      page: Page,
      selected: ElementHandle,
      _noPrompt: boolean,
      _defaultUsername: string,
      _defaultPassword: string | undefined,
      _rememberMe: boolean,
      allowSensitiveOutput: boolean,
    ): Promise<void> {
      const descriptionMessage = await readTextContent(page, selected);
      throw createSensitiveCliError(
        descriptionMessage,
        "Login provider returned a service exception.",
        allowSensitiveOutput,
      );
    },
  },
];
