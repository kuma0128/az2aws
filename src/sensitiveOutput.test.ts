import { describe, expect, it } from "vitest";
import {
  formatCliErrorMessage,
  formatUnexpectedErrorMessage,
  redactUrlForLogs,
  sanitizeMessage,
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
    ).toBe(
      "AccessKeyId=[redacted] SecretAccessKey=[redacted] SessionToken=[redacted]",
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

  it("replaces unexpected errors with a generic message in shared environments", () => {
    expect(
      formatUnexpectedErrorMessage(new Error("SAMLResponse=secret-value"), {
        GITHUB_ACTIONS: "true",
      }),
    ).toBe(
      "az2aws failed with an unexpected error in a shared environment. Re-run locally with DEBUG=az2aws for full details.",
    );
  });
});
