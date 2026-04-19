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

This project is written in TypeScript and uses Prettier and ESLint for code formatting. Use Node.js 24.15.0 LTS for local development so your environment matches CI.

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

3. Install Node.js 24.15.0:

```sh
mise use --global node@24.15.0
```

4. Verify Node.js version (should return `v24.15.0`):

```sh
node -v
```

5. Enable pnpm via corepack:

```sh
corepack enable
```

If `corepack` is not available on your machine, install the same userland Corepack version used in CI first:

```sh
npm install --global corepack@0.34.7
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
corepack pnpm install
```

3. Start development mode:

```sh
npm run start
```

Or build and run production mode:

```sh
npm run build && node ./lib/index.js
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `corepack pnpm install` | Install dependencies using the repo-pinned pnpm |
| `npm run check:lockfile` | Fail fast if `pnpm-lock.yaml` was polluted into a multi-document YAML file |
| `npm run start` | Start development mode with hot reload |
| `npm run build` | Build for production |
| `npm run test` | Run unit tests |
| `npm run test:coverage` | Run unit tests with coverage |
| `npm run test:e2e` | Run the live Azure→AWS browser smoke test |
| `npm run lint` | Run ESLint and formatting checks |
| `npm run eslint` | Run ESLint |
| `npm run prettier:check` | Check code formatting |
| `npm run prettier:write` | Auto-fix code formatting |

### E2E Smoke Test

`npm run test:e2e` launches a real Puppeteer/Chrome session, signs in through
Azure AD, and verifies that az2aws can retrieve AWS credentials via
`credential_process` without persisting them to the shared credentials file.

Copy `.env.example` to `.env` and fill in the values. See
[`vitest.e2e.config.ts`](vitest.e2e.config.ts) for the Vitest settings used by
this suite.

To troubleshoot a failing run, rerun with `AZ2AWS_E2E_MODE=debug` (visible
browser, auto-fill) or `AZ2AWS_E2E_MODE=gui` (fully manual).

> **Note:** Passkey-first Microsoft accounts are not supported — use a dedicated
> account with standard username/password/MFA.

CI only runs this test on `push` to `main` and `workflow_dispatch`; PR
validation does not depend on repository secrets.

## Development Workflow

1. Create a new branch from `main`:

```sh
git switch -c feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

2. Make your changes and ensure tests pass:

```sh
npm run check:lockfile
npm run test
```

3. Commit your changes following our [commit message guidelines](#commit-message-guidelines).

4. Push your branch and create a Pull Request.

## Pull Request Process

### Before Submitting

- [ ] Run `npm run check:lockfile` and ensure the lockfile is still clean
- [ ] Run `npm run test` and ensure all checks pass
- [ ] Run `npm run build` to verify the build succeeds
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
