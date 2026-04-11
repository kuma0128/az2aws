# Contributing to az2aws

Thank you for your interest in contributing to az2aws! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Release Process](#release-process)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive environment for everyone.

## Getting Started

This project is written in TypeScript and uses Prettier and ESLint for code formatting. You need Node.js v24 or higher.

### Prerequisites

1. Install [mise](https://mise.jdx.dev/) (runtime version manager):

```sh
curl https://mise.run | sh
```

2. Activate mise in your shell. Add the following to your shell configuration file:

```sh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
```

Then restart your shell or run `source ~/.zshrc` (or the appropriate config file for your shell, such as `~/.bashrc`).

3. Install Node.js v24:

```sh
mise use --global node@24
```

4. Verify Node.js version (should return v24.x.x):

```sh
node -v
```

5. Enable pnpm via corepack:

```sh
corepack enable
```

### Setup

1. Fork and clone the repository:

```sh
git clone git@github.com:<YOUR_GITHUB_USERNAME>/az2aws.git
cd az2aws
```

2. Install dependencies:

```sh
pnpm install
```

3. Start development mode:

```sh
pnpm start
```

Or build and run production mode:

```sh
pnpm build && node ./lib/index.js
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm start` | Start development mode with hot reload |
| `pnpm build` | Build for production |
| `pnpm test` | Run unit tests |
| `pnpm test:coverage` | Run unit tests with coverage |
| `pnpm test:e2e` | Run the live Azure→AWS browser smoke test |
| `pnpm lint` | Run ESLint and formatting checks |
| `pnpm eslint` | Run ESLint |
| `pnpm prettier:check` | Check code formatting |
| `pnpm prettier:write` | Auto-fix code formatting |

### E2E Smoke Test

`pnpm test:e2e` is intentionally separate from `pnpm test`. It launches a real
Puppeteer/Chrome session, signs in through Azure AD, and verifies that az2aws
can retrieve AWS credentials in `credential_process` mode without persisting
them to the shared credentials file.

Required environment variables:

- `AZ2AWS_E2E_AZURE_TENANT_ID`
- `AZ2AWS_E2E_AZURE_APP_ID_URI`
- `AZ2AWS_E2E_AZURE_DEFAULT_USERNAME`
- `AZ2AWS_E2E_AZURE_DEFAULT_PASSWORD`
- `AZ2AWS_E2E_AZURE_DEFAULT_ROLE_ARN`

Optional environment variables:

- `AZ2AWS_E2E_MODE` (defaults to `cli`; use `debug` or `gui` for interactive troubleshooting)
- `AZ2AWS_E2E_PROFILE` (defaults to `e2e`)
- `AZ2AWS_E2E_AWS_REGION` (defaults to `us-east-1`)
- `AZ2AWS_E2E_DURATION_HOURS` (defaults to `1`)

Local `pnpm test:e2e` enables `DEBUG=az2aws` by default when `DEBUG` is not
already set, and the E2E Vitest config disables console interception so browser
flow logs stream directly to the terminal. CI runs force `DEBUG` off by default
to avoid leaking sensitive browser flow details into public GitHub Actions logs.
When troubleshooting a live failure, rerun locally with
`AZ2AWS_E2E_MODE=debug pnpm test:e2e` to keep the browser visible while the CLI
state machine continues driving the flow.

`AZ2AWS_E2E_MODE=debug` keeps the browser visible and still auto-fills the page
through the CLI state machine. `AZ2AWS_E2E_MODE=gui` is fully manual: it opens
the browser and waits for you to complete the login yourself, so defaults such
as the email address are not auto-entered.

Local `pnpm test:e2e` runs still print the final `credential_process` JSON so
you can inspect the temporary credentials directly. CI runs suppress that JSON
when `CI=true` or `GITHUB_ACTIONS=true` to avoid leaking credentials into build
logs. GitHub Actions already provides `GITHUB_ACTIONS=true`, and
`.github/workflows/main.yml` also sets `CI=true` explicitly for the `e2e` job
to make that intent obvious.

`pnpm test:e2e` does not support passkey-first accounts that require the saved
passkey prompt for `login.microsoft.com`. That UI is rendered by the
browser/OS passkey layer rather than the page DOM, so the current
Puppeteer-driven flow cannot dismiss it in `cli` mode. Use a dedicated E2E
account that can continue with the standard username/password/MFA page flow.

If the run times out before it ever reaches `input[name="loginfmt"]`, the E2E
test now treats that account as unsupported and surfaces a passkey-specific
error message instead of only showing the raw selector timeout.

CI only runs this smoke test on `push` to `main` and `workflow_dispatch`, so PR
validation stays fast and does not depend on repository secrets.

## Development Workflow

1. Create a new branch from `main`:

```sh
git switch -c feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

2. Make your changes and ensure tests pass:

```sh
pnpm test
```

3. Commit your changes following our [commit message guidelines](#commit-message-guidelines).

4. Push your branch and create a Pull Request.

## Pull Request Process

### Before Submitting

- [ ] Run `pnpm test` and ensure all checks pass
- [ ] Run `pnpm build` to verify the build succeeds
- [ ] Update documentation if you changed any user-facing behavior
- [ ] Add tests for new functionality

### PR Title Format

Use a descriptive title that summarizes the change:

```
feat: add support for credential_process
fix: resolve proxy configuration conflict
docs: update installation instructions
chore: update dependencies
```

### PR Description

Please include:

1. **Summary**: What does this PR do?
2. **Motivation**: Why is this change needed?
3. **Testing**: How did you test this change?
4. **Related Issues**: Link any related issues (e.g., `Closes #123`)

### Review Process

1. A maintainer will review your PR
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge your PR

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` type when possible; use proper typing
- Use `interface` for object types
- Export types that are used across modules

### Code Style

This project uses ESLint and Prettier. Your code will be automatically checked.

```sh
# Check formatting
pnpm prettier:check

# Auto-fix formatting
pnpm prettier:write

# Run linter
pnpm eslint
```

### File Organization

```
src/
├── index.ts           # CLI entry point
├── login.ts           # Core login logic
├── awsConfig.ts       # AWS configuration handling
├── configureProfileAsync.ts  # Profile configuration
├── paths.ts           # Path utilities
└── CLIError.ts        # Custom error class
```

### Best Practices

- Keep functions small and focused
- Add debug logging for troubleshooting: `debug("message")`
- Handle errors gracefully with meaningful error messages
- Avoid breaking changes to CLI options

## Commit Message Guidelines

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. The commit message format is used by [release-please](https://github.com/googleapis/release-please) to automatically generate changelogs and determine version bumps.

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Commit Types and Their Effects

| Type | CHANGELOG Section | Release Trigger | Version Bump |
|------|-------------------|-----------------|--------------|
| `feat` | Features | Yes | MINOR (1.x.0) |
| `fix` | Bug Fixes | Yes | PATCH (1.0.x) |
| `docs` | Not included | No | - |
| `chore` | Not included | No | - |
| `refactor` | Not included | No | - |
| `test` | Not included | No | - |
| `style` | Not included | No | - |
| `perf` | Performance Improvements | Yes | PATCH (1.0.x) |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```
feat!: remove deprecated --legacy flag

BREAKING CHANGE: The --legacy flag has been removed. Use --mode instead.
```

Breaking changes trigger a MAJOR version bump (x.0.0).

### Examples

```sh
# New feature (triggers MINOR release, appears in CHANGELOG)
feat: add support for credential_process

# Bug fix (triggers PATCH release, appears in CHANGELOG)
fix: resolve proxy configuration conflict

# Documentation only (no release, not in CHANGELOG)
docs: update installation instructions

# If you want documentation changes to appear in CHANGELOG, use feat:
feat(docs): add mise installation guide

# Maintenance (no release, not in CHANGELOG)
chore: update dependencies
```

### Important Notes

- **PR titles matter**: When a PR is squash-merged, the PR title becomes the commit message. Ensure your PR title follows this format.
- **Use `feat(docs):`** if you want documentation changes to appear in the changelog and trigger a release.
- Commit messages can be generated using an LLM model, but ensure they follow the Conventional Commits format.

## Release Process

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases.

### How It Works

1. When PRs are merged to `main`, release-please analyzes commit messages
2. If releasable commits exist (`feat`, `fix`, `perf`, or breaking changes), release-please creates/updates a Release PR
3. The Release PR contains:
   - Version bump in `package.json`
   - Updated `CHANGELOG.md` with all changes since the last release
4. When the Release PR is merged, a new GitHub release is created with the appropriate tag

### What Triggers a Release

| Commit Type | Triggers Release? | Example |
|-------------|-------------------|---------|
| `feat:` | Yes (MINOR) | `feat: add SSO support` |
| `fix:` | Yes (PATCH) | `fix: handle timeout error` |
| `perf:` | Yes (PATCH) | `perf: optimize credential caching` |
| `feat!:` / `BREAKING CHANGE` | Yes (MAJOR) | `feat!: change config format` |
| `docs:` | No | `docs: update README` |
| `chore:` | No | `chore: update deps` |

### Tips for Contributors

- If your change should appear in the release notes, use `feat:` or `fix:`
- For documentation improvements that benefit users, consider using `feat(docs):` to include them in the release
- Multiple commits of the same type are grouped together in the CHANGELOG

## Reporting Issues

### Bug Reports

When reporting a bug, please include:

1. **Environment**:
   - OS and version
   - Node.js version (`node -v`)
   - az2aws version (`az2aws --version`)

2. **Steps to Reproduce**: Clear steps to reproduce the issue

3. **Expected Behavior**: What you expected to happen

4. **Actual Behavior**: What actually happened

5. **Debug Output**: Run with debug enabled and include the output:
   ```sh
   DEBUG=az2aws az2aws [your options]
   ```

   **Security note**: Debug logs may contain sensitive information (for example, SAML assertions such as SAMLResponse, SAML XML, role details, or other credentials/tokens). Do not share unredacted debug output in public issues or forums. If you attach logs to a bug report, carefully review and redact any secrets or identifiers before posting.

### Feature Requests

When requesting a feature, please include:

1. **Use Case**: Why do you need this feature?
2. **Proposed Solution**: How do you think it should work?
3. **Alternatives Considered**: Other approaches you've thought about

### Good First Issues

Look for issues labeled `good first issue` if you're new to the project. These are typically smaller, well-defined tasks that are good for getting started.

## Questions?

If you have questions, feel free to:

- Open a [GitHub Discussion](https://github.com/kuma0128/az2aws/discussions)
- Open an issue with the `question` label

Thank you for contributing!
