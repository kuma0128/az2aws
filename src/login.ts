import { setTimeout } from "node:timers/promises";
import crypto from "node:crypto";
import inquirer, { type DistinctQuestion } from "inquirer";
import zlib from "zlib";
import { STS, STSClientConfig } from "@aws-sdk/client-sts";
import { load } from "cheerio";
import puppeteer from "puppeteer";
import type { Browser, BrowserContext, HTTPRequest, Page } from "puppeteer";
import querystring from "querystring";
import _debug from "debug";
import { CLIError } from "./CLIError";
import { awsConfig, ProfileConfig, ProfileCredentials } from "./awsConfig";
import { paths } from "./paths";
import fs from "fs/promises";
import { Agent } from "https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { states } from "./loginStates";
import {
  parseSessionDurationHours,
  sessionDurationHoursValidationMessage,
  validateSessionDurationHours,
} from "./sessionDuration";
import {
  formatDebugErrorMessage,
  redactUrlForLogs,
  shouldAllowSensitiveOutput,
} from "./sensitiveOutput";

const debug = _debug("az2aws");

const WIDTH = 425;
const HEIGHT = 550;
const DELAY_ON_UNRECOGNIZED_PAGE = 1000;
const GUI_FALLBACK_HINT_DELAY = 15 * 1000;
const MAX_UNRECOGNIZED_PAGE_DELAY = 30 * 1000;

// source: https://docs.microsoft.com/en-us/azure/active-directory/hybrid/how-to-connect-sso-quick-start#google-chrome-all-platforms
const AZURE_AD_SSO = "autologon.microsoftazuread-sso.com";
const AWS_SAML_ENDPOINT = "https://signin.aws.amazon.com/saml";
const AWS_CN_SAML_ENDPOINT = "https://signin.amazonaws.cn/saml";
const AWS_GOV_SAML_ENDPOINT = "https://signin.amazonaws-us-gov.com/saml";
const REDACTED = "[redacted]";

// Keep the runtime import as native `import()` so CommonJS output can load
// the ESM-only https-proxy-agent package.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const importHttpsProxyAgent = Function(
  'return import("https-proxy-agent")',
) as () => Promise<{
  HttpsProxyAgent: new (
    proxy: string,
    opts?: Record<string, unknown>,
  ) => import("http").Agent;
}>;

const getProxyUrl = (): string | undefined =>
  process.env.https_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.HTTP_PROXY;

interface Role {
  roleArn: string;
  principalArn: string;
}

type AwsCredentials = ProfileCredentials;
type RoleDurationAnswers = {
  role?: string;
  durationHours?: string | number;
};

function printCredentialsReadyMessage(
  profileName: string,
  credentials: AwsCredentials,
): void {
  console.log();
  console.log(`Credentials expire at ${credentials.aws_expiration}.`);
  console.log(`Use them with AWS CLI by passing --profile "${profileName}".`);
}

function handleBackgroundPromise(
  promise: Promise<unknown>,
  description: string,
): void {
  void promise.catch((error: unknown) => {
    const message = formatDebugErrorMessage(error);
    debug(`${description}: ${message}`);
  });
}

function printGuiFallbackHint(): void {
  console.log(
    "Login is taking longer than expected. If a browser prompt such as certificate selection is waiting for input, stop this run and retry with --mode=gui.",
  );
}

