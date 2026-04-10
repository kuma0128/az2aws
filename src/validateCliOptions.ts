import { CLIError } from "./CLIError";

interface CliOptions {
  allProfiles?: boolean;
  configure?: boolean;
  credentialProcess?: boolean;
}

export function validateCliOptions(options: CliOptions): void {
  if (options.allProfiles && options.credentialProcess) {
    throw new CLIError(
      "--credential-process cannot be used with --all-profiles.",
    );
  }

  if (options.configure && options.credentialProcess) {
    throw new CLIError("--credential-process cannot be used with --configure.");
  }
}
