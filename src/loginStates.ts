import Bluebird from "bluebird";
import inquirer, { Question } from "inquirer";
import { Page, ElementHandle } from "puppeteer";
import _debug from "debug";
import { CLIError } from "./CLIError";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import { execFile } from "child_process";

const debug = _debug("az2aws");

const execFileAsync = util.promisify(execFile);
export const hookScripts = {
  username: path.join(os.homedir(), ".aws", ".aws-azure-login.username.sh"),
  password: path.join(os.homedir(), ".aws", ".aws-azure-login.password.sh"),
  mfa: path.join(os.homedir(), ".aws", ".aws-azure-login.static-challenge.sh"),
};

const logHookStderr = (
  scriptPath: string,
  stderr: string,
  context: "success" | "failure"
): void => {
  const trimmed = stderr.trim();
  if (!trimmed) {
    return;
  }
  debug(`Hook script stderr on ${context} (${scriptPath}): ${trimmed}`);
};

/**
 * Validate hook script security: ownership and permissions.
 * - Script must be owned by the current user
 * - Script must not be writable by group or others
 */
const validateHookScriptSecurity = async (scriptPath: string): Promise<void> => {
  const stat = await fs.promises.stat(scriptPath);
  const currentUid = process.getuid?.();

  // Check ownership (skip on Windows where getuid is not available)
  if (currentUid !== undefined && stat.uid !== currentUid) {
    throw new CLIError(
      `Hook script is not owned by current user: ${scriptPath}. ` +
        `This is a security risk. Please ensure you own the script.`
    );
  }

  // Check that group and others cannot write to the script (mode & 022)
  const unsafePermissions = stat.mode & 0o022;
  if (unsafePermissions) {
    throw new CLIError(
      `Hook script has insecure permissions: ${scriptPath}. ` +
        `Group or others have write access. Please run: chmod go-w "${scriptPath}"`
    );
  }
};

/**
 * Run a hook script and return its stdout output.
 * Logs stderr for debugging purposes.
 * Use runHookScriptSensitive for hooks that return sensitive data.
 */
export const runHookScript = async (
  scriptPath: string
): Promise<string | undefined> => {
  try {
    await fs.promises.access(scriptPath, fs.constants.F_OK);
  } catch {
    return undefined;
  }

  try {
    await fs.promises.access(scriptPath, fs.constants.X_OK);
  } catch {
    throw new CLIError(`Hook script is not executable: ${scriptPath}`);
  }

  // Validate script ownership and permissions
  await validateHookScriptSecurity(scriptPath);

  try {
    const { stdout, stderr } = await execFileAsync(scriptPath, [], {
      env: process.env,
      timeout: 30000,
      maxBuffer: 10 * 1024,
    });
    if (stderr) {
      logHookStderr(scriptPath, stderr, "success");
    }
    const output = stdout.replace(/(?:\r?\n)+$/, "");
    if (!output) {
      throw new CLIError(`Hook script returned empty output: ${scriptPath}`);
    }
    return output;
  } catch (err) {
    if (err && typeof err === "object" && "stderr" in err) {
      const errorStderr = err.stderr;
      if (typeof errorStderr === "string") {
        logHookStderr(scriptPath, errorStderr, "failure");
      }
    }
    throw err;
  }
};

/**
 * Run a hook script for sensitive data (password, MFA).
 * Does NOT log stderr to prevent leaking sensitive information.
 */
export const runHookScriptSensitive = async (
  scriptPath: string
): Promise<string | undefined> => {
  try {
    await fs.promises.access(scriptPath, fs.constants.F_OK);
  } catch {
    return undefined;
  }

  try {
    await fs.promises.access(scriptPath, fs.constants.X_OK);
  } catch {
    throw new CLIError(`Hook script is not executable: ${scriptPath}`);
  }

  // Validate script ownership and permissions
  await validateHookScriptSecurity(scriptPath);

  const { stdout } = await execFileAsync(scriptPath, [], {
    env: process.env,
    timeout: 30000,
    maxBuffer: 10 * 1024,
  });
  const output = stdout.replace(/(?:\r?\n)+$/, "");
  if (!output) {
    throw new CLIError(`Hook script returned empty output: ${scriptPath}`);
  }
  return output;
};

export type StateHandler = (
  page: Page,
  selected: ElementHandle,
  noPrompt: boolean,
  defaultUsername: string,
  defaultPassword: string | undefined,
  rememberMe: boolean
) => Promise<void>;

