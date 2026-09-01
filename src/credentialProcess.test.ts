import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  buildCredentialProcessCommand,
  buildLoginCommand,
  isAz2awsCredentialProcess,
  quoteCommandArgument,
} from "./credentialProcess";

describe("credentialProcess", () => {
  it("should quote profile names consistently", () => {
    expect(buildCredentialProcessCommand("my profile")).toBe(
      'az2aws --profile="my profile" --credential-process',
    );
    expect(buildLoginCommand("my profile")).toBe(
      'az2aws --profile="my profile"',
    );
    expect(buildLoginCommand("default")).toBe("az2aws --profile=default");
  });

  it("should attach profile values that begin with a hyphen", () => {
    expect(buildCredentialProcessCommand("-prod")).toBe(
      "az2aws --profile=-prod --credential-process",
    );
    expect(buildLoginCommand("-prod")).toBe("az2aws --profile=-prod");
  });

  it.each([
    ["R&D", '"R&D"'],
    [
      "prod$HOME",
      process.platform === "win32" ? '"prod$HOME"' : '"prod\\$HOME"',
    ],
    [
      "$(echo injected)",
      process.platform === "win32"
        ? '"$(echo injected)"'
        : '"\\$(echo injected)"',
    ],
    [
      "`echo injected`",
      process.platform === "win32"
        ? '"`echo injected`"'
        : '"\\`echo injected\\`"',
    ],
  ])("should quote shell metacharacters in profile %s", (profile, quoted) => {
    const command = buildCredentialProcessCommand(profile);

    expect(command).toBe(`az2aws --profile=${quoted} --credential-process`);
    expect(isAz2awsCredentialProcess(command)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "should pass metacharacters to a POSIX shell without expansion",
    () => {
      const profile =
        'R&D prod$HOME $(printf injected) `printf injected` "quoted" \\slash';
      const command = buildCredentialProcessCommand(profile);
      const prefix = "az2aws --profile=";
      const suffix = " --credential-process";
      const quotedArgument = command.slice(prefix.length, -suffix.length);

      const actual = execFileSync(
        "/bin/sh",
        ["-c", `set -- ${quotedArgument}; printf %s "$1"`],
        {
          encoding: "utf8",
          env: { ...process.env, HOME: "expanded-home" },
        },
      );

      expect(actual).toBe(profile);
    },
  );

  it("should reject control characters", () => {
    expect(() => buildCredentialProcessCommand("prod\nprofile")).toThrow(
      "control characters",
    );
  });

  it("should safely quote Windows shell operators", () => {
    expect(quoteCommandArgument("R&D", "win32")).toBe('"R&D"');
    expect(quoteCommandArgument("$(echo injected)", "win32")).toBe(
      '"$(echo injected)"',
    );
    expect(quoteCommandArgument("trailing\\", "win32")).toBe('"trailing\\\\"');
  });

  it("should reject Windows expansion characters that cannot be quoted reliably", () => {
    expect(() => quoteCommandArgument("prod%HOME%", "win32")).toThrow(
      "cannot be safely used",
    );
    expect(() => quoteCommandArgument("prod!HOME!", "win32")).toThrow(
      "cannot be safely used",
    );
  });

  it("should recognize exact az2aws executable and flag tokens", () => {
    expect(
      isAz2awsCredentialProcess(
        '"/opt/AWS Helpers/az2aws" --profile default --credential-process',
      ),
    ).toBe(true);
    expect(
      isAz2awsCredentialProcess(
        "C:\\tools\\az2aws.exe --profile default --credential-process",
      ),
    ).toBe(true);
    expect(
      isAz2awsCredentialProcess(
        "C:\\tools\\az2aws.cmd --profile default --credential-process",
      ),
    ).toBe(true);
    expect(
      isAz2awsCredentialProcess(
        "AZ2AWS --profile default --credential-process",
        "win32",
      ),
    ).toBe(true);
    expect(
      isAz2awsCredentialProcess(
        "AZ2AWS --profile default --credential-process",
        "linux",
      ),
    ).toBe(false);
  });

  it("should reject similarly named executables and flag substrings", () => {
    expect(
      isAz2awsCredentialProcess(
        "my-az2aws-helper --profile default --credential-process",
      ),
    ).toBe(false);
    expect(
      isAz2awsCredentialProcess(
        "az2aws --profile default --credential-process-helper",
      ),
    ).toBe(false);
    expect(
      isAz2awsCredentialProcess(
        "helper az2aws --profile default --credential-process",
      ),
    ).toBe(false);
  });

  it("should reject malformed quoted commands", () => {
    expect(
      isAz2awsCredentialProcess(
        '"az2aws --profile default --credential-process',
      ),
    ).toBe(false);
  });
});
