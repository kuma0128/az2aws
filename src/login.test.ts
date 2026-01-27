import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { login } from "./login";
import { CLIError } from "./CLIError";

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("./awsConfig", () => ({
  awsConfig: {
    getProfileConfigAsync: vi.fn(),
    setProfileCredentialsAsync: vi.fn(),
  },
}));

const { mockSend, mockHttpsProxyAgent } = vi.hoisted(() => {
  const mockSend = vi.fn();
  const mockHttpsProxyAgent = vi.fn();
  return { mockSend, mockHttpsProxyAgent };
});

vi.mock("@aws-sdk/client-sts", () => {
  return {
    STS: class MockSTS {
      assumeRoleWithSAML = mockSend;
    },
  };
});

vi.mock("https-proxy-agent", () => ({
  HttpsProxyAgent: mockHttpsProxyAgent,
}));

import inquirer from "inquirer";
import { awsConfig } from "./awsConfig";

describe("login", () => {
  describe("_loadProfileFromEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return empty object when no env vars are set", () => {
      delete process.env.azure_tenant_id;
      delete process.env.AZURE_TENANT_ID;
      delete process.env.azure_app_id_uri;
      delete process.env.AZURE_APP_ID_URI;
      delete process.env.azure_default_username;
      delete process.env.AZURE_DEFAULT_USERNAME;
      delete process.env.azure_default_password;
      delete process.env.AZURE_DEFAULT_PASSWORD;
      delete process.env.azure_default_role_arn;
      delete process.env.AZURE_DEFAULT_ROLE_ARN;
      delete process.env.azure_default_duration_hours;
      delete process.env.AZURE_DEFAULT_DURATION_HOURS;

      const result = login._loadProfileFromEnv();
      expect(result).toEqual({});
    });

    it("should read lowercase env vars", () => {
      process.env.azure_tenant_id = "tenant-123";
      process.env.azure_app_id_uri = "app-uri";

      const result = login._loadProfileFromEnv();
      expect(result.azure_tenant_id).toBe("tenant-123");
      expect(result.azure_app_id_uri).toBe("app-uri");
    });

    it("should read uppercase env vars", () => {
      process.env.AZURE_TENANT_ID = "tenant-456";
      process.env.AZURE_APP_ID_URI = "app-uri-upper";

      const result = login._loadProfileFromEnv();
      expect(result.azure_tenant_id).toBe("tenant-456");
      expect(result.azure_app_id_uri).toBe("app-uri-upper");
    });

    it("should prefer lowercase env vars over uppercase", () => {
      process.env.azure_tenant_id = "tenant-lower";
      process.env.AZURE_TENANT_ID = "tenant-upper";

      const result = login._loadProfileFromEnv();
      expect(result.azure_tenant_id).toBe("tenant-lower");
    });

    it("should read all supported env vars", () => {
      process.env.AZURE_TENANT_ID = "tenant-id";
      process.env.AZURE_APP_ID_URI = "app-id-uri";
      process.env.AZURE_DEFAULT_USERNAME = "user@example.com";
      process.env.AZURE_DEFAULT_PASSWORD = "secret";
      process.env.AZURE_DEFAULT_ROLE_ARN = "arn:aws:iam::123456789:role/Test";
      process.env.AZURE_DEFAULT_DURATION_HOURS = "8";

      const result = login._loadProfileFromEnv();
      expect(result.azure_tenant_id).toBe("tenant-id");
      expect(result.azure_app_id_uri).toBe("app-id-uri");
      expect(result.azure_default_username).toBe("user@example.com");
      expect(result.azure_default_password).toBe("secret");
      expect(result.azure_default_role_arn).toBe(
        "arn:aws:iam::123456789:role/Test"
      );
      expect(result.azure_default_duration_hours).toBe("8");
    });
  });

  describe("_parseRolesFromSamlResponse", () => {
    it("should parse a single role from SAML response", () => {
      const samlAssertion = Buffer.from(
        `
        <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
          <Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion">
            <AttributeStatement>
              <Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
                <AttributeValue>arn:aws:iam::123456789012:role/TestRole,arn:aws:iam::123456789012:saml-provider/TestProvider</AttributeValue>
              </Attribute>
            </AttributeStatement>
          </Assertion>
        </samlp:Response>
      `
      ).toString("base64");

      const roles = login._parseRolesFromSamlResponse(samlAssertion);

      expect(roles).toHaveLength(1);
      expect(roles[0].roleArn).toBe("arn:aws:iam::123456789012:role/TestRole");
      expect(roles[0].principalArn).toBe(
        "arn:aws:iam::123456789012:saml-provider/TestProvider"
      );
    });

    it("should parse multiple roles from SAML response", () => {
      const samlAssertion = Buffer.from(
        `
        <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
          <Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion">
            <AttributeStatement>
              <Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
                <AttributeValue>arn:aws:iam::123456789012:role/Role1,arn:aws:iam::123456789012:saml-provider/Provider1</AttributeValue>
                <AttributeValue>arn:aws:iam::123456789012:role/Role2,arn:aws:iam::123456789012:saml-provider/Provider2</AttributeValue>
              </Attribute>
            </AttributeStatement>
          </Assertion>
        </samlp:Response>
      `
      ).toString("base64");

      const roles = login._parseRolesFromSamlResponse(samlAssertion);

      expect(roles).toHaveLength(2);
      expect(roles[0].roleArn).toBe("arn:aws:iam::123456789012:role/Role1");
      expect(roles[1].roleArn).toBe("arn:aws:iam::123456789012:role/Role2");
    });

    it("should handle reversed order (principal first, role second)", () => {
      const samlAssertion = Buffer.from(
        `
        <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
          <Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion">
            <AttributeStatement>
              <Attribute Name="https://aws.amazon.com/SAML/Attributes/Role">
                <AttributeValue>arn:aws:iam::123456789012:saml-provider/TestProvider,arn:aws:iam::123456789012:role/TestRole</AttributeValue>
              </Attribute>
            </AttributeStatement>
          </Assertion>
        </samlp:Response>
      `
      ).toString("base64");

      const roles = login._parseRolesFromSamlResponse(samlAssertion);

      expect(roles).toHaveLength(1);
      expect(roles[0].roleArn).toBe("arn:aws:iam::123456789012:role/TestRole");
      expect(roles[0].principalArn).toBe(
        "arn:aws:iam::123456789012:saml-provider/TestProvider"
      );
    });

    it("should return empty array when no roles found", () => {
      const samlAssertion = Buffer.from(
        `
        <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
          <Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion">
            <AttributeStatement>
              <Attribute Name="https://aws.amazon.com/SAML/Attributes/SessionDuration">
                <AttributeValue>3600</AttributeValue>
              </Attribute>
            </AttributeStatement>
          </Assertion>
        </samlp:Response>
      `
      ).toString("base64");

      const roles = login._parseRolesFromSamlResponse(samlAssertion);

      expect(roles).toHaveLength(0);
    });
  });

  describe("_createLoginUrlAsync", () => {
    it("should create a valid Azure login URL", async () => {
      const appIdUri = "https://app.example.com";
      const tenantId = "test-tenant-id";
      const assertionConsumerServiceURL = "https://signin.aws.amazon.com/saml";

      const url = await login._createLoginUrlAsync(
        appIdUri,
        tenantId,
        assertionConsumerServiceURL
      );

      expect(url).toContain(
        `https://login.microsoftonline.com/${tenantId}/saml2`
      );
      expect(url).toContain("SAMLRequest=");
    });

    it("should include the app ID URI in the SAML request", async () => {
      const appIdUri = "https://my-app.example.com";
      const tenantId = "my-tenant";
      const assertionConsumerServiceURL = "https://signin.aws.amazon.com/saml";

      const url = await login._createLoginUrlAsync(
        appIdUri,
        tenantId,
        assertionConsumerServiceURL
      );

      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url.startsWith("https://login.microsoftonline.com/")).toBe(true);
    });

    it("should work with GovCloud SAML endpoint", async () => {
      const appIdUri = "https://gov-app.example.com";
      const tenantId = "gov-tenant";
      const assertionConsumerServiceURL =
        "https://signin.amazonaws-us-gov.com/saml";

      const url = await login._createLoginUrlAsync(
        appIdUri,
        tenantId,
        assertionConsumerServiceURL
      );

      expect(url).toContain(
        `https://login.microsoftonline.com/${tenantId}/saml2`
      );
    });

    it("should work with China region SAML endpoint", async () => {
      const appIdUri = "https://cn-app.example.com";
      const tenantId = "cn-tenant";
      const assertionConsumerServiceURL = "https://signin.amazonaws.cn/saml";

      const url = await login._createLoginUrlAsync(
        appIdUri,
        tenantId,
        assertionConsumerServiceURL
      );

      expect(url).toContain(
        `https://login.microsoftonline.com/${tenantId}/saml2`
      );
    });
  });

  describe("_askUserForRoleAndDurationAsync", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should throw CLIError when no roles are provided", async () => {
      await expect(
        login._askUserForRoleAndDurationAsync([], false, "", "1")
      ).rejects.toThrow(CLIError);

      await expect(
        login._askUserForRoleAndDurationAsync([], false, "", "1")
      ).rejects.toThrow("No roles found in SAML response.");
    });

    it("should return the only role when single role is provided", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/SingleRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider",
        },
      ];

      vi.mocked(inquirer.prompt).mockResolvedValue({ durationHours: "4" });

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        false,
        "",
        ""
      );

      expect(result.role.roleArn).toBe(
        "arn:aws:iam::123456789012:role/SingleRole"
      );
    });

    it("should use default role and duration when noPrompt is true", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/Role1",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider1",
        },
        {
          roleArn: "arn:aws:iam::123456789012:role/Role2",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider2",
        },
      ];

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        true,
        "arn:aws:iam::123456789012:role/Role2",
        "8"
      );

      expect(result.role.roleArn).toBe("arn:aws:iam::123456789012:role/Role2");
      expect(result.durationHours).toBe(8);
    });

    it("should prompt for role selection when multiple roles and no default", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/Role1",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider1",
        },
        {
          roleArn: "arn:aws:iam::123456789012:role/Role2",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider2",
        },
      ];

      vi.mocked(inquirer.prompt).mockResolvedValue({
        role: "arn:aws:iam::123456789012:role/Role1",
        durationHours: "2",
      });

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        false,
        "",
        ""
      );

      expect(result.role.roleArn).toBe("arn:aws:iam::123456789012:role/Role1");
      expect(result.durationHours).toBe(2);
      expect(inquirer.prompt).toHaveBeenCalled();
    });

    it("should prompt only for duration when single role with no default duration", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/OnlyRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider",
        },
      ];

      vi.mocked(inquirer.prompt).mockResolvedValue({ durationHours: "6" });

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        false,
        "",
        ""
      );

      expect(result.role.roleArn).toBe(
        "arn:aws:iam::123456789012:role/OnlyRole"
      );
      expect(result.durationHours).toBe(6);
    });

    it("should not prompt when noPrompt is true with valid defaults", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/DefaultRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider",
        },
      ];

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        true,
        "arn:aws:iam::123456789012:role/DefaultRole",
        "12"
      );

      expect(result.role.roleArn).toBe(
        "arn:aws:iam::123456789012:role/DefaultRole"
      );
      expect(result.durationHours).toBe(12);
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("should throw when noPrompt is true and multiple roles have no default", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/Role1",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider1",
        },
        {
          roleArn: "arn:aws:iam::123456789012:role/Role2",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider2",
        },
      ];

      await expect(
        login._askUserForRoleAndDurationAsync(roles, true, "", "1")
      ).rejects.toThrow(CLIError);
      await expect(
        login._askUserForRoleAndDurationAsync(roles, true, "", "1")
      ).rejects.toThrow(
        "--no-prompt requires azure_default_role_arn when multiple roles are available."
      );
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("should select the only role even if default role is not present", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/Role1",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider1",
        },
      ];

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        true,
        "arn:aws:iam::123456789012:role/MissingRole",
        "1"
      );

      expect(result.role.roleArn).toBe("arn:aws:iam::123456789012:role/Role1");
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });

    it("should default duration to 1 hour when noPrompt and no default duration", async () => {
      const roles = [
        {
          roleArn: "arn:aws:iam::123456789012:role/OnlyRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/Provider",
        },
      ];

      const result = await login._askUserForRoleAndDurationAsync(
        roles,
        true,
        "",
        ""
      );

      expect(result.durationHours).toBe(1);
      expect(inquirer.prompt).not.toHaveBeenCalled();
    });
  });

  describe("_loadProfileAsync", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should throw CLIError when profile does not exist", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);

      await expect(login._loadProfileAsync("nonexistent")).rejects.toThrow(
        CLIError
      );
      await expect(login._loadProfileAsync("nonexistent")).rejects.toThrow(
        "Unknown profile 'nonexistent'. You must configure it first with --configure."
      );
    });

    it("should throw CLIError when profile is missing required fields", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "",
        azure_app_id_uri: "",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "",
        azure_default_remember_me: false,
        region: "",
      });

      await expect(login._loadProfileAsync("incomplete")).rejects.toThrow(
        CLIError
      );
      await expect(login._loadProfileAsync("incomplete")).rejects.toThrow(
        "Profile 'incomplete' is not configured properly."
      );
    });

    it("should return profile when properly configured", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "test-tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "user@example.com",
        azure_default_role_arn: "arn:aws:iam::123456789:role/Test",
        azure_default_duration_hours: "8",
        azure_default_remember_me: true,
        region: "us-west-2",
      });

      const result = await login._loadProfileAsync("valid");

      expect(result.azure_tenant_id).toBe("test-tenant");
      expect(result.azure_app_id_uri).toBe("https://app.example.com");
    });

    it("should override profile values with environment variables", async () => {
      process.env.AZURE_TENANT_ID = "env-tenant";
      process.env.AZURE_DEFAULT_USERNAME = "env-user@example.com";

      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "config-tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "config-user@example.com",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "",
      });

      const result = await login._loadProfileAsync("envtest");

      expect(result.azure_tenant_id).toBe("env-tenant");
      expect(result.azure_default_username).toBe("env-user@example.com");
    });
  });

  describe("_assumeRoleAsync", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
      delete process.env.https_proxy;
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mockSend.mockResolvedValue({
        Credentials: {
          AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
          SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          SessionToken: "session-token",
          Expiration: new Date("2024-01-01T00:00:00Z"),
        },
      });
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use HttpsProxyAgent with rejectUnauthorized:false when both proxy and noVerifySsl are set", async () => {
      process.env.https_proxy = "http://proxy.example.com:8080";

      await login._assumeRoleAsync(
        "test-profile",
        "base64-assertion",
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        1,
        true, // awsNoVerifySsl
        "us-east-1"
      );

      expect(mockHttpsProxyAgent).toHaveBeenCalledWith(
        "http://proxy.example.com:8080",
        { rejectUnauthorized: false }
      );
    });

    it("should use HttpsProxyAgent without rejectUnauthorized when only proxy is set", async () => {
      process.env.https_proxy = "http://proxy.example.com:8080";

      await login._assumeRoleAsync(
        "test-profile",
        "base64-assertion",
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        1,
        false, // awsNoVerifySsl
        "us-east-1"
      );

      expect(mockHttpsProxyAgent).toHaveBeenCalledWith(
        "http://proxy.example.com:8080",
        {}
      );
    });

    it("should not use HttpsProxyAgent when proxy is not set", async () => {
      await login._assumeRoleAsync(
        "test-profile",
        "base64-assertion",
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        1,
        false,
        "us-east-1"
      );

      expect(mockHttpsProxyAgent).not.toHaveBeenCalled();
    });

    it("should show warning when noVerifySsl is true", async () => {
      await login._assumeRoleAsync(
        "test-profile",
        "base64-assertion",
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        1,
        true, // awsNoVerifySsl
        "us-east-1"
      );

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("SSL certificate verification is disabled")
      );
    });
  });
});
