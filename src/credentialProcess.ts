import { CLIError } from "./CLIError";

function parseCommandTokens(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let tokenStarted = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else if (
        character === "\\" &&
        quote === '"' &&
        (command[index + 1] === '"' || command[index + 1] === "\\")
      ) {
        current += command[index + 1];
        index += 1;
      } else {
        current += character;
      }
      continue;
    }

    if (/\s/.test(character)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (
      character === "\\" &&
      command[index + 1] !== undefined &&
      (/\s/.test(command[index + 1]) ||
        command[index + 1] === "'" ||
        command[index + 1] === '"' ||
        command[index + 1] === "\\")
    ) {
      current += command[index + 1];
      tokenStarted = true;
      index += 1;
      continue;
    }

    current += character;
    tokenStarted = true;
  }

  if (quote) {
    return undefined;
  }
  if (tokenStarted) {
    tokens.push(current);
  }

  return tokens;
}

/** @internal Exported for cross-platform escaping tests. */
export function quoteCommandArgument(
  value: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new CLIError(
      "Profile names containing control characters cannot be used in generated commands.",
    );
  }

  if (platform === "win32") {
    // cmd.exe expands percent variables even inside double quotes, and quote
    // and delayed-expansion semantics make these characters impossible to
    // preserve reliably through every supported Node/npm launcher.
    if (/["%!]/.test(value)) {
      throw new CLIError(
        'Profile names containing ", %, or ! cannot be safely used with credential_process on Windows.',
      );
    }

    if (value.length > 0 && /^[A-Za-z0-9_@+=:,./-]+$/.test(value)) {
      return value;
    }

    // Double trailing backslashes so Windows argv parsing does not consume
    // the closing quote as part of the argument.
    const escapedValue = value.replace(/\\+$/, (slashes) => slashes + slashes);
    return `"${escapedValue}"`;
  }

  if (value.length > 0 && /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }

  // POSIX shells still expand $, command substitutions, and backticks inside
  // double quotes. Escape every character that retains special meaning there;
  // quoting the whole value also neutralizes operators such as &, |, and ;.
  return `"${value.replace(/["\\$`]/g, "\\$&")}"`;
}

export function buildCredentialProcessCommand(profileName: string): string {
  return `az2aws --profile ${quoteCommandArgument(profileName)} --credential-process`;
}

export function buildLoginCommand(profileName: string): string {
  return `az2aws --profile ${quoteCommandArgument(profileName)}`;
}

export function isAz2awsCredentialProcess(
  value: unknown,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const tokens = parseCommandTokens(value);
  if (!tokens || tokens.length === 0) {
    return false;
  }

  const executableParts = tokens[0].split(/[\\/]/);
  const executableName = executableParts[executableParts.length - 1];
  const isBareAz2aws =
    platform === "win32"
      ? executableName.toLowerCase() === "az2aws"
      : executableName === "az2aws";
  return (
    (isBareAz2aws || /^az2aws\.(?:exe|cmd)$/i.test(executableName)) &&
    tokens.includes("--credential-process")
  );
}
