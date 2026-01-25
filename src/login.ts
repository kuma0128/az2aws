import Bluebird from "bluebird";
import inquirer, { QuestionCollection } from "inquirer";
import zlib from "zlib";
import { STS, STSClientConfig } from "@aws-sdk/client-sts";
import { load } from "cheerio";
import { v4 } from "uuid";
import puppeteer, { Browser, HTTPRequest } from "puppeteer";
import querystring from "querystring";
import _debug from "debug";
import { CLIError } from "./CLIError";
import { awsConfig, ProfileConfig } from "./awsConfig";
import { HttpsProxyAgent } from "https-proxy-agent";
import { paths } from "./paths";
import mkdirp from "mkdirp";
import fs from "fs/promises";
import { Agent } from "https";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { states } from "./loginStates";

const debug = _debug("az2aws");

const WIDTH = 425;
const HEIGHT = 550;
const DELAY_ON_UNRECOGNIZED_PAGE = 1000;
const MAX_UNRECOGNIZED_PAGE_DELAY = 30 * 1000;

// source: https://docs.microsoft.com/en-us/azure/active-directory/hybrid/how-to-connect-sso-quick-start#google-chrome-all-platforms
const AZURE_AD_SSO = "autologon.microsoftazuread-sso.com";
const AWS_SAML_ENDPOINT = "https://signin.aws.amazon.com/saml";
const AWS_CN_SAML_ENDPOINT = "https://signin.amazonaws.cn/saml";
const AWS_GOV_SAML_ENDPOINT = "https://signin.amazonaws-us-gov.com/saml";

const getProxyUrl = (): string | undefined =>
  process.env.https_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.http_proxy ||
  process.env.HTTP_PROXY;

interface Role {
  roleArn: string;
  principalArn: string;
}

