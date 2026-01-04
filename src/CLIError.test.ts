import { describe, it, expect } from "vitest";
import { CLIError } from "./CLIError";

describe("CLIError", () => {
  it("should create an error with the correct message", () => {
    const error = new CLIError("test error message");
    expect(error.message).toBe("test error message");
  });

  it("should have the correct name", () => {
    const error = new CLIError("test");
    expect(error.name).toBe("CLIError");
  });

  it("should be an instance of Error", () => {
    const error = new CLIError("test");
    expect(error).toBeInstanceOf(Error);
  });

  it("should be an instance of CLIError", () => {
    const error = new CLIError("test");
    expect(error).toBeInstanceOf(CLIError);
  });

  it("should have a stack trace", () => {
    const error = new CLIError("test");
    expect(error.stack).toBeDefined();
  });
});
