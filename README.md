[![view on npm](http://img.shields.io/npm/v/az2aws.svg)](https://www.npmjs.org/package/az2aws)
[![npm module downloads per month](http://img.shields.io/npm/dm/az2aws.svg?cacheSeconds=86400)](https://www.npmjs.org/package/az2aws)
[![CI](https://github.com/kuma0128/az2aws/actions/workflows/main.yml/badge.svg)](https://github.com/kuma0128/az2aws/actions/workflows/main.yml)
[![codecov](https://codecov.io/gh/kuma0128/az2aws/graph/badge.svg)](https://codecov.io/gh/kuma0128/az2aws)

# az2aws

Log in to AWS CLI using [Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/) SSO. Supports MFA and places temporary credentials in the proper location for AWS CLI and SDKs.

az2aws drives a browser that is already installed on your machine (Google
Chrome, Microsoft Edge, or Chromium) and does **not** download or bundle one:

- **Windows**: works out of the box (Edge ships with Windows).
- **macOS**: install Google Chrome or Microsoft Edge.
- **Linux**: install `google-chrome`, `chromium`, or `microsoft-edge`.

Firefox and Safari are not supported.

> **💡 Tip:** Let's be honest — typing `az2aws` correctly on the first try is harder than the AWS certification exam. Save your sanity:
>
> ```sh
> # Add to your ~/.zshrc or ~/.bashrc
> alias a2='az2aws'
> # or
> alias aa='az2aws'
> ```
>
> Your fingers will thank you. Your keyboard will thank you. Your coworkers will stop hearing you swear.

## Contents

- [Installation](#installation)
  - [mise (Recommended)](#mise-recommended)
  - [npm](#npm)
  - [Docker](#docker)
  - [Snap](#snap)
- [Command Options](#command-options)
- [Usage](#usage)
  - [Configuration](#configuration)
  - [Logging In](#logging-in)
- [Automation](#automation)
  - [Which profiles `--all-profiles` refreshes](#which-profiles---all-profiles-refreshes)
- [Getting Your Tenant ID and App ID URI](#getting-your-tenant-id-and-app-id-uri)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Support for Other Authentication Providers](#support-for-other-authentication-providers)
- [Acknowledgements](#acknowledgements)

## Installation

### mise (Recommended)

[mise](https://mise.jdx.dev/) is a version manager that can install az2aws directly.

Install mise:

    curl https://mise.run | sh

Activate mise in your shell:

    # For zsh (macOS default)
    echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
    source ~/.zshrc

    # For bash (Linux default)
    echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
    source ~/.bashrc

Install az2aws:

    mise use -g npm:az2aws

### npm

Install [Node.js](https://nodejs.org/) v24 or higher, then install az2aws:

    npm install -g az2aws

#### Linux Notes

Install a Chromium-based browser first (for example `sudo apt install
chromium` or Google Chrome), then install az2aws:

**Install for all users:**

    sudo npm install -g az2aws
    sudo chmod -R go+rx $(npm root -g)

**Install for current user only:**

    mkdir ~/.npm-global
    npm config set prefix '~/.npm-global'
    echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
    source ~/.profile
    npm install -g az2aws

#### Windows Notes

No extra steps: az2aws uses your installed Chrome or the Microsoft Edge that
ships with Windows.

### Docker

Run az2aws with a volume mounted to your AWS configuration directory:

    docker run --rm -it -v ~/.aws:/root/.aws taiseiito1000/az2aws

You can also install the docker-launch.sh script to your PATH:

    # Download the script (replace VERSION with a specific release tag, e.g., v1.0.0)
    curl -o /tmp/az2aws https://raw.githubusercontent.com/kuma0128/az2aws/VERSION/docker-launch.sh -L

    # IMPORTANT: Review the script before installing
    cat /tmp/az2aws

    # Install after verification
    sudo mv /tmp/az2aws /usr/local/bin/az2aws
    sudo chmod +x /usr/local/bin/az2aws

> **Security Note:** Always download from a specific release tag (not `main`) and review the script before installing.

### Snap

The [Snap Store](https://snapcraft.io/az2aws) remains available for existing
v1 installations, but az2aws v2 and later are not published there. v2 drives
an installed Chromium-based browser, which is not accessible from the current
strictly confined Snap. Use npm or Docker for current releases.

## Command Options

| Option                            | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `--profile (-p)`                  | Profile name to use. Default: `default` or `AWS_PROFILE` |
| `--all-profiles (-a)`             | Run for all configured profiles                          |
| `--force-refresh (-f)`            | Force refresh even if credentials are valid              |
| `--configure (-c)`                | Configure the profile                                    |
| `--mode (-m) <mode>`              | `cli` (default), `gui`, or `debug`                       |
| `--no-sandbox`                    | Disable Puppeteer sandbox (needed on Linux)              |
| `--no-prompt`                     | Skip prompts, use defaults                               |
| `--enable-chrome-network-service` | Enable Network Service (for 3XX redirects)               |
| `--no-verify-ssl`                 | Disable AWS SSL verification                             |
| `--enable-chrome-seamless-sso`    | Enable Microsoft Entra Seamless SSO                      |
| `--no-disable-extensions`         | Keep browser extensions enabled                          |
| `--disable-gpu`                   | Disable GPU acceleration                                 |
| `--incognito`                     | Open the login flow in an incognito browser context      |
| `--credential-process`            | Output credentials for AWS CLI credential_process        |
| `--version (-v)`                  | Show version number                                      |

## Usage

### Configuration

To configure the az2aws client run:

    az2aws --configure

You'll need your [Azure Tenant ID and the App ID URI](#getting-your-tenant-id-and-app-id-uri). To configure a named profile, use the --profile flag.

    az2aws --configure --profile foo

#### GovCloud / China Region Support

Set the `region` in your ~/.aws/config to use non-standard AWS partitions:

- **GovCloud**: us-gov-west-1, us-gov-east-1
- **China**: cn-north-1, cn-northwest-1

For GovCloud, make sure your AWS CLI default region is set to a GovCloud
region if you do not set a profile region; otherwise STS calls may target the
standard partition.

#### Stay Logged In

New profiles enable "Stay logged in" by default during configuration. This lets
`az2aws` refresh AWS credentials with `--no-prompt` without storing passwords:

    az2aws --no-prompt
    az2aws --profile foo --no-prompt

`--incognito` starts the login flow in a fresh incognito browser context. This
helps avoid reusing an existing browser session, and it overrides any saved
"Stay logged in" browser state for that run.

#### AWS CLI credential_process

`az2aws --configure` offers to wire the profile to AWS CLI
[credential_process](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sourcing-external.html)
automatically (default: yes). It writes this line for you:

    [profile myprofile]
    credential_process = az2aws --profile=myprofile --credential-process

After wiring, run `az2aws --profile=myprofile` once to sign in. From then on,
every `aws` command refreshes credentials on its own — no more manual `az2aws`
runs (az2aws must be on `PATH` for the AWS CLI to invoke it).

**Credential caching.** The AWS CLI re-runs credential_process on every
invocation, so az2aws caches issued credentials in
`~/.aws/az2aws/cache/` (cache files use `0600` permissions on POSIX systems).
Filenames combine the profile name and active AWS config path into a
fixed-length hash, and each entry is also bound to the effective profile
settings. az2aws serves a matching entry without launching a browser while it
is valid for more than 11 more minutes.
Use `--force-refresh` to bypass the cache. Profiles wired to
credential_process intentionally do **not** get static keys written to
`~/.aws/credentials`: static keys there would take precedence over
credential_process and keep serving stale credentials after expiry. When
wiring an existing profile, az2aws removes its old static credentials only
after the initial login has durably populated the cache.

`--credential-process` uses the same non-interactive defaults as `--no-prompt`,
so make sure the profile already has the role and other required values set.
Standard output is reserved for the AWS CLI JSON payload, while human-readable
status messages are written to stderr.

Example stdout payload:

    {
      "Version": 1,
      "AccessKeyId": "...",
      "SecretAccessKey": "...",
      "SessionToken": "...",
      "Expiration": "2026-01-01T00:00:00.000Z"
    }

#### azaws compatibility

az2aws can reuse AWS CLI profiles created by the `azaws` OSS tool, such as
[`frontchug/azaws`](https://github.com/frontchug/azaws):

    [profile azaws-prod]
    azure_tenant_id = 00000000-0000-0000-0000-000000000000
    azure_app_id = `https://signin.aws.amazon.com/saml#example-prod`
    azure_duration_hours = 12
    region = ap-northeast-1

    az2aws --profile azaws-prod

For azaws compatibility, az2aws accepts `azure_app_id` as an alias for
`azure_app_id_uri` and `azure_duration_hours` as an alias for
`azure_default_duration_hours`.

If the profile can return multiple SAML roles, add `azure_default_role_arn` to
make non-interactive runs deterministic:

    [profile azaws-prod]
    azure_tenant_id = 00000000-0000-0000-0000-000000000000
    azure_app_id = https://signin.aws.amazon.com/saml#example-prod
    azure_default_role_arn = arn:aws:iam::123456789012:role/Az2awsSourceRole
    azure_duration_hours = 12

#### Environment Variables

You can set defaults via environment variables (use with `--no-prompt`):

- `AZURE_TENANT_ID` / `AZURE_APP_ID_URI` (`AZURE_APP_ID` alias) - Microsoft Entra ID settings
- `AZURE_DEFAULT_USERNAME` / `AZURE_DEFAULT_PASSWORD` - Credentials
- `AZURE_DEFAULT_ROLE_ARN` / `AZURE_DEFAULT_DURATION_HOURS` (`AZURE_DURATION_HOURS` alias) - AWS role settings

When using `--no-prompt` with multiple available roles, you must set
`AZURE_DEFAULT_ROLE_ARN` (or configure `azure_default_role_arn`) so the CLI can
select a role without prompting.

To avoid storing passwords in bash history, use a leading space:

    HISTCONTROL=ignoreboth
     export AZURE_DEFAULT_PASSWORD=mypassword

#### Browser Selection

az2aws automatically detects and uses your installed Google Chrome, Microsoft
Edge, or Chromium; it does not bundle a browser. Using a real browser also
keeps Microsoft Entra ID happy — Entra may treat automation-only builds (such
as Chrome for Testing) as untrusted, for example refusing to reuse "Stay
logged in" sessions. Firefox is not supported. If no browser is found, az2aws
exits with instructions instead of downloading one.

- `BROWSER_CHROME_BIN` - Explicit path to a Chromium-based browser (overrides auto-detection)
- `BROWSER_USE_SYSTEM_CHROME=0` - Disable auto-detection (requires `BROWSER_CHROME_BIN`)
- `BROWSER_USER_DATA_DIR` - Chrome user data directory
- `BROWSER_PROFILE_DIR` - Chrome profile name (e.g., "Default")

Example:

    # macOS
    export BROWSER_CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    export BROWSER_USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome"

    # Linux
    export BROWSER_CHROME_BIN="/usr/bin/google-chrome"
    export BROWSER_USER_DATA_DIR="$HOME/.config/google-chrome"

    # Common
    export BROWSER_PROFILE_DIR="Default"
    az2aws --mode gui --no-disable-extensions --no-sandbox

### Logging In

    az2aws                    # Default profile
    az2aws --profile foo      # Named profile
    az2aws --mode gui         # Use browser UI (more reliable)
    az2aws --mode debug       # Show the browser while az2aws still drives the flow
    az2aws --mode gui --incognito  # Open a fresh incognito login window

You'll be prompted for username, password, and MFA if required. After login, use AWS CLI/SDKs as usual.

`--mode gui` is fully manual and waits for you to complete the browser flow
yourself. If you want the browser to stay visible while az2aws still auto-fills
the login steps, use `--mode debug`.

**Tips:**

- Set `AWS_PROFILE` env var instead of using `--profile`
- Use `--mode gui --disable-gpu` on VMs or if rendering fails
- Set `https_proxy` or `http_proxy` env var for corporate proxy

#### Troubleshooting

If you see `TargetCloseError: Protocol error (Target.setAutoAttach): Target closed`,
the saved browser profile may be incompatible with your current browser
version (e.g., after the browser upgraded or you switched browsers). When
using the default managed profile (`~/.aws/chromium`) with "Stay logged in"
enabled, az2aws will automatically reset the profile and retry. If you have
set `BROWSER_USER_DATA_DIR` to point to an existing Chrome profile, az2aws
will **not** modify that directory — you will need to resolve the
incompatibility manually (e.g., use a different `BROWSER_USER_DATA_DIR`).

If you see device compliance errors (e.g., "Device UnSecured Or Non-Compliant"),
Try:
`--mode gui` and point `BROWSER_CHROME_BIN` at the browser your MDM manages.

If you are prompted for your password on every login even though "Stay logged
in" (`azure_default_remember_me`) is enabled, make sure az2aws is driving a
real browser install (see "Browser Selection") — Microsoft Entra ID may
refuse to reuse sign-in sessions created by automation-only browser builds.
After switching browsers, the first login asks for your credentials once;
subsequent logins reuse the Entra session until it expires.

If your Microsoft account requires a saved passkey prompt before the username
or password page appears, that flow is unsupported in `az2aws --mode cli`.
The prompt is rendered by the browser/OS passkey UI instead of the page DOM,
so az2aws cannot dismiss it automatically. Use `--mode gui` and handle it
manually, or use an account that can continue with the standard page-based
username/password/MFA flow.

If you see "Unable to recognize page state!", Azure's login pages may have
changed. Try:

- `--mode gui` or `--mode debug`
- Filing an issue with the screenshot (`az2aws-unrecognized-state.png`) to help maintainers update selectors

## Automation

Renew all profiles at once:

    az2aws --all-profiles
    az2aws --all-profiles --no-prompt    # With "Stay logged in" enabled

Credentials are only refreshed if expiring within 11 minutes - safe to run as a cron job.

### Which profiles `--all-profiles` refreshes

`--all-profiles` iterates every `[default]` / `[profile <name>]` section in
`~/.aws/config` that has **at least one `azure_*` key** (e.g.
`azure_tenant_id`, `azure_app_id_uri`, `azure_default_role_arn`). Sections
without any `azure_*` key — plain AWS profiles, `[sso-session ...]`,
`[services ...]` — are skipped.

Profiles that intentionally keep `azure_tenant_id` / `azure_app_id_uri` in
environment variables (`AZURE_TENANT_ID`, `AZURE_APP_ID_URI`) instead of
the config file are still refreshed, as long as they have some other
`azure_*` key on disk. If required values are missing even after the
env-var merge, az2aws fails loudly with
`Profile '<name>' is not configured properly.` rather than skipping
silently.

## Getting Your Tenant ID and App ID URI

Ask your Microsoft Entra ID admin for these values, or copy them from the
Microsoft Entra admin center:

- `azure_tenant_id`: Microsoft Entra ID > Overview > Tenant ID
- `azure_app_id_uri`: Enterprise applications > your AWS app > Single sign-on >
  Basic SAML Configuration > Identifier (Entity ID)

If the App ID URI contains `#`, escape it in `~/.aws/config`, for example:

    azure_app_id_uri = https://signin.aws.amazon.com/saml\#example-app

If you need to confirm the tenant ID from myapps.microsoft.com:

1. Open https://myapps.microsoft.com.
2. Click the AWS app tile.
3. Copy the `login.microsoftonline.com/<tenant-id>/saml2` URL from the popup or
   browser DevTools Network tab.
4. Use the value between `login.microsoftonline.com/` and `/saml2` as
   `azure_tenant_id`.

## How It Works

az2aws drives your installed Chromium-based browser over the [Chrome DevTools
Protocol](https://chromedevtools.github.io/devtools-protocol/) (via
[puppeteer-core](https://pptr.dev/guides/what-is-puppeteer), which does not
download a browser) to complete the Microsoft Entra ID login. The SAML
response is intercepted at the network layer inside the browser, before it
leaves your machine, and exchanged for temporary credentials with [AWS STS
AssumeRoleWithSAML](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithSAML.html).

## Troubleshooting

If login fails, try these in order:

1. **GUI mode**: `az2aws --mode gui` - most reliable
2. **Debug mode**: `az2aws --mode debug` - see browser while CLI runs
3. **Verbose logging**: `DEBUG=az2aws az2aws` (Windows: `set DEBUG=az2aws && az2aws`)

## Support for Other Authentication Providers

This tool only supports Microsoft Entra ID. Contributions for other SAML providers are welcome - open an issue on GitHub to discuss.

## Acknowledgements

This project is forked from [aws-azure-login](https://github.com/aws-azure-login/aws-azure-login). Thanks to the original authors and contributors.
