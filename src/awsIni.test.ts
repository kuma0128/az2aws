import { describe, expect, it } from "vitest";
import { updateAwsIni } from "./awsIni";

describe("AWS INI edits", () => {
  it("preserves nested settings and comments byte-for-byte, including in the edited profile", () => {
    const source =
      "# keep this\r\n[profile target]\r\nregion = us-east-1\r\ns3 =\r\n  addressing_style = path\r\n  max_concurrent_requests = 20\r\n; keep this too\r\n[services local]\r\ns3 =\r\n  endpoint_url = http://localhost:9000\r\n";
    expect(
      updateAwsIni(source, "profile target", { region: "us-west-2" }),
    ).toBe(source.replace("region = us-east-1", "region=us-west-2"));
  });

  it("preserves literal credentials, equals signs and existing foreign commands", () => {
    const source = '[profile other]\ncredential_process = tool "a;b#c"\n';
    expect(
      updateAwsIni(source, "target", { aws_session_token: "dummySession==" }),
    ).toBe(source + "[target]\naws_session_token=dummySession==\n");
  });

  it("keeps indented top-level settings at the same level when replacing and adding keys", () => {
    const source =
      "[profile target]\n  region = us-east-1\n  s3 =\n    addressing_style = path\n";
    expect(
      updateAwsIni(source, "profile target", {
        region: "us-west-2",
        azure_tenant_id: "dummy",
      }),
    ).toBe(
      "[profile target]\n  region=us-west-2\n  s3 =\n    addressing_style = path\n  azure_tenant_id=dummy\n",
    );
  });

  it("removes a setting's continuation without leaving orphaned nested keys", () => {
    const source =
      "[profile target]\ns3 =\n  addressing_style = path\n# comment\nregion = us-east-1\n";
    expect(updateAwsIni(source, "profile target", { s3: undefined })).toBe(
      "[profile target]\n# comment\nregion = us-east-1\n",
    );
  });

  it("keeps unrelated sections exactly intact when removing credentials", () => {
    const other = "[other]\naws_access_key_id = EXISTING\n# comment\n";
    expect(
      updateAwsIni(
        "[target]\naws_access_key_id=OLD\n" + other,
        "target",
        undefined,
      ),
    ).toBe(other);
  });

  it("rejects duplicate sections and newline injection before saving", () => {
    expect(() =>
      updateAwsIni("[target]\na=b\n[target]\nc=d\n", "target", { a: "e" }),
    ).toThrow("duplicate");
    expect(() =>
      updateAwsIni("", "target", { region: "us-east-1\n[other]" }),
    ).toThrow("single-line");
  });

  it("handles empty sections and files without a trailing newline", () => {
    expect(updateAwsIni("[target]", "target", { region: "us-east-1" })).toBe(
      "[target]\nregion=us-east-1\n",
    );
    expect(
      updateAwsIni("[other]\nregion=us-west-2", "target", {
        region: "us-east-1",
      }),
    ).toBe("[other]\nregion=us-west-2\n[target]\nregion=us-east-1\n");
  });
});
