[![view on npm](http://img.shields.io/npm/v/az2aws.svg)](https://www.npmjs.org/package/az2aws)
[![npm module downloads per month](http://img.shields.io/npm/dm/az2aws.svg)](https://www.npmjs.org/package/az2aws)

# az2aws

If your organization uses [Azure Active Directory](https://azure.microsoft.com) to provide SSO login to the AWS console, then there is no easy way to log in on the command line or to use the [AWS CLI](https://aws.amazon.com/cli/). This tool fixes that. It lets you use the normal Azure AD login (including MFA) from a command line to create a federated AWS session and places the temporary credentials in the proper place for the AWS CLI and SDKs.

## Installation

Installation can be done in any of the following platform - Windows, Linux, Docker, Snap

### Windows

Install [Node.js](https://nodejs.org/) v22 or higher. Then install az2aws with npm:

    npm install -g az2aws

You may need to install puppeteer dependency, if you're getting missing chrome or chromium message

    node <node_modules_dir>/az2aws/node_modules/puppeteer/install.js

### Linux

In Linux you can either install for all users or just the current user. In either case, you must first install [Node.js](https://nodejs.org/) v22 or higher and any [puppeteer dependencies](https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#chrome-headless-doesnt-launch). Then follow the appropriate instructions.

#### Option A: Install for All Users

Install az2aws globally with npm:

    sudo npm install -g az2aws --unsafe-perm

Puppeteer doesn't install globally with execution permissions for all users so you'll need to modify them:

    sudo chmod -R go+rx $(npm root -g)

#### Option B: Install Only for Current User

First configure npm to install global packages in [your home directory](https://docs.npmjs.com/getting-started/fixing-npm-permissions):

    mkdir ~/.npm-global
    npm config set prefix '~/.npm-global'
    export PATH=~/.npm-global/bin:$PATH
    source ~/.profile
    echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
    source ~/.profile

Then install az2aws:

    npm install -g az2aws

### Docker

A Docker image has been built with az2aws preinstalled. You simply need to run the command with a volume mounted to your AWS configuration directory.

    docker run --rm -it -v ~/.aws:/root/.aws az2aws/az2aws

The Docker image is configured with an entrypoint so you can just feed any arguments in at the end.

You can also put the docker-launch.sh script into your bin directory for the az2aws command to function as usual:

    # Download the script (replace VERSION with a specific release tag, e.g., v1.0.0)
    curl -o /tmp/az2aws https://raw.githubusercontent.com/az2aws/az2aws/VERSION/docker-launch.sh -L

    # IMPORTANT: Review the script before installing
    cat /tmp/az2aws

    # Install after verification
    sudo mv /tmp/az2aws /usr/local/bin/az2aws
    sudo chmod +x /usr/local/bin/az2aws

> **Security Note:** Always download from a specific release tag (not `main`) and review the script contents before installing. Downloading and executing scripts directly from mutable branch heads poses a supply chain risk.

Now just run `az2aws`.

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

## Usage

### Configuration

#### AWS

To configure the az2aws client run:

    az2aws --configure

You'll need your [Azure Tenant ID and the App ID URI](#getting-your-tenant-id-and-app-id-uri). To configure a named profile, use the --profile flag.

    az2aws --configure --profile foo

##### GovCloud Support

To use az2aws with AWS GovCloud, set the `region` profile property in your ~/.aws/config to the one of the GovCloud regions:

- us-gov-west-1
- us-gov-east-1

##### China Region Support

To use az2aws with AWS China Cloud, set the `region` profile property in your ~/.aws/config to the China region:

- cn-north-1

#### Staying logged in, skip username/password for future logins

During the configuration you can decide to stay logged in:

    ? Stay logged in: skip authentication while refreshing aws credentials (true|false) (false)

If you set this configuration to true, the usual authentication with username/password/MFA is skipped as it's using session cookies to remember your identity. This enables you to use `--no-prompt` without the need to store your password anywhere, it's an alternative for using environment variables as described below.
As soon as you went through the full login procedure once, you can just use:

    az2aws --no-prompt

or

    az2aws --profile foo --no-prompt

to refresh your aws credentials.

#### Environment Variables

You can optionally store your responses as environment variables:

- `AZURE_TENANT_ID`
- `AZURE_APP_ID_URI`
- `AZURE_DEFAULT_USERNAME`
- `AZURE_DEFAULT_PASSWORD`
- `AZURE_DEFAULT_ROLE_ARN`
- `AZURE_DEFAULT_DURATION_HOURS`

To avoid having to `<Enter>` through the prompts after setting these environment variables, use the `--no-prompt` option when running the command.

    az2aws --no-prompt

Use the `HISTCONTROL` environment variable to avoid storing the password in your bash history (notice the space at the beginning):

    $ HISTCONTROL=ignoreboth
    $  export AZURE_DEFAULT_PASSWORD=mypassword
    $ az2aws

#### Use an Existing Chrome Install and Profile

Instead of using the bundled Chromium, you can use an existing Chrome installation with your own user profile by setting the following environment variables:

- `BROWSER_CHROME_BIN` - Path to Chrome executable
- `BROWSER_USER_DATA_DIR` - Chrome user data directory
- `BROWSER_PROFILE_DIR` - Chrome profile name (e.g., "Default")

Example (macOS):

    export BROWSER_CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    export BROWSER_USER_DATA_DIR="/Users/<user>/Library/Application Support/Google/Chrome"
    export BROWSER_PROFILE_DIR="Default"
    aws-azure-login --mode gui --no-disable-extensions --no-sandbox

Example (Linux):

    export BROWSER_CHROME_BIN="/usr/bin/google-chrome"
    export BROWSER_USER_DATA_DIR="/home/<user>/.config/google-chrome"
    export BROWSER_PROFILE_DIR="Default"
    aws-azure-login --mode gui --no-disable-extensions --no-sandbox

Using Chrome instead of Chromium allows you to use browser extensions such as password managers.

### Logging In

Once az2aws is configured, you can log in. For the default profile, just run:

    az2aws

You will be prompted for your username and password. If MFA is required you'll also be prompted for a verification code or mobile device approval. To log in with a named profile:

    az2aws --profile foo

Alternatively, you can set the `AWS_PROFILE` environmental variable to the name of the profile just like the AWS CLI.

Once you log in you can use the AWS CLI or SDKs as usual!

If you are logging in on an operating system with a GUI, you can log in using the actual Azure web form instead of the CLI:

    az2aws --mode gui

Logging in with GUI mode is likely to be much more reliable.

_Note:_ on virtual machines, or when rendering of the puppeteer UI fails, you might need to disable the GPU Hardware Acceleration:

    az2aws --mode gui --disable-gpu

_Note:_ on Linux you will likely need to disable the Puppeteer sandbox or Chrome will fail to launch:

    az2aws --no-sandbox

### Behind corporate proxy

If behind corporate proxy, then just set https_proxy env variable.

## Automation

### Renew credentials for all configured profiles

You can renew credentials for all configured profiles in one run. This is especially useful, if the maximum session length on AWS side is configured to a low value due to security constraints. Just run:

    az2aws --all-profiles

If you configure all profiles to stay logged in, you can easily skip the prompts:

    az2aws --all-profiles --no-prompt

This will allow you to automate the credentials refresh procedure, eg. by running a cronjob every 5 minutes.
To skip unnecessary calls, the credentials are only getting refreshed if the time to expire is lower than 11 minutes.

## Getting Your Tenant ID and App ID URI

Your Azure AD system admin should be able to provide you with your Tenant ID and App ID URI. If you can't get it from them, you can scrape it from a login page from the myapps.microsoft.com page.

1. Load the myapps.microsoft.com page.
2. Click the chicklet for the login you want.
3. In the window the pops open quickly copy the login.microsoftonline.com URL. (If you miss it just try again. You can also open the developer console with nagivation preservation to capture the URL.)
4. The GUID right after login.microsoftonline.com/ is the tenant ID.
5. Copy the SAMLRequest URL param.
6. Paste it into a URL decoder ([like this one](https://www.samltool.com/url.php)) and decode.
7. Paste the decoded output into the a SAML deflated and encoded XML decoder ([like this one](https://www.samltool.com/decode.php)).
8. In the decoded XML output the value of the `Audience` tag is the App ID URI.
9. You may double-check tenant ID using `Attribute` tag named `tenantid` provided in XML.

## How It Works

The Azure login page uses JavaScript, which requires a real web browser. To automate this from a command line, az2aws uses [Puppeteer](https://github.com/GoogleChrome/puppeteer), which automates a real Chromium browser. It loads the Azure login page behind the scenes, populates your username and password (and MFA token), parses the SAML assertion, uses the [AWS STS AssumeRoleWithSAML API](http://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithSAML.html) to get temporary credentials, and saves these in the CLI credentials file.

## Troubleshooting

The nature of browser automation with Puppeteer means the solution is bit brittle. A minor change on the Microsoft side could break the tool. If something isn't working, you can fall back to GUI mode (above). To debug an issue, you can run in debug mode (--mode debug) to see the GUI while az2aws tries to populate it. You can also have the tool print out more detail on what it is doing to try to do in order to diagnose. az2aws uses the [Node debug module](https://www.npmjs.com/package/debug) to print out debug info. Just set the DEBUG environmental variable to 'az2aws'. On Linux/OS X:

    DEBUG=az2aws az2aws

On Windows:

    set DEBUG=az2aws
    az2aws

## Support for Other Authentication Providers

Obviously, this tool only supports Azure AD as an identity provider. However, there is a lot of similarity with how other logins with other providers would work (especially if they are SAML providers). If you are interested in building support for a different provider let me know. It would be great to build a more generic AWS CLI login tool with plugins for the various providers.

## Acknowledgements

This project is forked from [aws-azure-login](https://github.com/aws-azure-login/aws-azure-login). Thanks to the original authors and contributors.
