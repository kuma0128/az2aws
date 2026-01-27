[![view on npm](http://img.shields.io/npm/v/az2aws.svg)](https://www.npmjs.org/package/az2aws)
[![npm module downloads per month](http://img.shields.io/npm/dm/az2aws.svg)](https://www.npmjs.org/package/az2aws)
[![CI](https://github.com/kuma0128/az2aws/actions/workflows/main.yml/badge.svg)](https://github.com/kuma0128/az2aws/actions/workflows/main.yml)
[![codecov](https://codecov.io/gh/kuma0128/az2aws/graph/badge.svg)](https://codecov.io/gh/kuma0128/az2aws)

# az2aws

Log in to AWS CLI using [Azure Active Directory](https://azure.microsoft.com) SSO. Supports MFA and places temporary credentials in the proper location for AWS CLI and SDKs.

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

You must install [puppeteer dependencies](https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#chrome-headless-doesnt-launch) first.

**Install for all users:**

    sudo npm install -g az2aws --unsafe-perm
    sudo chmod -R go+rx $(npm root -g)

**Install for current user only:**

    mkdir ~/.npm-global
    npm config set prefix '~/.npm-global'
    echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
    source ~/.profile
    npm install -g az2aws

#### Windows Notes

If you get a missing Chrome/Chromium error, install the puppeteer dependency manually:

    node <node_modules_dir>/az2aws/node_modules/puppeteer/install.js

### Docker

Run az2aws with a volume mounted to your AWS configuration directory:

    docker run --rm -it -v ~/.aws:/root/.aws az2aws/az2aws

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

https://snapcraft.io/az2aws

## Command Options

| Option | Description |
|--------|-------------|
| `--profile (-p)` | Profile name to use. Default: `default` or `AWS_PROFILE` |
| `--all-profiles (-a)` | Run for all configured profiles |
| `--force-refresh (-f)` | Force refresh even if credentials are valid |
| `--configure (-c)` | Configure the profile |
| `--mode (-m) <mode>` | `cli` (default), `gui`, or `debug` |
| `--no-sandbox` | Disable Puppeteer sandbox (needed on Linux) |
| `--no-prompt` | Skip prompts, use defaults |
| `--enable-chrome-network-service` | Enable Network Service (for 3XX redirects) |
| `--no-verify-ssl` | Disable AWS SSL verification |
| `--enable-chrome-seamless-sso` | Enable Azure AD Seamless SSO |
| `--no-disable-extensions` | Keep browser extensions enabled |
| `--disable-gpu` | Disable GPU acceleration |
| `--version (-v)` | Show version number |

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

Enable "Stay logged in" during configuration to use `--no-prompt` without storing passwords:

    az2aws --no-prompt
    az2aws --profile foo --no-prompt

#### Environment Variables

You can set defaults via environment variables (use with `--no-prompt`):

- `AZURE_TENANT_ID` / `AZURE_APP_ID_URI` - Azure AD settings
- `AZURE_DEFAULT_USERNAME` / `AZURE_DEFAULT_PASSWORD` - Credentials
- `AZURE_DEFAULT_ROLE_ARN` / `AZURE_DEFAULT_DURATION_HOURS` - AWS role settings

When using `--no-prompt` with multiple available roles, you must set
`AZURE_DEFAULT_ROLE_ARN` (or configure `azure_default_role_arn`) so the CLI can
select a role without prompting.

To avoid storing passwords in bash history, use a leading space:

    HISTCONTROL=ignoreboth
     export AZURE_DEFAULT_PASSWORD=mypassword

#### Use an Existing Chrome Install and Profile

Use your own Chrome installation by setting these environment variables:

- `BROWSER_CHROME_BIN` - Path to Chrome executable
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

You'll be prompted for username, password, and MFA if required. After login, use AWS CLI/SDKs as usual.

**Tips:**
- Set `AWS_PROFILE` env var instead of using `--profile`
- Use `--mode gui --disable-gpu` on VMs or if rendering fails
- Set `https_proxy` env var for corporate proxy

#### Troubleshooting

If you see device compliance errors (e.g., "Device UnSecured Or Non-Compliant"),
Try:
 `--mode gui` and use your system Chrome via `BROWSER_CHROME_BIN`.

If you see "Unable to recognize page state!", Azure's login pages may have
changed. Try:

- `--mode gui` or `--mode debug`
- Filing an issue with the screenshot (`az2aws-unrecognized-state.png`) to help maintainers update selectors

## Automation

Renew all profiles at once:

    az2aws --all-profiles
    az2aws --all-profiles --no-prompt    # With "Stay logged in" enabled

Credentials are only refreshed if expiring within 11 minutes - safe to run as a cron job.

## Getting Your Tenant ID and App ID URI

Ask your Azure AD admin for these values, or extract them from myapps.microsoft.com:

1. Load the myapps.microsoft.com page.
2. Click the app tile for the login you want.
3. In the window that pops open, quickly copy the login.microsoftonline.com URL. (You can also use browser DevTools with "Preserve log" enabled to capture it.)
4. The GUID right after login.microsoftonline.com/ is the tenant ID.
5. Copy the SAMLRequest URL param.
6. Paste it into a URL decoder ([like this one](https://www.samltool.com/url.php)) and decode.
7. Paste the decoded output into a SAML deflated and encoded XML decoder ([like this one](https://www.samltool.com/decode.php)).
8. In the decoded XML output the value of the `Audience` tag is the App ID URI.
9. Verify the tenant ID using the `tenantid` attribute in the XML.

## How It Works

az2aws uses [Puppeteer](https://github.com/GoogleChrome/puppeteer) to automate a Chromium browser for Azure AD login. It parses the SAML response and calls [AWS STS AssumeRoleWithSAML](http://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithSAML.html) to get temporary credentials.

## Troubleshooting

If login fails, try these in order:

1. **GUI mode**: `az2aws --mode gui` - most reliable
2. **Debug mode**: `az2aws --mode debug` - see browser while CLI runs
3. **Verbose logging**: `DEBUG=az2aws az2aws` (Windows: `set DEBUG=az2aws && az2aws`)

## Support for Other Authentication Providers

This tool only supports Azure AD. Contributions for other SAML providers are welcome - open an issue on GitHub to discuss.

## Acknowledgements

This project is forked from [aws-azure-login](https://github.com/aws-azure-login/aws-azure-login). Thanks to the original authors and contributors.
