import { CLIError } from "./CLIError";

function parseCommandTokens(
  command: string,
  platform: NodeJS.Platform,
): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let tokenStarted = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (quote) {
      if (platform === "win32" && quote === '"' && character === "\\") {
        let slashCount = 1;
        while (command[index + slashCount] === "\\") {
          slashCount += 1;
        }

        if (command[index + slashCount] === '"') {
          current += "\\".repeat(Math.floor(slashCount / 2));
          if (slashCount % 2 === 0) {
            quote = undefined;
          } else {
            current += '"';
          }
          index += slashCount;
        } else {
          current += "\\".repeat(slashCount);
          index += slashCount - 1;
        }
        continue;
      }

      if (character === quote) {
        quote = undefined;
      } else if (
        character === "\\" &&
        quote === '"' &&
        (command[index + 1] === '"' ||
          command[index + 1] === "\\" ||
          (platform !== "win32" &&
            (command[index + 1] === "$" || command[index + 1] === "`")))
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

    if (character === '"' || (platform !== "win32" && character === "'")) {
      quote = character;
      tokenStarted = true;
      continue;
    }

    if (
      character === "\\" &&
      command[index + 1] !== undefined &&
      platform !== "win32"
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

  // npm ini and several AWS shared-config readers treat these as inline
  // comment markers before handing credential_process to a shell. There is no
  // representation that round-trips consistently across POSIX shells,
  // cmd.exe, and the supported config parsers, so refuse to generate wiring
  // that would target a different profile after the config is reloaded.
  if (/[#;]/.test(value)) {
    throw new CLIError(
      "Profile names containing # or ; cannot be safely used with credential_process.",
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

export function buildCredentialProcessCommand(
  profileName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const executable = platform === "win32" ? "az2aws.cmd" : "az2aws";
  return `${executable} --profile=${quoteCommandArgument(profileName, platform)} --credential-process`;
}

export function buildLoginCommand(profileName: string): string {
  return `az2aws --profile=${quoteCommandArgument(profileName)}`;
}

export function isAz2awsCredentialProcess(
  value: unknown,
  options: {
    platform?: NodeJS.Platform;
    profileName?: string;
  } = {},
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const platform = options.platform ?? process.platform;
  const tokens = parseCommandTokens(value, platform);
  if (!tokens || tokens.length === 0) {
    return false;
  }

  const executableParts = tokens[0].split(/[\\/]/);
  const executableName = executableParts[executableParts.length - 1];
  const isBareAz2aws =
    platform === "win32"
      ? executableName.toLowerCase() === "az2aws"
      : executableName === "az2aws";
  if (!isBareAz2aws && !/^az2aws\.(?:exe|cmd)$/i.test(executableName)) {
    return false;
  }

  let commandProfile: string | undefined;
  let hasCredentialProcessFlag = false;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--credential-process" && !hasCredentialProcessFlag) {
      hasCredentialProcessFlag = true;
      continue;
    }
    if (token === "--profile" && commandProfile === undefined) {
      const profileValue = tokens[index + 1];
      // A leading hyphen is parsed as another option by Commander; only the
      // attached-value form can represent such a profile safely.
      if (!profileValue || profileValue.startsWith("-")) {
        return false;
      }
      commandProfile = profileValue;
      index += 1;
      continue;
    }
    if (token.startsWith("--profile=") && commandProfile === undefined) {
      commandProfile = token.slice("--profile=".length);
      if (!commandProfile) {
        return false;
      }
      continue;
    }
    return false;
  }

  return (
    hasCredentialProcessFlag &&
    commandProfile !== undefined &&
    (options.profileName === undefined ||
      commandProfile === options.profileName)
  );
}
