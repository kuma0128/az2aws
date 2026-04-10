import { describe, expect, it } from "vitest";
import { validateCliOptions } from "./validateCliOptions";

describe("validateCliOptions", () => {
  it("allows credential-process on its own", () => {
    expect(() => validateCliOptions({ credentialProcess: true })).not.toThrow();
  });

  it("rejects using credential-process with all-profiles", () => {
    expect(() =>
      validateCliOptions({
        allProfiles: true,
        credentialProcess: true,
      }),
    ).toThrow("--credential-process cannot be used with --all-profiles.");
  });

  it("rejects using credential-process with configure", () => {
    expect(() =>
      validateCliOptions({
        configure: true,
        credentialProcess: true,
      }),
    ).toThrow("--credential-process cannot be used with --configure.");
  });
});
