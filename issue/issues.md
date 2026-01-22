# GitHub Issues

## Bug Reports (Internal Code Issues)

---

### Issue #26: `--no-verify-ssl` and proxy settings conflict

**Labels:** `bug`, `priority: high`

**Description:**
When `awsNoVerifySsl` is `true`, the proxy settings are overwritten. In corporate environments that require both, it's not possible to disable SSL verification while using a proxy.

**Location:** `src/login.ts:1034-1056`

**Current Code:**
```typescript
if (process.env.https_proxy) {
  stsOptions = {
    ...stsOptions,
    requestHandler: new NodeHttpHandler({
      httpsAgent: proxy(process.env.https_proxy),
    }),
  };
}

if (awsNoVerifySsl) {
  // This overwrites the proxy settings
  stsOptions = {
    ...stsOptions,
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        rejectUnauthorized: false,
      }),
    }),
  };
}
```

**Proposed Fix:**
```typescript
if (process.env.https_proxy) {
  const proxyAgent = proxy(process.env.https_proxy);
  if (awsNoVerifySsl) {
    proxyAgent.options.rejectUnauthorized = false;
    console.warn("WARNING: SSL certificate verification is disabled...");
  }
  stsOptions = {
    ...stsOptions,
    requestHandler: new NodeHttpHandler({
      httpsAgent: proxyAgent,
    }),
  };
} else if (awsNoVerifySsl) {
  console.warn("WARNING: SSL certificate verification is disabled...");
  stsOptions = {
    ...stsOptions,
    requestHandler: new NodeHttpHandler({
      httpsAgent: new Agent({
        rejectUnauthorized: false,
      }),
    }),
  };
}
```

---

### Issue #27: Unreachable code in account selection logic

**Labels:** `bug`, `priority: medium`

**Description:**
The `accounts` array is always initialized with 2 elements, so the following conditional branches are never executed:

**Location:** `src/login.ts:160-164`

**Current Code:**
```typescript
const accounts = [
  { message: aadTileMessage, selector: "#aadTileTitle" },
  { message: msaTileMessage, selector: "#msaTileTitle" },
];

let account;
if (accounts.length === 0) {  // Always false
  throw new CLIError("No accounts found on account selection screen.");
} else if (accounts.length === 1) {  // Always false
  account = accounts[0];
} else {
  // Always enters here
}
```

**Proposed Fix:**
Filter based on whether tiles actually exist:
```typescript
const accounts = [
  aadTile ? { message: aadTileMessage, selector: "#aadTileTitle" } : null,
  msaTile ? { message: msaTileMessage, selector: "#msaTileTitle" } : null,
].filter((a): a is { message: string; selector: string } => a !== null);
```

---

### Issue #28: Character encoding issue in SAML decoding

**Labels:** `bug`, `priority: medium`

**Description:**
ASCII encoding is used for SAML response decoding, but SAML responses may contain UTF-8 characters (e.g., usernames with Japanese characters).

**Location:** `src/login.ts:905`

**Current Code:**
```typescript
const samlText = Buffer.from(assertion, "base64").toString("ascii");
```

**Proposed Fix:**
```typescript
const samlText = Buffer.from(assertion, "base64").toString("utf8");
```

---

### Issue #29: Potential NaN from parseInt

**Labels:** `bug`, `priority: medium`

**Description:**
If `defaultDurationHours` is `undefined` or an empty string, `parseInt` returns `NaN`.

**Location:** `src/login.ts:954`

**Current Code:**
```typescript
let durationHours = parseInt(defaultDurationHours, 10);
```

**Proposed Fix:**
```typescript
let durationHours = parseInt(defaultDurationHours, 10) || 1;
```

---

### Issue #30: Process does not exit on non-CLI errors

**Labels:** `bug`, `priority: low`

**Description:**
When a non-CLI error occurs, the process does not exit.

**Location:** `src/index.ts:103-110`

**Current Code:**
```typescript
.catch((err: Error) => {
  if (err.name === "CLIError") {
    console.error(err.message);
    process.exit(2);
  } else {
    console.log(err);  // process.exit() is not called
  }
});
```

**Proposed Fix:**
```typescript
.catch((err: Error) => {
  if (err.name === "CLIError") {
    console.error(err.message);
    process.exit(2);
  } else {
    console.error(err);
    process.exit(1);
  }
});
```

---

### Issue #31: CLI option description is inaccurate