export interface State {
  name: string;
  selector: string;
  handler: StateHandler;
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
      defaultUsername: string
    ): Promise<void> {
      const error = await page.$(".alert-error");
      if (error) {
        debug("Found error message. Displaying");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const errorMessage = await page.evaluate(
          // eslint-disable-next-line
          (err) => err?.textContent ?? "",
          error
        );
        console.log(errorMessage);
      }

      let username;

      const hookUsername = await runHookScript(hookScripts.username);
      if (hookUsername) {
        debug("Using username from hook script");
        username = hookUsername;
      } else if (noPrompt && defaultUsername) {
        debug("Not prompting user for username");
        username = defaultUsername;
      } else {
        debug("Prompting user for username");
        ({ username } = await inquirer.prompt([
          {
            name: "username",
            message: "Username:",
            default: defaultUsername,
          } as Question,
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await page.keyboard.type(username);

      await Bluebird.delay(500);

      debug("Waiting for submit button to be visible");
      await page.waitForSelector(`input[type=submit]`, {
        visible: true,
        timeout: 60000,
      });

      debug("Submitting form");
      await page.click("input[type=submit]");

      await Bluebird.delay(500);

      debug("Waiting for submission to finish");
      await Promise.race([
        page.waitForSelector(
          `input[name=loginfmt].has-error,input[name=loginfmt].moveOffScreen`,
          { timeout: 60000 }
        ),
        (async (): Promise<void> => {
          await Bluebird.delay(1000);
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
    async handler(page: Page): Promise<void> {
      debug("Multiple accounts associated with username.");
      const aadTile = await page.$("#aadTileTitle");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const aadTileMessage: string = await page.evaluate(
        // eslint-disable-next-line
        (a) => a?.textContent ?? "",
        aadTile
      );

      const msaTile = await page.$("#msaTileTitle");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const msaTileMessage: string = await page.evaluate(
        // eslint-disable-next-line
        (m) => m?.textContent ?? "",
        msaTile
      );

      const accounts = [
        aadTile ? { message: aadTileMessage, selector: "#aadTileTitle" } : null,
        msaTile ? { message: msaTileMessage, selector: "#msaTileTitle" } : null,
      ].filter((a): a is { message: string; selector: string } => a !== null);

      let account;
      if (accounts.length === 0) {
        throw new CLIError("No accounts found on account selection screen.");
      } else if (accounts.length === 1) {
        account = accounts[0];
      } else {
        debug("Asking user to choose account");
        console.log(
          "It looks like this Username is used with more than one account from Microsoft. Which one do you want to use?"
        );
        const answers = await inquirer.prompt([
          {
            name: "account",
            message: "Account:",
            type: "list",
            choices: accounts.map((a) => a.message),
            default: aadTileMessage,
          } as Question,
        ]);

        account = accounts.find((a) => a.message === answers.account);
      }

      if (!account) {
        throw new Error("Unable to find account");
      }

      debug(`Proceeding with account ${account.selector}`);
      await page.click(account.selector);
      await Bluebird.delay(500);
    },
  },
  {
    name: "passwordless",
    selector: `input[value='Send notification']`,
    async handler(page: Page) {
      debug("Sending notification");
      // eslint-disable-next-line
      await page.click("input[value='Send notification']");
      debug("Waiting for auth code");
      // eslint-disable-next-line
      await page.waitForSelector(`#idRemoteNGC_DisplaySign`, {
        visible: true,
        timeout: 60000,
      });
      debug("Printing the message displayed");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const messageElement = await page.$(
        "#idDiv_RemoteNGC_PollingDescription"
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const codeElement = await page.$("#idRemoteNGC_DisplaySign");
      // eslint-disable-next-line
      const message = await page.evaluate(
        // eslint-disable-next-line
        (el) => el?.textContent ?? "",
        messageElement
      );
      console.log(message);
      debug("Printing the auth code");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const authCode = await page.evaluate(
        // eslint-disable-next-line
        (el) => el?.textContent ?? "",
        codeElement
      );
      console.log(authCode);
      debug("Waiting for response");
      await page.waitForSelector(`#idRemoteNGC_DisplaySign`, {
        hidden: true,
        timeout: 60000,
      });
    },
  },
  {
    name: "password input",
    selector: `input[name="Password"]:not(.moveOffScreen),input[name="passwd"]:not(.moveOffScreen)`,
    async handler(
      page: Page,
      _selected: ElementHandle,
      noPrompt: boolean,
      _defaultUsername: string,
      defaultPassword: string | undefined
    ): Promise<void> {
      const error = await page.$(".alert-error");
      if (error) {
        debug("Found error message. Displaying");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const errorMessage = await page.evaluate(
          // eslint-disable-next-line
          (err) => err?.textContent ?? "",
          error
        );
        console.log(errorMessage);
        defaultPassword = ""; // Password error. Unset the default and allow user to enter it.
      }

      let password;

      const hookPassword = await runHookScriptSensitive(hookScripts.password);
      if (hookPassword) {
        debug("Using password from hook script");
        password = hookPassword;
      } else if (noPrompt && defaultPassword) {
        debug("Not prompting user for password");
        password = defaultPassword;
      } else {
        debug("Prompting user for password");
        ({ password } = await inquirer.prompt([
          {
            name: "password",
            message: "Password:",
            type: "password",
          } as Question,
        ]));
      }

      debug("Focusing on password input");
      await page.focus(`input[name="Password"],input[name="passwd"]`);

      debug("Typing password");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await page.keyboard.type(password);

      debug("Submitting form");
      await page.click("span[class=submit],input[type=submit]");

      debug("Waiting for a delay");
      await Bluebird.delay(500);
    },
  },
  {
    name: "TFA instructions",
    selector: `#idDiv_SAOTCAS_Description`,
    async handler(page: Page, selected: ElementHandle): Promise<void> {
      const descriptionMessage = await page.evaluate(
        // eslint-disable-next-line
        (description) => description?.textContent ?? "",
        selected
      );
      console.log(descriptionMessage);

      try {
        debug("Waiting for authentication code to be displayed");
        await page.waitForSelector("#idRichContext_DisplaySign", {
          visible: true,
          timeout: 5000,
        });
        debug("Checking if authentication code is displayed");
        const authenticationCodeElement = await page.$(
          "#idRichContext_DisplaySign"
        );
        debug("Reading the authentication code");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const authenticationCode = await page.evaluate(
          // eslint-disable-next-line
          (d) => d?.textContent ?? "",
          authenticationCodeElement
        );
        debug("Printing the authentication code to console");
        console.log(authenticationCode);
      } catch {
        debug("No authentication code found on page");
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
    async handler(page: Page, selected: ElementHandle): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const descriptionMessage = await page.evaluate(
        // eslint-disable-next-line
        (description) => description?.textContent ?? "",
        selected
      );
      throw new CLIError(descriptionMessage);
    },
  },
  {
    name: "TFA code input",
    selector: "input[name=otc]:not(.moveOffScreen)",
    async handler(page: Page): Promise<void> {
      const error = await page.$(".alert-error");
      if (error) {
        debug("Found error message. Displaying");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const errorMessage = await page.evaluate(
          // eslint-disable-next-line
          (err) => err?.textContent ?? "",
          error
        );
        console.log(errorMessage);
      } else {
        const description = await page.$("#idDiv_SAOTCC_Description");
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const descriptionMessage = await page.evaluate(
          // eslint-disable-next-line
          (d) => d?.textContent ?? "",
          description
        );
        console.log(descriptionMessage);
      }

      let verificationCode;
      const hookCode = await runHookScriptSensitive(hookScripts.mfa);
      if (hookCode) {
        debug("Using verification code from hook script");
        verificationCode = hookCode;
      } else {
        ({ verificationCode } = await inquirer.prompt([
          {
            name: "verificationCode",
            message: "Verification Code:",
          } as Question,
        ]));
      }

      debug("Focusing on verification code input");
      await page.focus(`input[name="otc"]`);

      debug("Clearing input");
      await page.$eval('input[name="otc"]', (el) => {
        el.select();
      });
      await page.keyboard.press("Backspace");

      debug("Typing verification code");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await page.keyboard.type(verificationCode);

      debug("Submitting form");
      await page.click("input[type=submit]");

      debug("Waiting for submission to finish");
      await Promise.race([
        page.waitForSelector(
          `input[name=otc].has-error,input[name=otc].moveOffScreen`,
          { timeout: 60000 }
        ),
        (async (): Promise<void> => {
          await Bluebird.delay(1000);
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
      rememberMe: boolean
    ): Promise<void> {
      if (rememberMe) {
        debug("Clicking remember me button");
        await page.click("#idSIButton9");
      } else {
        debug("Clicking don't remember button");
        await page.click("#idBtn_Back");
      }

      debug("Waiting for a delay");
      await Bluebird.delay(500);
    },
  },
  {
    name: "Service exception",
    selector: "#service_exception_message",
    async handler(page: Page, selected: ElementHandle): Promise<void> {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const descriptionMessage = await page.evaluate(
        // eslint-disable-next-line
        (description) => description?.textContent ?? "",
        selected
      );
      throw new CLIError(descriptionMessage);
    },
  },
];
