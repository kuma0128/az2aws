# Contributing to az2aws

Thank you for your interest in contributing to az2aws! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming and inclusive environment for everyone.

## Getting Started

This project is written in TypeScript and uses Prettier and ESLint for code formatting. You need Node.js v22 or higher.

### Prerequisites

1. Install [mise](https://mise.jdx.dev/) (runtime version manager):

```sh
curl https://mise.run | sh
```

2. Activate mise in your shell. Add the following to your shell configuration file:

```sh
echo 'eval "$(~/.local/bin/mise activate zsh)"' >> ~/.zshrc
```

Then restart your shell or run `source ~/.bashrc` (or `~/.zshrc`).

3. Install Node.js v22:

```sh
mise use --global node@22
```

4. Verify Node.js version (should return v22.x.x):

```sh
node -v
```

5. Install yarn:

```sh
npm install -g yarn
```

### Setup

1. Fork and clone the repository:

```sh
git clone git@github.com:<YOUR_GITHUB_USERNAME>/az2aws.git
cd az2aws
```

2. Install dependencies:

```sh
yarn install
```

3. Start development mode:

```sh
yarn start
```

Or build and run production mode:

```sh
yarn build && node ./lib/index.js
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `yarn start` | Start development mode with hot reload |
| `yarn build` | Build for production |
| `yarn test` | Run linting and formatting checks |
| `yarn test:unit` | Run unit tests |
| `yarn eslint` | Run ESLint |
| `yarn prettier:check` | Check code formatting |
| `yarn prettier:write` | Auto-fix code formatting |

## Development Workflow

1. Create a new branch from `main`:

```sh
git switch -c feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

2. Make your changes and ensure tests pass:

```sh
yarn test
```

3. Commit your changes following our [commit message guidelines](#commit-message-guidelines).

4. Push your branch and create a Pull Request.

## Pull Request Process

### Before Submitting

- [ ] Run `yarn test` and ensure all checks pass
- [ ] Run `yarn build` to verify the build succeeds
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
yarn prettier:check

# Auto-fix formatting
yarn prettier:write

# Run linter
yarn eslint
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

Commit messages should be generated using some LLM model.

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