**Labels:** `documentation`, `priority: low`

**Description:**
The `--no-verify-ssl` option description says "no effect if behind proxy", but in reality it overwrites the proxy settings (see Issue #26).

**Location:** `src/index.ts:41-43`

**Current Code:**
```typescript
.option(
  "--no-verify-ssl",
  "Disable SSL Peer Verification for connections to AWS (no effect if behind proxy)"
)
```

**Proposed Fix:**
After fixing Issue #26, update the description to be accurate.

---

## Feature Requests (from upstream PRs)

---

### Issue #32: Add `http_proxy` environment variable support

**Labels:** `enhancement`, `priority: high`

**Description:**
Currently only `https_proxy` is referenced. Add support for `http_proxy` environment variable as well.

**Reference:** [aws-azure-login#313](https://github.com/aws-azure-login/aws-azure-login/pull/313)

**Location:** `src/login.ts:715, 1034`

---

### Issue #33: Update deprecated packages

**Labels:** `dependencies`, `priority: high`

**Description:**
Some packages should be updated to newer versions:

| Package | Current | Recommended |
|---------|---------|-------------|
| uuid | 8.3.2 | 9.0.1+ |
| mkdirp | 1.0.4 | 2.1.6+ |
| cheerio | ^1.0.0-rc.10 | ^1.0.0-rc.12+ |

**Reference:** [aws-azure-login#359](https://github.com/aws-azure-login/aws-azure-login/pull/359), [aws-azure-login#341](https://github.com/aws-azure-login/aws-azure-login/pull/341)

---

### Issue #34: Support TOTP auto-generation from secret

**Labels:** `enhancement`, `priority: medium`

**Description:**
Add support for reading TOTP secret from `AZURE_DEFAULT_TFA_SECRET` environment variable and auto-generating MFA codes.

**Use Case:**
```bash
AZURE_DEFAULT_TFA_SECRET=XXX AZURE_DEFAULT_PASSWORD=XXX az2aws --no-prompt
```

This enables fully automated authentication in CI/CD environments.

**Reference:** [aws-azure-login#201](https://github.com/aws-azure-login/aws-azure-login/pull/201)

---

### Issue #35: Support AWS CLI credential_process

**Labels:** `enhancement`, `priority: medium`

**Description:**
Add `--credential-process` option to output credentials in JSON format for use with AWS CLI's external credential process.

**Use Case:**
```ini
[profile myprofile]
credential_process=az2aws --no-prompt --credential-process
```

**Output Format:**
```json
{
  "Version": 1,
  "AccessKeyId": "...",
  "SecretAccessKey": "...",
  "SessionToken": "...",
  "Expiration": "..."
}
```

**Reference:** [aws-azure-login#279](https://github.com/aws-azure-login/aws-azure-login/pull/279)

---

### Issue #36: Add Puppeteer SSL certificate verification disable flag

**Labels:** `enhancement`, `priority: medium`

**Description:**
Add option to disable SSL verification in Puppeteer for environments where HTTPS proxies use self-signed certificates.

Current `--no-verify-ssl` only affects AWS STS connections, not Puppeteer (browser) SSL verification.

**Proposed Option:** `--no-verify-ssl-browser` or `--ignore-certificate-errors`

**Reference:** [aws-azure-login#172](https://github.com/aws-azure-login/aws-azure-login/pull/172)

---

### Issue #37: Add incognito mode support

**Labels:** `enhancement`, `priority: low`

**Description:**
Add `--incognito` option to launch browser in incognito mode.

**Use Case:**
Some organizations want to avoid automatically using SSO credentials.

**Reference:** [aws-azure-login#284](https://github.com/aws-azure-login/aws-azure-login/pull/284)

---

## Known Issues from Upstream (aws-azure-login)

---

### Issue #38: "Unable to recognize page state!" error

**Labels:** `bug`, `priority: high`

**Description:**
When attempting to log in via CLI mode, an "Unable to recognize page state!" error occurs. GUI mode works fine.

**Cause:**
- Azure login page changes have broken existing selectors
- Additional authentication screens appear due to organizational device compliance requirements

**Impact:**
The `states` array selectors may not be compatible with the latest Azure AD login pages.

**Proposed Solution:**
- Consider implementing a mechanism to regularly update selectors
- Add new page states as needed

**Reference:** [aws-azure-login#327](https://github.com/aws-azure-login/aws-azure-login/issues/327)

---

### Issue #39: Device compliance error

**Labels:** `bug`, `priority: high`

**Description:**
After MFA authentication, a "Device UnSecured Or Non-Compliant" error is displayed.

**Cause:**
The Chromium browser launched by Puppeteer cannot satisfy organizational device compliance policies.

**Impact:**
May not be usable in environments with strict corporate security policies.

**Proposed Solution:**
- Recommend using `--mode=gui`
- Clearly document custom Chromium path configuration options

**Reference:** [aws-azure-login#336](https://github.com/aws-azure-login/aws-azure-login/issues/336)

---

### Issue #40: Slow credential file writing

**Labels:** `bug`, `priority: medium`

**Description:**
On macOS, writing credentials to file can take up to 60 seconds.

**Impact:**
The same issue may occur in az2aws (uses the same `ini` package).

**Investigation Items:**
- Check performance of `awsConfig._saveAsync()`
- Verify no issues with filesystem synchronous writes

**Reference:** [aws-azure-login#358](https://github.com/aws-azure-login/aws-azure-login/issues/358)

---

### Issue #41: Support multiple role ARNs

**Labels:** `enhancement`, `priority: medium`

**Description:**
Allow specifying multiple roles in `azure_default_role_arn` as comma-separated values, selecting the first available role from left to right.

**Use Case:**
- When sharing configuration files within a team
- When available roles differ by team member

**Current Status:**
az2aws only supports a single role ARN.

**Reference:** [aws-azure-login#330](https://github.com/aws-azure-login/aws-azure-login/issues/330)

---

### Issue #42: Support Microsoft Authenticator passkey

**Labels:** `enhancement`, `priority: medium`

**Description:**
Support passkey authentication via Microsoft Authenticator app in GUI mode.

**Current Status:**
Passkey authentication via Bluetooth may not work due to Puppeteer limitations.

**Reference:** [aws-azure-login#354](https://github.com/aws-azure-login/aws-azure-login/issues/354)

---

## Additional Feature Requests (from upstream PRs)

---

### Issue #43: Fix https_proxy configuration bug

**Labels:** `bug`, `priority: high`

**Description:**
In environments where internet access is only possible through a proxy behind a firewall, the `https_proxy` environment variable is not configured correctly.

**Impact:**
Issue occurred between v3.6.1 and v3.6.2.

**Related:**
May be related to Issue #26 (--no-verify-ssl and proxy settings conflict).

**Reference:** [aws-azure-login#349](https://github.com/aws-azure-login/aws-azure-login/pull/349)

---

### Issue #44: Pass 2FA verification code via environment variable

**Labels:** `enhancement`, `priority: medium`

**Description:**
Allow passing 2FA verification code via `AZURE_VERIFICATION_CODE` environment variable.

**Use Case:**
```bash
export AZURE_VERIFICATION_CODE=$(oathtool --totp --base32 $SECRET)
az2aws --no-prompt
```

**Required Changes:**
- Check environment variable in TFA code input handler
- Add `--print` flag (output credentials to stdout, don't write to file)

**Benefits:**
- Enables full automation from scripts
- Easier to use in CI/CD environments

**Reference:** [aws-azure-login#262](https://github.com/aws-azure-login/aws-azure-login/pull/262)

---

### Issue #45: Add Chromium executable path option

**Labels:** `enhancement`, `priority: medium`

**Description:**
Add option to specify custom Chrome/Chromium executable path.

**Background:**
Some organizations prohibit running the default Chromium executable.

**Current Status:**
Custom path can be specified via `CHROME_BIN` environment variable (`paths.chromeBin`).

**Proposed Changes:**
- Verify current implementation works
- Consider adding `--chromium-executable` CLI option

**Reference:** [aws-azure-login#303](https://github.com/aws-azure-login/aws-azure-login/pull/303)

---

### Issue #46: Add environment variables for existing Chrome profile

**Labels:** `enhancement`, `priority: medium`

**Description:**
Add environment variables to use existing Chrome profiles.

**Current Status:**
Can be configured via `paths.userDataDir` and `paths.profileDir`.

**Proposed Changes:**
- Document environment variable names and configuration methods
- Review PR implementation if needed

**Reference:** [aws-azure-login#352](https://github.com/aws-azure-login/aws-azure-login/pull/352)

---

### Issue #47: Support empty profile execution

**Labels:** `enhancement`, `priority: high`

**Description:**
Allow execution when profile is empty or not set, as long as `tenant_id` and `app_id` are set via environment variables.

**Benefits:**
- More flexible configuration options
- Easier configuration in CI/CD environments
- Enables fully environment variable-based configuration with `--no-prompt`

**Required Changes:**
- Modify `_loadProfileAsync` logic
- Add execution path using only environment variables

**Reference:** [aws-azure-login#203](https://github.com/aws-azure-login/aws-azure-login/pull/203)

---

### Issue #48: Support custom assertionConsumerServiceURL

**Labels:** `enhancement`, `priority: high`

**Description:**
Allow customizing the Assertion Consumer Service (ACS) URL in SAML requests.

**Background:**
Some organizations require redirect destinations different from standard AWS SAML endpoints.

**Required Changes:**
- Add `assertion_consumer_service_url` option to profile settings
- Support via environment variable
- Use custom URL in `_createLoginUrlAsync`

**Current Status:**
Only supports `AWS_SAML_ENDPOINT`, `AWS_GOV_SAML_ENDPOINT`, `AWS_CN_SAML_ENDPOINT`.

**Reference:** [aws-azure-login#200](https://github.com/aws-azure-login/aws-azure-login/pull/200)

---

### Issue #49: Add shell script hooks

**Labels:** `enhancement`, `priority: medium`

**Description:**
Add hook functionality to get authentication input from shell scripts.

**Script Types:**
| Script | Default Path | Purpose |
|--------|--------------|---------|
| Username | `~/.aws/.aws-azure-login.username.sh` | Get username |
| Password | `~/.aws/.aws-azure-login.password.sh` | Get password |
| MFA | `~/.aws/.aws-azure-login.static-challenge.sh` | Get MFA code |

**Requirements:**
- Script must exit with code 0
- Result returned via stdout

**Use Cases:**
- Integration with password managers (1Password, Bitwarden, etc.)
- Custom authentication flow implementation
- Secure credential management

**Reference:** [aws-azure-login#145](https://github.com/aws-azure-login/aws-azure-login/pull/145)

---

### Issue #50: Create GitHub Action

**Labels:** `enhancement`, `priority: medium`

**Description:**
Make az2aws available as a GitHub Action.

**Supported Inputs:**
- Tenant ID
- App ID
- Username / Password
- TFA secret
- Role ARN
- Session duration

**Use Case:**
```yaml
- name: Azure Login for AWS
  uses: az2aws/az2aws-action@v1
  with:
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    app-id: ${{ secrets.AZURE_APP_ID }}
    username: ${{ secrets.AZURE_USERNAME }}
    password: ${{ secrets.AZURE_PASSWORD }}
    tfa-secret: ${{ secrets.AZURE_TFA_SECRET }}
```

**Proposed:** Create in a separate repository.

**Reference:** [aws-azure-login#204](https://github.com/aws-azure-login/aws-azure-login/pull/204)

---

### Issue #51: Add troubleshooting warnings for GovCloud

**Labels:** `enhancement`, `priority: low`

**Description:**
Add warnings about default region for GovCloud users.

**Background:**
Users are not aware of the default region in AWS settings, causing issues in GovCloud environments.

**Required Changes:**
- Explicitly display the region being used
- Add warning messages about region configuration

**Reference:** [aws-azure-login#188](https://github.com/aws-azure-login/aws-azure-login/pull/188)

---

### Issue #52: Improve Dockerfile

**Labels:** `enhancement`, `priority: low`

**Description:**
Optimize Docker image:
- Multi-stage builds for smaller image size
- Consolidate apt-get commands
- Use `--no-install-recommends` flag

**Reference:** [aws-azure-login#361](https://github.com/aws-azure-login/aws-azure-login/pull/361)

---

### Issue #53: Update GitHub Actions dependencies

**Labels:** `dependencies`, `priority: low`

**Description:**
Update workflow dependencies via dependabot.

**Reference:** [aws-azure-login#347](https://github.com/aws-azure-login/aws-azure-login/pull/347)

---

### Issue #54: Fix snapcraft.yaml plugin configuration

**Labels:** `bug`, `build`

**Description:**
The snapcraft.yaml is using the deprecated `nodejs` plugin configuration. Snapcraft has transitioned to the `npm` plugin for Node.js projects.

**Location:** `snapcraft.yaml:13-17`

**Current Code (broken):**
```yaml
parts:
  az2aws:
    plugin: nodejs
    nodejs-version: "24"
    nodejs-package-manager: yarn
    source: .
```

**Fixed Code:**
```yaml
parts:
  az2aws:
    plugin: npm
    npm-include-node: true
    npm-node-version: "24"
    source: .
```

**Changes:**
- Changed `plugin` from `nodejs` to `npm`
- Replaced `nodejs-version` with `npm-node-version`
- Replaced `nodejs-package-manager: yarn` with `npm-include-node: true`

**Impact:**
Without this fix, the snap package cannot be built correctly using the current snapcraft toolchain.

---

### Issue #55: Refactor README installation section by method instead of platform

**Labels:** `documentation`, `enhancement`
**Status:** Resolved (implemented in README installation section)

**Description:**
This issue tracked refactoring the README installation section, which was previously organized by platform (Windows, Linux, Docker, Snap) and caused duplication and made it harder to find the preferred installation method. The README has been updated to organize installation by method instead.

**Changes:**
- Reorganized structure from platform-based to method-based
- Added mise as the recommended installation method
- Consolidated Linux and Windows specific notes as subsections under npm
- Simplified overall documentation

**New Structure:**
```
## Installation
### mise (Recommended)
### npm
  - Linux Notes
  - Windows Notes
### Docker
### Snap
```

**Benefits:**
- Cleaner, less redundant documentation
- mise provides the simplest cross-platform installation experience
- Users can quickly find their preferred installation method
- Platform-specific notes are only shown where relevant (npm section)

---

### [RESOLVED] Issue #56: Create issues.md to track project issues

**Labels:** `documentation`

**Description:**
Created an issues documentation file (`issue/issues.md`) to track and document all known bugs, feature requests, and enhancements for the project.

**Tasks:**
- Document all known issues with descriptions and proposed fixes
- Maintain issue numbering consistent with GitHub issues
- Keep the list updated as issues are resolved or new ones are discovered

**Benefits:**
- Centralized documentation of all project issues
- Easier onboarding for new contributors
- Clear tracking of issue status and priorities

---

## Performance Improvements

---

### Issue #57: Optimize keyboard input loop for clearing input fields

**Labels:** `performance`, `priority: high`

**Description:**
The current implementation sends 100 individual keyboard backspace events to clear input fields, causing unnecessary delay.

**Location:** `src/login.ts:97-99`, `src/login.ts:377-379`

**Current Code:**
```typescript
for (let i = 0; i < 100; i++) {
  await page.keyboard.press("Backspace");
}
```

**Problem:**
- Sends 100 individual keyboard events causing unnecessary delay
- Each `press` call is an async operation executed serially

**Proposed Fix:**
Use `page.evaluate()` to clear input via DOM directly, or use `Ctrl+A` to select all then delete:
```typescript
// Option 1: Select all and delete
await page.keyboard.down('Control');
await page.keyboard.press('a');
await page.keyboard.up('Control');
await page.keyboard.press('Backspace');

// Option 2: Clear via DOM
await page.evaluate((selector) => {
  const input = document.querySelector(selector) as HTMLInputElement;
  if (input) input.value = '';
}, inputSelector);
```

**Expected Impact:** 100ms - 500ms reduction per input field

---

### Issue #58: Optimize page state polling loop

**Labels:** `performance`, `priority: high`

**Description:**
The state detection loop checks all 9 states from the beginning on every iteration, which is inefficient.

**Location:** `src/login.ts:814-874`

**Current Code:**
```typescript
while (true) {
  if (samlResponseData) break;

  let foundState = false;
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    let selected;
    try {
      selected = await page.$(state.selector);
    } catch (err) {
      break;
    }

    if (selected) {
      foundState = true;
      // ...
      break;
    }
  }

  if (!foundState) {
    totalUnrecognizedDelay += DELAY_ON_UNRECOGNIZED_PAGE;
    await Bluebird.delay(DELAY_ON_UNRECOGNIZED_PAGE);  // 1 second wait
  }
}
```

**Problem:**
- Checks all 9 states from the beginning on every iteration
- Frequently occurring patterns may be at the end of the array
- Maximum 30 seconds polling with 1-second intervals
- Repeats all DOM operations when no state is found

**Proposed Fix:**
- Place frequently occurring states at the front of the array
- Cache the last matched state and prioritize it in the next check
- Consider combining multiple selectors with `waitForSelector`

**Expected Impact:** Potentially up to 30 seconds reduction in worst case scenarios

---

### Issue #59: Eliminate duplicate profile loading in loginAll

**Labels:** `performance`, `priority: medium`

**Description:**
In `loginAll()`, profile information is loaded from disk for each profile in the loop, causing redundant file I/O and INI parsing.

**Location:** `src/login.ts:527-556`, `src/login.ts:589-610`

**Current Code:**
```typescript
async loginAll(...) {
  const profiles = await awsConfig.getAllProfileNames();  // Load 1

  for (const profile of profiles) {
    if (!forceRefresh && !(await awsConfig.isProfileAboutToExpireAsync(profile))) {
      continue;
    }

    await this.loginAsync(profile, ...);  // Calls _loadProfileAsync internally
  }
}
```

**Problem:**
- Profile information is loaded from disk for each profile in the loop
- INI parsing is repeated multiple times

**Proposed Fix:**
- Cache profile information when `getAllProfileNames()` is called
- Or create a separate method to load all profiles at once

---

### Issue #60: Replace Lodash with native array methods

**Labels:** `performance`, `priority: low`

**Description:**
Lodash is used for small-scale operations where native array methods would be more efficient.

**Location:** `src/login.ts:175`, `src/login.ts:968`, `src/login.ts:979`, `src/login.ts:1005`

**Current Usage:**
```typescript
_.map(accounts, "message")
_.sortBy(_.map(roles, "roleArn"))
_.find(roles, ["roleArn", defaultRoleArn])
```

**Problem:**
- Lodash dependency for small-scale operations (typically <10 items)
- Native array methods are more efficient for these cases

**Proposed Fix:**
```typescript
// Replace _.map(accounts, "message")
accounts.map(a => a.message)

// Replace _.sortBy(_.map(roles, "roleArn"))
roles.map(r => r.roleArn).sort()

// Replace _.find(roles, ["roleArn", defaultRoleArn])
roles.find(r => r.roleArn === defaultRoleArn)
```

Consider removing Lodash from package.json if no longer needed elsewhere.

---

## Additional Bug Reports

---

### Issue #61: Incomplete error handling in page navigation

**Labels:** `bug`, `priority: high`

**Description:**
Page navigation errors are logged but not properly handled, allowing the process to continue in an undefined state.

**Location:** `src/login.ts:803-809`

**Current Code:**
```typescript
try {
  if (headless || (!headless && cliProxy)) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } else {
    await page.waitForNavigation({ waitUntil: "networkidle0" });
  }
} catch (err) {
  if (err instanceof Error) {
    debug(`Error occured during loading the first page: ${err.message}`);
    // Error is swallowed, logic continues
  }
}
```

**Problem:**
- Error is only logged, not thrown or handled
- May continue in an undefined state when redirect fails
- Typo: "occured" should be "occurred"

**Proposed Fix:**
```typescript
try {
  if (headless || (!headless && cliProxy)) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } else {
    await page.waitForNavigation({ waitUntil: "networkidle0" });
  }
} catch (err) {
  if (err instanceof Error) {
    debug(`Error occurred during loading the first page: ${err.message}`);
    throw new CLIError(`Failed to load login page: ${err.message}`);
  }
  throw err;
}
```

---

### Issue #62: Missing NaN validation in duration hours input

**Labels:** `bug`, `priority: medium`

**Description:**
The duration hours input validation does not check for NaN values when converting string input to number.

**Location:** `src/configureProfileAsync.ts:50-56`

**Current Code:**
```typescript
validate: (input): boolean | string => {
  input = Number(input);
  if (input > 0 && input <= 12) return true;
  return "Duration hours must be between 0 and 12";
},
```

**Problem:**
- Only validates after String to Number conversion
- No NaN check - `Number("abc")` returns NaN which fails the condition silently
- Error message says "between 0 and 12" but code checks `> 0` (exclusive)

**Proposed Fix:**
```typescript
validate: (input): boolean | string => {
  const num = Number(input);
  if (Number.isNaN(num)) return "Please enter a valid number";
  if (num > 0 && num <= 12) return true;
  return "Duration hours must be greater than 0 and at most 12";
},
```

---

### Issue #63: Fixed delay for browser initialization is environment-dependent

**Labels:** `bug`, `priority: medium`

**Description:**
A fixed 200ms delay is used to wait for browser initialization, which may be insufficient in slower environments.

**Location:** `src/login.ts:750`

**Current Code:**
```typescript
browser = await puppeteer.launch(launchParams);

// Wait for a bit as sometimes the browser isn't ready.
await Bluebird.delay(200);

const pages = await browser.pages();
```

**Problem:**
- 200ms fixed delay is environment-dependent
- May cause instability in CI environments or slower machines
- May cause unnecessary delay in faster environments

**Proposed Fix:**
Use a more reliable wait mechanism for browser initialization:
```typescript
browser = await puppeteer.launch(launchParams);

// Wait for browser to be ready
const pages = await browser.pages();
if (pages.length === 0) {
  // Wait for default page to be created
  await browser.waitForTarget(target => target.type() === 'page');
}
```

---

### Issue #64: Event listener memory leak risk in SAML response handling

**Labels:** `bug`, `priority: medium`

**Description:**
The request event listener for capturing SAML responses is not explicitly cleaned up after use.

**Location:** `src/login.ts:761-790`

**Current Code:**
```typescript
const samlResponsePromise = new Promise((resolve) => {
  page.on("request", (req: HTTPRequest) => {
    // Event listener may remain registered
    const reqUrl = req.url();
    if (reqUrl === AWS_SAML_ENDPOINT || reqUrl === AWS_GOV_SAML_ENDPOINT || reqUrl === AWS_CN_SAML_ENDPOINT) {
      // ...
      resolve(samlResponse);
    }
  });
});
```

**Problem:**
- Event listener is not explicitly cleaned up
- Potential memory leak if page is reused or not properly closed

**Proposed Fix:**
```typescript
const samlResponsePromise = new Promise((resolve) => {
  const requestHandler = (req: HTTPRequest) => {
    const reqUrl = req.url();
    if (reqUrl === AWS_SAML_ENDPOINT || reqUrl === AWS_GOV_SAML_ENDPOINT || reqUrl === AWS_CN_SAML_ENDPOINT) {
      // ...
      page.off("request", requestHandler);  // Clean up listener
      resolve(samlResponse);
    }
  };
  page.on("request", requestHandler);
});
```

Or use `page.once()` if appropriate for the use case.

---

### Issue #65: Typo in error message

**Labels:** `bug`, `priority: low`

**Description:**
There is a typo in the error debug message.

**Location:** `src/login.ts:806`

**Current:** `"Error occured during loading the first page"`
**Should be:** `"Error occurred during loading the first page"`

**Proposed Fix:**
```typescript
debug(`Error occurred during loading the first page: ${err.message}`);
```

---

## Code Quality Improvements

---

### Issue #66: Reduce `any` type usage and eslint-disable comments

**Labels:** `code-quality`, `priority: medium`

**Description:**
There are several places where `any` type and `eslint-disable` comments are used, reducing type safety.

**Locations:**
- `src/awsConfig.ts:149` - `any` type for parsed INI
- `src/login.ts:141-144` - eslint-disable comment

**Current Code:**
```typescript
// awsConfig.ts:149
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parsedIni: any = ini.parse(data);

// login.ts:141-144
const aadTileMessage: string = await page.evaluate(
  // eslint-disable-next-line
  (a) => a?.textContent ?? "",
  aadTile
);
```

**Proposed Fix:**
- Define proper TypeScript interfaces for INI parsing results
- Use type guards instead of eslint-disable comments
- Consider using a typed INI parser or create proper type definitions

---

### Issue #67: Add missing test coverage for critical functions

**Labels:** `testing`, `priority: medium`

**Description:**
Several critical functions lack test coverage.

**Location:** `src/login.test.ts`

**Missing Tests:**
- `_performLoginAsync()` - the most complex function with browser automation
- `_parseRolesFromSamlResponse()` - SAML parsing logic
- Edge cases: empty SAML response, zero roles, malformed XML, etc.

**Proposed Tests:**
```typescript
describe("login._performLoginAsync", () => {
  // Mock puppeteer browser behavior
  // Test SAML session completion sequence
});

describe("login._parseRolesFromSamlResponse", () => {
  it("should parse valid SAML response with multiple roles", () => {});
  it("should handle empty SAML response", () => {});
  it("should handle special characters in role names", () => {});
  it("should handle UTF-8 encoded content", () => {});
});
```