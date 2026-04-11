import { describe, expect, it } from "vitest";
import {
  formatCliErrorMessage,
  formatUnexpectedErrorMessage,
  redactUrlForLogs,
  sanitizeMessage,
  shouldAllowSensitiveOutput,
} from "./sensitiveOutput";

describe("sensitiveOutput", () => {
  it("redacts credentials and query parameters from URLs", () => {
    expect(
      redactUrlForLogs(
        "https://user:pass@login.microsoftonline.com/tenant/saml2?SAMLRequest=abc123&foo=bar#hash",
      ),
    ).toBe(
      "https://%5Bredacted%5D:%5Bredacted%5D@login.microsoftonline.com/[redacted]/saml2?SAMLRequest=%5Bredacted%5D&foo=%5Bredacted%5D#[redacted]",
    );
  });

  it("redacts well-known secret fields from free-form messages", () => {
    expect(
      sanitizeMessage(
        'AccessKeyId=AKIAIOSFODNN7EXAMPLE SecretAccessKey="top-secret" SessionToken=session-token',
      ),
    ).toBe("AccessKeyId=[redacted]");
  });

  it("redacts spaced header values like Authorization Bearer tokens", () => {
    expect(sanitizeMessage("Authorization: Bearer abc123xyz")).toBe(
      "Authorization: [redacted]",
    );
  });

  it("redacts full Cookie header value including multiple pairs", () => {
    expect(sanitizeMessage("Cookie: session=abc; token=xyz")).toBe(
      "Cookie: [redacted]",
    );
  });

  it("sanitizes CLI error messages in shared environments", () => {
    expect(
      formatCliErrorMessage(
        "Request failed: https://login.microsoftonline.com/tenant/saml2?SAMLRequest=secret",
        { CI: "true" },
      ),
    ).toBe(
      "Request failed: https://login.microsoftonline.com/[redacted]/saml2?SAMLRequest=%5Bredacted%5D",
    );
  });

  it("sanitizes unexpected error messages in shared environments", () => {
    expect(
      formatUnexpectedErrorMessage(
        new Error(
          "Navigation failed: https://login.microsoftonline.com/tenant/saml2?SAMLRequest=secret",
        ),
        { GITHUB_ACTIONS: "true" },
      ),
    ).toBe(
      "Navigation failed: https://login.microsoftonline.com/[redacted]/saml2?SAMLRequest=%5Bredacted%5D",
    );
  });

  it("returns raw unexpected error message locally", () => {
    expect(
      formatUnexpectedErrorMessage(new Error("SAMLResponse=secret-value"), {}),
    ).toBe("SAMLResponse=secret-value");
  });

  describe("shouldAllowSensitiveOutput", () => {
    it("allows sensitive output when no CI variables are set", () => {
      expect(shouldAllowSensitiveOutput({})).toBe(true);
    });

    it("disallows sensitive output when CI is set to any truthy value", () => {
      expect(shouldAllowSensitiveOutput({ CI: "1" })).toBe(false);
      expect(shouldAllowSensitiveOutput({ CI: "true" })).toBe(false);
      expect(shouldAllowSensitiveOutput({ CI: "yes" })).toBe(false);
    });

    it("disallows sensitive output when GITHUB_ACTIONS is set", () => {
      expect(shouldAllowSensitiveOutput({ GITHUB_ACTIONS: "true" })).toBe(
        false,
      );
    });
  });
});
