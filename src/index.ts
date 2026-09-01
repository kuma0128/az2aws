#!/usr/bin/env node

process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));

import { Command } from "commander";
import { configureProfileAsync } from "./configureProfileAsync";
import { login } from "./login";
import {
  formatCliErrorMessage,
  formatUnexpectedErrorMessage,
} from "./sensitiveOutput";
import { checkForUpdate } from "./updateNotifier";
import { validateCliOptions } from "./validateCliOptions";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .version(version, "-v, --version")
  .option(
    "-p, --profile <name>",
    "The name of the profile to log in with (or configure)",
  )
  .option("-a, --all-profiles", "Run for all configured profiles")
  .option(
    "-f, --force-refresh",
    "Force a credential refresh, even if cached credentials are still valid",
  )
  .option("-c, --configure", "Configure the profile")
  .option(
    "-m, --mode <mode>",
    "'cli' to hide the login page and perform the login through the CLI (default behavior), 'gui' to perform the login through the Azure GUI (more reliable but only works on GUI operating system), 'debug' to show the login page but perform the login through the CLI (useful to debug issues with the CLI login)",
  )
  .option(
    "--no-sandbox",
    "Disable the browser sandbox (usually necessary on Linux/Docker)",
  )
  .option(
    "--no-prompt",
    "Do not prompt for input and accept the default choice",
  )
  .option(
    "--enable-chrome-network-service",
    "Enable Chromium's Network Service (needed when login provider redirects with 3XX)",
  )
  .option(
    "--no-verify-ssl",
    "Disable SSL Peer Verification for connections to AWS",
  )
  .option(
    "--enable-chrome-seamless-sso",
    "Enable Chromium's pass-through authentication with Azure Active Directory Seamless Single Sign-On",
  )
  .option(
    "--no-disable-extensions",
    "Do not pass the --disable-extensions flag to the browser",
  )
  .option("--disable-gpu", "Pass the --disable-gpu flag to the browser")
  .option(
    "--credential-process",
    "Output credentials in JSON format for AWS CLI credential_process",
  )
  .option("--incognito", "Launch Chromium in incognito mode")
  .parse(process.argv);

const options = program.opts();

const profileName =
  (options.profile as string | undefined) ||
  process.env.AWS_PROFILE ||
  "default";
const mode = (options.mode as string | undefined) || "cli";
const disableSandbox = !options.sandbox;
const noPrompt = !options.prompt;
const enableChromeNetworkService = !!options.enableChromeNetworkService;
const awsNoVerifySsl = !options.verifySsl;
const enableChromeSeamlessSso = !!options.enableChromeSeamlessSso;
const forceRefresh = !!options.forceRefresh;
const noDisableExtensions = !options.disableExtensions;
const disableGpu = !!options.disableGpu;
const credentialProcess = !!options.credentialProcess;
const incognito = !!options.incognito;

// Start the update lookup immediately, but only print after the main flow ends.
const updateCheckPromise = checkForUpdate(version, {
  useColor: process.stderr.isTTY && !process.env.NO_COLOR,
});

async function runAsync(): Promise<void> {
  let exitCode = 0;

  try {
    validateCliOptions({
      allProfiles: !!options.allProfiles,
      configure: !!options.configure,
      credentialProcess,
    });

    if (options.allProfiles) {
      await login.loginAll(
        mode,
        disableSandbox,
        noPrompt,
        enableChromeNetworkService,
        awsNoVerifySsl,
        enableChromeSeamlessSso,
        forceRefresh,
        noDisableExtensions,
        disableGpu,
        incognito,
      );
    } else if (options.configure) {
      await configureProfileAsync(profileName);
    } else {
      await login.loginAsync(
        profileName,
        mode,
        disableSandbox,
        noPrompt,
        enableChromeNetworkService,
        awsNoVerifySsl,
        enableChromeSeamlessSso,
        noDisableExtensions,
        disableGpu,
        incognito,
        credentialProcess,
        forceRefresh,
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "CLIError") {
      console.error(formatCliErrorMessage(err.message));
      exitCode = 2;
    } else if (err instanceof Error) {
      console.error(formatUnexpectedErrorMessage(err));
      exitCode = 1;
    } else {
      console.error(formatUnexpectedErrorMessage(err));
      exitCode = 1;
    }
  }

  if (exitCode === 0) {
    const updateMessage = await updateCheckPromise;
    if (updateMessage) {
      process.stderr.write(updateMessage);
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

void runAsync();
