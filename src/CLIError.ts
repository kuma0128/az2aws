export class CLIError extends Error {
  constructor(message: string) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    // Literal on purpose: minifiers rename classes, which would break
    // `err.name === "CLIError"` checks in bundled builds.
    this.name = "CLIError";
    this.message = message;
  }
}