export const login = {
  async _createHttpsProxyAgentAsync(
    proxyUrl: string,
    proxyOptions?: Record<string, unknown>,
  ): Promise<import("http").Agent> {
    const { HttpsProxyAgent } = await importHttpsProxyAgent();
    return new HttpsProxyAgent(proxyUrl, proxyOptions);
  },

  async loginAsync(
    profileName: string,
    mode: string,
    disableSandbox: boolean,
    noPrompt: boolean,
    enableChromeNetworkService: boolean,
    awsNoVerifySsl: boolean,
    enableChromeSeamlessSso: boolean,
    noDisableExtensions: boolean,
    disableGpu: boolean,
    incognito = false,
    credentialProcess = false,
  ): Promise<void> {
    const originalConsoleLog = console.log;
    const effectiveNoPrompt = credentialProcess ? true : noPrompt;

    try {
      if (credentialProcess) {
        console.log = (...args: unknown[]) => console.error(...args);
      }

      let headless, cliProxy;
      if (mode === "cli") {
        headless = true;
        cliProxy = true;
      } else if (mode === "gui") {
        headless = false;
        cliProxy = false;
      } else if (mode === "debug") {
        headless = false;
        cliProxy = true;
      } else {
        throw new CLIError("Invalid mode");
      }

      const profile = await this._loadProfileAsync(profileName);
      console.log(
        `Using AWS region ${profile.region || "(from AWS SDK defaults)"}`,
      );
      if (profile.region && profile.region.startsWith("us-gov")) {
        console.warn(
          "GovCloud region detected in profile. Note: Other AWS CLI operations " +
            "will use your AWS CLI default region. If needed, set it to match " +
            "this GovCloud region (us-gov-west-1 or us-gov-east-1).",
        );
      }
      let assertionConsumerServiceURL = AWS_SAML_ENDPOINT;
      if (profile.region && profile.region.startsWith("us-gov")) {
        assertionConsumerServiceURL = AWS_GOV_SAML_ENDPOINT;
      }
      if (profile.region && profile.region.startsWith("cn-")) {
        assertionConsumerServiceURL = AWS_CN_SAML_ENDPOINT;
      }

      console.log("Using AWS SAML endpoint", assertionConsumerServiceURL);

      const loginUrl = await this._createLoginUrlAsync(
        profile.azure_app_id_uri,
        profile.azure_tenant_id,
        assertionConsumerServiceURL,
      );
      const allowSensitiveOutput = shouldAllowSensitiveOutput();
      const samlResponse = await this._performLoginAsync(
        loginUrl,
        headless,
        disableSandbox,
        cliProxy,
        effectiveNoPrompt,
        enableChromeNetworkService,
        profile.azure_default_username,
        profile.azure_default_password,
        enableChromeSeamlessSso,
        profile.azure_default_remember_me,
        noDisableExtensions,
        disableGpu,
        incognito,
        allowSensitiveOutput,
      );
      const roles = this._parseRolesFromSamlResponse(samlResponse);
      const { role, durationHours } =
        await this._askUserForRoleAndDurationAsync(
          roles,
          effectiveNoPrompt,
          profile.azure_default_role_arn,
          profile.azure_default_duration_hours,
          credentialProcess ? "--credential-process" : "--no-prompt",
        );

      const credentials = await this._assumeRoleAsync(
        profileName,
        samlResponse,
        role,
        durationHours,
        awsNoVerifySsl,
        profile.region,
        !credentialProcess,
      );

      if (credentialProcess) {
        if (!credentials) {
          throw new CLIError("Unable to retrieve credentials.");
        }

        originalConsoleLog(
          JSON.stringify({
            Version: 1,
            AccessKeyId: credentials.aws_access_key_id,
            SecretAccessKey: credentials.aws_secret_access_key,
            SessionToken: credentials.aws_session_token,
            Expiration: credentials.aws_expiration,
          }),
        );
      }
    } finally {
      console.log = originalConsoleLog;
    }
  },

  async loginAll(
    mode: string,
    disableSandbox: boolean,
    noPrompt: boolean,
    enableChromeNetworkService: boolean,
    awsNoVerifySsl: boolean,
    enableChromeSeamlessSso: boolean,
    forceRefresh: boolean,
    noDisableExtensions: boolean,
    disableGpu: boolean,
    incognito = false,
  ): Promise<void> {
    const profiles = await awsConfig.getAz2awsProfileNames();

    for (const profile of profiles) {
      debug(`Check if profile ${profile} is expired or is about to expire`);
      if (
        !forceRefresh &&
        !(await awsConfig.isProfileAboutToExpireAsync(profile))
      ) {
        debug(`Profile ${profile} not yet due for refresh.`);
        continue;
      }

      debug(`Run login for profile: ${profile}`);
      await this.loginAsync(
        profile,
        mode,
        disableSandbox,
        noPrompt,
        enableChromeNetworkService,
        awsNoVerifySsl,
        enableChromeSeamlessSso,
        noDisableExtensions,
        disableGpu,
        incognito,
      );
    }
  },

  // Gather data from environment variables
  _loadProfileFromEnv(): { [key: string]: string } {
    const env: { [key: string]: string } = {};
    const options = [
      "azure_tenant_id",
      "azure_app_id_uri",
      "azure_default_username",
      "azure_default_password",
      "azure_default_role_arn",
      "azure_default_duration_hours",
    ];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const envVar = process.env[opt];
      const envVarUpperCase = process.env[opt.toUpperCase()];

      if (envVar) {
        env[opt] = envVar;
      } else if (envVarUpperCase) {
        env[opt] = envVarUpperCase;
      }
    }
    debug("Environment");
    debug(this._redactProfileForDebug(env));
    return env;
  },

  _redactProfileForDebug(env: { [key: string]: string }): {
    [key: string]: string;
  } {
    return Object.fromEntries(
      Object.entries(env).map(([key, value]) => [
        key,
        key === "azure_default_duration_hours" ? value : REDACTED,
      ]),
    );
  },

  _redactArnForDebug(arn: string): string {
    const match = arn.match(/^(arn:[^:]+:iam::)[^:]+:(.+?\/).+$/);
    if (!match) {
      return arn;
    }

    return `${match[1]}${REDACTED}:${match[2]}${REDACTED}`;
  },

  // Load the profile
  async _loadProfileAsync(profileName: string): Promise<ProfileConfig> {
    const profile = await awsConfig.getProfileConfigAsync(profileName);

    if (!profile)
      throw new CLIError(
        `Unknown profile '${profileName}'. You must configure it first with --configure.`,
      );

    const env = this._loadProfileFromEnv();
    for (const prop in env) {
      if (env[prop]) {
        profile[prop] = env[prop] === null ? profile[prop] : env[prop];
      }
    }

    if (!profile.azure_tenant_id || !profile.azure_app_id_uri)
      throw new CLIError(
        `Profile '${profileName}' is not configured properly.`,
      );

    console.log(`Logging in with profile '${profileName}'...`);
    return profile;
  },

  /**
   * Create the Azure login SAML URL.
   * @param {string} appIdUri - The app ID URI
   * @param {string} tenantId - The Azure tenant ID
   * @param {string} assertionConsumerServiceURL - The AWS SAML endpoint that Azure should send the SAML response to
   * @returns {string} The login URL
   * @private
   */
  _createLoginUrlAsync(
    appIdUri: string,
    tenantId: string,
    assertionConsumerServiceURL: string,
  ): Promise<string> {
    debug("Generating UUID for SAML request");
    const id = crypto.randomUUID();

    const samlRequest = `
        <samlp:AuthnRequest xmlns="urn:oasis:names:tc:SAML:2.0:metadata" ID="id${id}" Version="2.0" IssueInstant="${new Date().toISOString()}" IsPassive="false" AssertionConsumerServiceURL="${assertionConsumerServiceURL}" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
            <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">${appIdUri}</Issuer>
            <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"></samlp:NameIDPolicy>
        </samlp:AuthnRequest>
        `;
    debug("Generated SAML request");

    debug("Deflating SAML");

    return new Promise((resolve, reject) => {
      zlib.deflateRaw(samlRequest, (err, samlBuffer) => {
        if (err) {
          return reject(err);
        }

        debug("Encoding SAML in base64");
        const samlBase64 = samlBuffer.toString("base64");

        const url = `https://login.microsoftonline.com/${tenantId}/saml2?SAMLRequest=${encodeURIComponent(
          samlBase64,
        )}`;
        debug("Created login URL", redactUrlForLogs(url));

        return resolve(url);
      });
    });
  },

  /**
   * Perform the login using Chrome.
   * @param {string} url - The login URL
   * @param {boolean} headless - True to hide the GUI, false to show it.
   * @param {boolean} disableSandbox - True to disable the Puppeteer sandbox.
   * @param {boolean} cliProxy - True to proxy input/output through the CLI, false to leave it in the GUI
   * @param {bool} [noPrompt] - Enable skipping of user prompting
   * @param {bool} [enableChromeNetworkService] - Enable chrome network service.
   * @param {string} [defaultUsername] - The default username
   * @param {string} [defaultPassword] - The default password
   * @param {bool} [enableChromeSeamlessSso] - chrome seamless SSO
   * @param {bool} [rememberMe] - Enable remembering the session
   * @param {bool} [noDisableExtensions] - True to prevent Puppeteer from disabling Chromium extensions
   * @param {bool} [disableGpu] - Disables GPU Acceleration
   * @param {bool} [incognito] - Launch the login flow in an incognito browser context
   * @returns {Promise.<string>} The SAML response.
   * @private
   */
  async _performLoginAsync(
    url: string,
    headless: boolean,
    disableSandbox: boolean,
    cliProxy: boolean,
    noPrompt: boolean,
    enableChromeNetworkService: boolean,
    defaultUsername: string,
    defaultPassword: string | undefined,
    enableChromeSeamlessSso: boolean,
    rememberMe: boolean,
    noDisableExtensions: boolean,
    disableGpu: boolean,
    incognito = false,
    allowSensitiveStateOutput = true,
  ): Promise<string> {
    debug("Loading login page in Chrome");

    let browser: Browser | undefined;
    const useRememberMe = rememberMe && !incognito;

    try {
      const args = headless
        ? []
        : incognito
          ? [`--window-size=${WIDTH},${HEIGHT}`]
          : [`--app=${url}`, `--window-size=${WIDTH},${HEIGHT}`];
      if (disableSandbox) args.push("--no-sandbox");
      if (enableChromeNetworkService)
        args.push("--enable-features=NetworkService");
      if (enableChromeSeamlessSso)
        args.push(
          `--auth-server-whitelist=${AZURE_AD_SSO}`,
          `--auth-negotiate-delegate-whitelist=${AZURE_AD_SSO}`,
        );
      debug(`rememberMe value: ${rememberMe} (type: ${typeof rememberMe})`);
      if (useRememberMe) {
        if (paths.userDataDir) {
          args.push(`--user-data-dir=${paths.userDataDir}`);
        } else {
          await fs.mkdir(paths.chromium, { recursive: true });
          args.push(`--user-data-dir=${paths.chromium}`);
        }

        // --profile-directory requires --user-data-dir to work properly
        if (paths.profileDir) {
          args.push(`--profile-directory=${paths.profileDir}`);
        }
      }

      if (incognito && rememberMe) {
        console.warn(
          "WARNING: Incognito mode overrides 'Stay logged in' and ignores saved Chrome profiles.",
        );
      }

      const proxyUrl = getProxyUrl();
      if (proxyUrl) {
        args.push(`--proxy-server=${proxyUrl}`);
      }

      const ignoreDefaultArgs = noDisableExtensions
        ? ["--disable-extensions"]
        : [];

      if (disableGpu) {
        args.push("--disable-gpu");
      }

      const launchParams: {
        headless: boolean;
        args: string[];
        ignoreDefaultArgs: string[];
        executablePath?: string;
      } = {
        headless,
        args,
        ignoreDefaultArgs,
      };

      if (paths.chromeBin) {
        launchParams.executablePath = paths.chromeBin;
      }

      try {
        browser = await puppeteer.launch(launchParams);
      } catch (e) {
        if (
          e instanceof Error &&
          e.name === "TargetCloseError" &&
          useRememberMe &&
          !paths.userDataDir
        ) {
          debug(
            "Browser launch failed with TargetCloseError. Resetting managed browser profile.",
          );
          console.warn(
            "Browser profile appears incompatible. Resetting profile data and retrying...",
          );
          await fs.rm(paths.chromium, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 100,
          });
          await fs.mkdir(paths.chromium, { recursive: true });
          browser = await puppeteer.launch(launchParams);
        } else {
          throw e;
        }
      }

      // Wait for a bit as sometimes the browser isn't ready.
      await setTimeout(200);

      let page: Page;
      if (incognito) {
        const existingPages = await browser.pages();
        const context: BrowserContext = await browser.createBrowserContext();
        page = await context.newPage();
        await Promise.all(
          existingPages.map((existingPage) => existingPage.close()),
        );
        if (!headless) {
          await page.bringToFront();
        }
      } else {
        const pages = await browser.pages();
        page = pages[0];
      }
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en",
      });
      await page.setViewport({ width: WIDTH - 15, height: HEIGHT - 35 });

      // Prevent redirection to AWS
      let samlResponseData;
      const samlResponsePromise = new Promise((resolve) => {
        page.on("request", (req: HTTPRequest) => {
          const reqURL = req.url();
          const redactedURL = redactUrlForLogs(reqURL);
          debug(`Request: ${redactedURL}`);
          if (
            reqURL === AWS_SAML_ENDPOINT ||
            reqURL === AWS_GOV_SAML_ENDPOINT ||
            reqURL === AWS_CN_SAML_ENDPOINT
          ) {
            resolve(undefined);
            samlResponseData = req.postData();
            handleBackgroundPromise(
              req.respond({
                status: 200,
                contentType: "text/plain",
                headers: {},
                body: "",
              }),
              `Failed to respond to intercepted request ${redactedURL}`,
            );
            if (browser) {
              handleBackgroundPromise(
                browser.close(),
                "Failed to close browser after receiving SAML response",
              );
            }
            browser = undefined;
            debug(`Received SAML response, browser closed`);
          } else {
            handleBackgroundPromise(
              req.continue(),
              `Failed to continue intercepted request ${redactedURL}`,
            );
          }
        });
      });

      debug("Enabling request interception");
      await page.setRequestInterception(true);

      try {
        if (incognito || headless || cliProxy) {
          debug("Going to login page");
          await page.goto(url, { waitUntil: "domcontentloaded" });
        } else {
          debug("Waiting for login page to load");
          await page.waitForNavigation({ waitUntil: "networkidle0" });
        }
      } catch (err) {
        if (err instanceof Error) {
          // An error will be thrown if you're still logged in cause the page.goto ot waitForNavigation
          // will be a redirect to AWS. That's usually OK
          debug(
            `Error occurred during loading the first page: ${formatDebugErrorMessage(err)}`,
          );
        }
      }

      if (cliProxy) {
        let totalUnrecognizedDelay = 0;
        const cliProxyStartedAt = Date.now();
        let hasPrintedGuiFallbackHint = false;
        for (;;) {
          if (samlResponseData) break;

          if (
            !hasPrintedGuiFallbackHint &&
            Date.now() - cliProxyStartedAt > GUI_FALLBACK_HINT_DELAY
          ) {
            printGuiFallbackHint();
            hasPrintedGuiFallbackHint = true;
          }

          let foundState = false;
          for (let i = 0; i < states.length; i++) {
            const state = states[i];

            let selected;
            try {
              selected = await page.$(state.selector);
            } catch (err) {
              if (err instanceof Error) {
                // An error can be thrown if the page isn't in a good state.
                // If one occurs, try again after another loop.
                debug(
                  `Error when running state "${
                    state.name
                  }". ${formatDebugErrorMessage(err)}. Retrying...`,
                );
              }
              break;
            }

            if (selected) {
              foundState = true;
              debug(`Found state: ${state.name}`);

              await Promise.race([
                samlResponsePromise,
                state.handler(
                  page,
                  selected,
                  noPrompt,
                  defaultUsername,
                  defaultPassword,
                  useRememberMe,
                  allowSensitiveStateOutput,
                ),
              ]);

              debug(`Finished state: ${state.name}`);

              break;
            }
          }

          if (foundState) {
            totalUnrecognizedDelay = 0;
          } else {
            debug("State not recognized!");
            if (totalUnrecognizedDelay > MAX_UNRECOGNIZED_PAGE_DELAY) {
              if (!allowSensitiveStateOutput) {
                throw new CLIError(
                  "Unable to recognize page state in a shared environment. Re-run locally with --mode=debug to capture a screenshot.",
                );
              }

              const path = "az2aws-unrecognized-state.png";
              await page.screenshot({ path });
              throw new CLIError(
                `Unable to recognize page state! A screenshot has been dumped to ${path}. If this problem persists, try running with --mode=gui or --mode=debug`,
              );
            }

            totalUnrecognizedDelay += DELAY_ON_UNRECOGNIZED_PAGE;
            await setTimeout(DELAY_ON_UNRECOGNIZED_PAGE);
          }
        }
      } else {
        console.log("Please complete the login in the opened window");
        await samlResponsePromise;
      }

      if (!samlResponseData) {
        throw new Error("SAML response not found");
      }

      const samlResponse = querystring.parse(samlResponseData).SAMLResponse;

      if (!samlResponse) {
        throw new Error("SAML response not found");
      } else if (Array.isArray(samlResponse)) {
        throw new Error("SAML can't be an array");
      }

      debug("Found SAML response", {
        base64Length: samlResponse.length,
      });

      return samlResponse;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  },

  /**
   * Parse AWS roles out of the SAML response
   * @param {string} assertion - The SAML assertion
   * @returns {Array.<{roleArn: string, principalArn: string}>} The roles
   * @private
   */
  _parseRolesFromSamlResponse(assertion: string): Role[] {
    debug("Converting assertion from base64 to UTF-8");
    const samlText = Buffer.from(assertion, "base64").toString("utf8");
    debug("Converted assertion from base64 to UTF-8", {
      xmlLength: samlText.length,
    });

    debug("Parsing SAML XML");
    const saml = load(samlText, { xmlMode: true });

    debug("Looking for role SAML attribute");
    const roleSelection = saml(
      "Attribute[Name='https://aws.amazon.com/SAML/Attributes/Role']>AttributeValue",
    );
    const roleNodes = roleSelection.toArray();
    const roles = roleNodes.map((roleNode) => {
      const roleAndPrincipal = saml(roleNode).text();
      const parts = roleAndPrincipal.split(",");

      // Role / Principal claims may be in either order
      const [roleIdx, principalIdx] = parts[0].includes(":role/")
        ? [0, 1]
        : [1, 0];
      const roleArn = parts[roleIdx].trim();
      const principalArn = parts[principalIdx].trim();
      return { roleArn, principalArn };
    });
    debug(
      "Found roles",
      roles.map((role) => ({
        roleArn: this._redactArnForDebug(role.roleArn),
        principalArn: this._redactArnForDebug(role.principalArn),
      })),
    );
    return roles;
  },

  /**
   * Ask the user for the role they want to use.
   * @param {Array.<{roleArn: string, principalArn: string}>} roles - The roles to pick from
   * @param {bool} [noPrompt] - Enable skipping of user prompting
   * @param {string} [defaultRoleArn] - The default role ARN
   * @param {number} [defaultDurationHours] - The default session duration in hours
   * @param {string} [nonInteractiveModeLabel] - CLI flag label to reference in
   * non-interactive errors
   * @returns {Promise.<{role: string, durationHours: number}>} The selected role and duration
   * @private
   */
  async _askUserForRoleAndDurationAsync(
    roles: Role[],
    noPrompt: boolean,
    defaultRoleArn: string,
    defaultDurationHours: string,
    nonInteractiveModeLabel = "--no-prompt",
  ): Promise<{
    role: Role;
    durationHours: number;
  }> {
    let role: Role | undefined;
    let durationHours = parseSessionDurationHours(defaultDurationHours) ?? 1;
    const questions: DistinctQuestion<RoleDurationAnswers>[] = [];
    if (roles.length === 0) {
      throw new CLIError("No roles found in SAML response.");
    } else if (roles.length === 1) {
      debug("Choosing the only role in response");
      role = roles[0];
    } else {
      if (noPrompt) {
        if (!defaultRoleArn) {
          throw new CLIError(
            `${nonInteractiveModeLabel} requires azure_default_role_arn when multiple roles are available.`,
          );
        }

        role = roles.find((r) => r.roleArn === defaultRoleArn);
        if (!role) {
          throw new CLIError(
            "Configured default role ARN was not found in the SAML response.",
          );
        }
        debug("Valid role found. No need to ask.");
      } else {
        debug("Asking user to choose role");
        questions.push({
          name: "role",
          message: "Role:",
          type: "select",
          choices: roles.map((r) => r.roleArn).sort(),
          default: defaultRoleArn,
        });
      }
    }

    if (noPrompt) {
      if (!defaultDurationHours) {
        debug("No default durationHours set. Using 1 hour.");
      } else {
        debug("Default durationHours found. No need to ask.");
      }
    } else {
      questions.push({
        name: "durationHours",
        message: "Session Duration Hours (up to 12):",
        type: "input",
        default: String(durationHours),
        validate: validateSessionDurationHours,
      });
    }

    // Don't prompt for questions if not needed, an unneeded TTYWRAP prevents node from exiting when
    // user is logged in and using multiple profiles --all-profiles and --no-prompt
    if (questions.length > 0) {
      const answers = await inquirer.prompt<RoleDurationAnswers>(questions);
      if (!role && answers.role) {
        role = roles.find((r) => r.roleArn === answers.role);
      }
      if (answers.durationHours) {
        const parsedDurationHours = parseSessionDurationHours(
          answers.durationHours,
        );
        if (parsedDurationHours === null) {
          throw new CLIError(sessionDurationHoursValidationMessage);
        }
        durationHours = parsedDurationHours;
      }
    }

    if (!role) {
      throw new Error(`Unable to find role`);
    }

    return { role, durationHours };
  },

  /**
   * Assume the role.
   * @param {string} profileName - The profile name
   * @param {string} assertion - The SAML assertion
   * @param {Role} role - The role to assume
   * @param {number} durationHours - The session duration in hours
   * @param {boolean} awsNoVerifySsl - Whether the AWS SDK STS client should
   * disable TLS certificate verification
   * @param {string} region - AWS region, if specified
   * @param {boolean} writeProfile - Whether to persist the credentials to the
   * AWS shared credentials file
   * @returns {Promise<AwsCredentials | undefined>} Retrieved credentials, or
   * undefined when STS does not return them
   * @private
   */
  async _assumeRoleAsync(
    profileName: string,
    assertion: string,
    role: Role,
    durationHours: number,
    awsNoVerifySsl: boolean,
    region: string,
    writeProfile = true,
  ): Promise<AwsCredentials | undefined> {
    console.log(`Assuming selected role in region ${region}...`);
    let stsOptions: STSClientConfig = {};

    if (awsNoVerifySsl) {
      console.warn(
        "WARNING: SSL certificate verification is disabled. " +
          "This makes the connection vulnerable to MITM attacks. " +
          "Consider using NODE_EXTRA_CA_CERTS environment variable instead.",
      );
    }

    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      const proxyOptions = awsNoVerifySsl ? { rejectUnauthorized: false } : {};
      stsOptions = {
        ...stsOptions,
        requestHandler: new NodeHttpHandler({
          httpsAgent: await this._createHttpsProxyAgentAsync(
            proxyUrl,
            proxyOptions,
          ),
        }),
      };
    } else if (awsNoVerifySsl) {
      stsOptions = {
        ...stsOptions,
        requestHandler: new NodeHttpHandler({
          httpsAgent: new Agent({
            rejectUnauthorized: false,
          }),
        }),
      };
    }

    if (region) {
      stsOptions = {
        ...stsOptions,
        region,
      };
    }

    const sts = new STS(stsOptions);
    const res = await sts.assumeRoleWithSAML({
      PrincipalArn: role.principalArn,
      RoleArn: role.roleArn,
      SAMLAssertion: assertion,
      DurationSeconds: Math.round(durationHours * 60 * 60),
    });

    if (!res.Credentials) {
      debug("Unable to get security credentials from AWS");
      return undefined;
    }

    if (
      !res.Credentials.AccessKeyId ||
      !res.Credentials.SecretAccessKey ||
      !res.Credentials.SessionToken ||
      !res.Credentials.Expiration
    ) {
      debug("Received incomplete credentials from AWS");
      throw new CLIError(
        "AWS returned incomplete credentials. One or more required fields " +
          "(AccessKeyId, SecretAccessKey, SessionToken, Expiration) are missing.",
      );
    }

    const credentials: AwsCredentials = {
      aws_access_key_id: res.Credentials.AccessKeyId,
      aws_secret_access_key: res.Credentials.SecretAccessKey,
      aws_session_token: res.Credentials.SessionToken,
      aws_expiration: res.Credentials.Expiration.toISOString(),
    };

    if (writeProfile) {
      await awsConfig.setProfileCredentialsAsync(profileName, credentials);
      printCredentialsReadyMessage(profileName, credentials);
    }

    return credentials;
  },
};