export const login = {
  async loginAsync(
    profileName: string,
    mode: string,
    disableSandbox: boolean,
    noPrompt: boolean,
    enableChromeNetworkService: boolean,
    awsNoVerifySsl: boolean,
    enableChromeSeamlessSso: boolean,
    noDisableExtensions: boolean,
    disableGpu: boolean
  ): Promise<void> {
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
      `Using AWS region ${profile.region || "(from AWS SDK defaults)"}`
    );
    if (profile.region && profile.region.startsWith("us-gov")) {
      console.warn(
        "GovCloud region detected in profile. Note: Other AWS CLI operations " +
          "will use your AWS CLI default region. If needed, set it to match " +
          "this GovCloud region (us-gov-west-1 or us-gov-east-1)."
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
      assertionConsumerServiceURL
    );
    const samlResponse = await this._performLoginAsync(
      loginUrl,
      headless,
      disableSandbox,
      cliProxy,
      noPrompt,
      enableChromeNetworkService,
      profile.azure_default_username,
      profile.azure_default_password,
      enableChromeSeamlessSso,
      profile.azure_default_remember_me,
      noDisableExtensions,
      disableGpu
    );
    const roles = this._parseRolesFromSamlResponse(samlResponse);
    const { role, durationHours } = await this._askUserForRoleAndDurationAsync(
      roles,
      noPrompt,
      profile.azure_default_role_arn,
      profile.azure_default_duration_hours
    );

    await this._assumeRoleAsync(
      profileName,
      samlResponse,
      role,
      durationHours,
      awsNoVerifySsl,
      profile.region
    );
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
    disableGpu: boolean
  ): Promise<void> {
    const profiles = await awsConfig.getAllProfileNames();

    if (!profiles) {
      return;
    }

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
        disableGpu
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
    debug({
      ...env,
      azure_default_password: "xxxxxxxxxx",
    });
    return env;
  },

  // Load the profile
  async _loadProfileAsync(profileName: string): Promise<ProfileConfig> {
    const profile = await awsConfig.getProfileConfigAsync(profileName);

    if (!profile)
      throw new CLIError(
        `Unknown profile '${profileName}'. You must configure it first with --configure.`
      );

    const env = this._loadProfileFromEnv();
    for (const prop in env) {
      if (env[prop]) {
        profile[prop] = env[prop] === null ? profile[prop] : env[prop];
      }
    }

    if (!profile.azure_tenant_id || !profile.azure_app_id_uri)
      throw new CLIError(
        `Profile '${profileName}' is not configured properly.`
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
    assertionConsumerServiceURL: string
  ): Promise<string> {
    debug("Generating UUID for SAML request");
    const id = v4();

    const samlRequest = `
        <samlp:AuthnRequest xmlns="urn:oasis:names:tc:SAML:2.0:metadata" ID="id${id}" Version="2.0" IssueInstant="${new Date().toISOString()}" IsPassive="false" AssertionConsumerServiceURL="${assertionConsumerServiceURL}" xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
            <Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">${appIdUri}</Issuer>
            <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"></samlp:NameIDPolicy>
        </samlp:AuthnRequest>
        `;
    debug("Generated SAML request", samlRequest);

    debug("Deflating SAML");

    return new Promise((resolve, reject) => {
      zlib.deflateRaw(samlRequest, (err, samlBuffer) => {
        if (err) {
          return reject(err);
        }

        debug("Encoding SAML in base64");
        const samlBase64 = samlBuffer.toString("base64");

        const url = `https://login.microsoftonline.com/${tenantId}/saml2?SAMLRequest=${encodeURIComponent(
          samlBase64
        )}`;
        debug("Created login URL", url);

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
    disableGpu: boolean
  ): Promise<string> {
    debug("Loading login page in Chrome");

    let browser: Browser | undefined;

    try {
      const args = headless
        ? []
        : [`--app=${url}`, `--window-size=${WIDTH},${HEIGHT}`];
      if (disableSandbox) args.push("--no-sandbox");
      if (enableChromeNetworkService)
        args.push("--enable-features=NetworkService");
      if (enableChromeSeamlessSso)
        args.push(
          `--auth-server-whitelist=${AZURE_AD_SSO}`,
          `--auth-negotiate-delegate-whitelist=${AZURE_AD_SSO}`
        );
      debug(`rememberMe value: ${rememberMe} (type: ${typeof rememberMe})`);
      if (rememberMe) {
        if (paths.userDataDir) {
          args.push(`--user-data-dir=${paths.userDataDir}`);
        } else {
          await mkdirp(paths.chromium);
          args.push(`--user-data-dir=${paths.chromium}`);
        }

        // --profile-directory requires --user-data-dir to work properly
        if (paths.profileDir) {
          args.push(`--profile-directory=${paths.profileDir}`);
        }
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
          rememberMe &&
          !paths.userDataDir
        ) {
          debug(
            `Browser launch failed with TargetCloseError. Resetting profile at ${paths.chromium}`
          );
          console.warn(
            "Browser profile appears incompatible. Resetting profile data and retrying..."
          );
          await fs.rm(paths.chromium, { recursive: true, force: true });
          await mkdirp(paths.chromium);
          browser = await puppeteer.launch(launchParams);
        } else {
          throw e;
        }
      }

      // Wait for a bit as sometimes the browser isn't ready.
      await Bluebird.delay(200);

      const pages = await browser.pages();
      const page = pages[0];
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en",
      });
      await page.setViewport({ width: WIDTH - 15, height: HEIGHT - 35 });

      // Prevent redirection to AWS
      let samlResponseData;
      const samlResponsePromise = new Promise((resolve) => {
        page.on("request", (req: HTTPRequest) => {
          const reqURL = req.url();
          debug(`Request: ${reqURL}`);
          if (
            reqURL === AWS_SAML_ENDPOINT ||
            reqURL === AWS_GOV_SAML_ENDPOINT ||
            reqURL === AWS_CN_SAML_ENDPOINT
          ) {
            resolve(undefined);
            samlResponseData = req.postData();
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            req.respond({
              status: 200,
              contentType: "text/plain",
              headers: {},
              body: "",
            });
            if (browser) {
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              browser.close();
            }
            browser = undefined;
            debug(`Received SAML response, browser closed`);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            req.continue();
          }
        });
      });

      debug("Enabling request interception");
      await page.setRequestInterception(true);

      try {
        if (headless || (!headless && cliProxy)) {
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
          debug(`Error occurred during loading the first page: ${err.message}`);
        }
      }

      if (cliProxy) {
        let totalUnrecognizedDelay = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (samlResponseData) break;

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
                  }". ${err.toString()}. Retrying...`
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
                  rememberMe
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
              const path = "az2aws-unrecognized-state.png";
              await page.screenshot({ path });
              throw new CLIError(
                `Unable to recognize page state! A screenshot has been dumped to ${path}. If this problem persists, try running with --mode=gui or --mode=debug`
              );
            }

            totalUnrecognizedDelay += DELAY_ON_UNRECOGNIZED_PAGE;
            await Bluebird.delay(DELAY_ON_UNRECOGNIZED_PAGE);
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

      debug("Found SAML response", samlResponse);

      if (!samlResponse) {
        throw new Error("SAML response not found");
      } else if (Array.isArray(samlResponse)) {
        throw new Error("SAML can't be an array");
      }

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
    debug("Converted", samlText);

    debug("Parsing SAML XML");
    const saml = load(samlText, { xmlMode: true });

    debug("Looking for role SAML attribute");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const roles: Role[] = saml(
      "Attribute[Name='https://aws.amazon.com/SAML/Attributes/Role']>AttributeValue"
    )
      .map(function () {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const roleAndPrincipal = saml(this).text();
        const parts = roleAndPrincipal.split(",");

        // Role / Principal claims may be in either order
        const [roleIdx, principalIdx] = parts[0].includes(":role/")
          ? [0, 1]
          : [1, 0];
        const roleArn = parts[roleIdx].trim();
        const principalArn = parts[principalIdx].trim();
        return { roleArn, principalArn };
      })
      .get();
    debug("Found roles", roles);
    return roles;
  },

  _generateTotpFromSecret(secret: string, epoch?: number): string {
    return generateTotpFromSecret(secret, epoch);
  },

  /**
   * Ask the user for the role they want to use.
   * @param {Array.<{roleArn: string, principalArn: string}>} roles - The roles to pick from
   * @param {bool} [noPrompt] - Enable skipping of user prompting
   * @param {string} [defaultRoleArn] - The default role ARN
   * @param {number} [defaultDurationHours] - The default session duration in hours
   * @returns {Promise.<{role: string, durationHours: number}>} The selected role and duration
   * @private
   */
  async _askUserForRoleAndDurationAsync(
    roles: Role[],
    noPrompt: boolean,
    defaultRoleArn: string,
    defaultDurationHours: string
  ): Promise<{
    role: Role;
    durationHours: number;
  }> {
    let role;
    let durationHours = 1;
    if (defaultDurationHours) {
      const parsedDuration = parseInt(defaultDurationHours, 10);
      if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
        durationHours = parsedDuration;
      }
    }
    const questions: QuestionCollection[] = [];
    if (roles.length === 0) {
      throw new CLIError("No roles found in SAML response.");
    } else if (roles.length === 1) {
      debug("Choosing the only role in response");
      role = roles[0];
    } else {
      if (noPrompt) {
        if (!defaultRoleArn) {
          throw new CLIError(
            "--no-prompt requires azure_default_role_arn when multiple roles are available."
          );
        }

        role = roles.find((r) => r.roleArn === defaultRoleArn);
        if (!role) {
          throw new CLIError(
            `Default role ARN '${defaultRoleArn}' was not found in the SAML response.`
          );
        }
        debug("Valid role found. No need to ask.");
      } else {
        debug("Asking user to choose role");
        questions.push({
          name: "role",
          message: "Role:",
          type: "list",
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
        default: defaultDurationHours || 1,
        validate: (input): boolean | string => {
          input = Number(input);
          if (input > 0 && input <= 12) return true;
          return "Duration hours must be between 1 and 12";
        },
      });
    }

    // Don't prompt for questions if not needed, an unneeded TTYWRAP prevents node from exiting when
    // user is logged in and using multiple profiles --all-profiles and --no-prompt
    if (questions.length > 0) {
      const answers = await inquirer.prompt(questions);
      if (!role) role = roles.find((r) => r.roleArn === answers.role);
      if (answers.durationHours) {
        durationHours = parseInt(answers.durationHours as string, 10);
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
   * @param {string} role - The role to assume
   * @param {number} durationHours - The session duration in hours
   * @param {bool} awsNoVerifySsl - Whether to have the AWS CLI verify SSL
   * @param {string} region - AWS region, if specified
   * @returns {Promise} A promise
   * @private
   */
  async _assumeRoleAsync(
    profileName: string,
    assertion: string,
    role: Role,
    durationHours: number,
    awsNoVerifySsl: boolean,
    region: string
  ): Promise<void> {
    console.log(`Assuming role ${role.roleArn} in region ${region}...`);
    let stsOptions: STSClientConfig = {};

    if (awsNoVerifySsl) {
      console.warn(
        "WARNING: SSL certificate verification is disabled. " +
          "This makes the connection vulnerable to MITM attacks. " +
          "Consider using NODE_EXTRA_CA_CERTS environment variable instead."
      );
    }

    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      const proxyOptions = awsNoVerifySsl ? { rejectUnauthorized: false } : {};
      stsOptions = {
        ...stsOptions,
        requestHandler: new NodeHttpHandler({
          httpsAgent: new HttpsProxyAgent(proxyUrl, proxyOptions),
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
      return;
    }

    await awsConfig.setProfileCredentialsAsync(profileName, {
      aws_access_key_id: res.Credentials.AccessKeyId ?? "",
      aws_secret_access_key: res.Credentials.SecretAccessKey ?? "",
      aws_session_token: res.Credentials.SessionToken ?? "",
      aws_expiration: res.Credentials.Expiration?.toISOString() ?? "",
    });
  },
};
