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
    getAllProfileNames: vi.fn(),
    isProfileAboutToExpireAsync: vi.fn(),
  },
}));

const { mockSend, mockHttpsProxyAgent, mockPuppeteerLaunch, mockMkdirp } =
  vi.hoisted(() => {
    const mockSend = vi.fn();
    const mockHttpsProxyAgent = vi.fn();
    const mockPuppeteerLaunch = vi.fn();
    const mockMkdirp = vi.fn();
    return { mockSend, mockHttpsProxyAgent, mockPuppeteerLaunch, mockMkdirp };
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

vi.mock("puppeteer", () => ({
  default: {
    launch: mockPuppeteerLaunch,
  },
}));

vi.mock("mkdirp", () => ({
  default: mockMkdirp,
}));

vi.mock("bluebird", () => ({
  default: {
    delay: vi.fn().mockResolvedValue(undefined),
  },
}));

import inquirer from "inquirer";
import { awsConfig } from "./awsConfig";
import { paths } from "./paths";

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
      const error = await login
        ._askUserForRoleAndDurationAsync([], false, "", "1")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
        "No roles found in SAML response."
      );
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

      const error = await login
        ._askUserForRoleAndDurationAsync(roles, true, "", "1")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
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
      vi.restoreAllMocks();
    });

    it("should throw CLIError when profile does not exist", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);

      const error = await login
        ._loadProfileAsync("nonexistent")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
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

      const error = await login
        ._loadProfileAsync("incomplete")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe(
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

  describe("loginAsync region logging", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(login, "_performLoginAsync").mockResolvedValue("saml");
      vi.spyOn(login, "_parseRolesFromSamlResponse").mockReturnValue([
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
      ]);
      vi.spyOn(login, "_askUserForRoleAndDurationAsync").mockResolvedValue({
        role: {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        durationHours: 1,
      });
      vi.spyOn(login, "_assumeRoleAsync").mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should log region defaults when region is not set", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "",
      });

      await login.loginAsync(
        "default",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );

      expect(console.log).toHaveBeenCalledWith(
        "Using AWS region (from AWS SDK defaults)"
      );
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should warn when GovCloud region is set", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "us-gov-west-1",
      });

      await login.loginAsync(
        "default",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );

      expect(console.log).toHaveBeenCalledWith(
        "Using AWS region us-gov-west-1"
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("GovCloud region detected in profile")
      );
    });

    it("should log standard region without warning", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "us-east-1",
      });

      await login.loginAsync(
        "default",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );

      expect(console.log).toHaveBeenCalledWith("Using AWS region us-east-1");
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("loginAsync mode handling", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(login, "_performLoginAsync").mockResolvedValue("saml");
      vi.spyOn(login, "_parseRolesFromSamlResponse").mockReturnValue([
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
      ]);
      vi.spyOn(login, "_askUserForRoleAndDurationAsync").mockResolvedValue({
        role: {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        durationHours: 1,
      });
      vi.spyOn(login, "_assumeRoleAsync").mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should throw CLIError for invalid mode", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "us-east-1",
      });

      const error = await login
        .loginAsync(
          "default",
          "invalid-mode",
          true,
          true,
          false,
          false,
          false,
          false,
          false
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toBe("Invalid mode");
    });

    it("should use China SAML endpoint for cn- region", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "cn-north-1",
      });

      await login.loginAsync(
        "default",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );

      expect(console.log).toHaveBeenCalledWith(
        "Using AWS SAML endpoint",
        "https://signin.amazonaws.cn/saml"
      );
    });

    it("should use GovCloud SAML endpoint for us-gov- region", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "us-gov-east-1",
      });

      await login.loginAsync(
        "default",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );

      expect(console.log).toHaveBeenCalledWith(
        "Using AWS SAML endpoint",
        "https://signin.amazonaws-us-gov.com/saml"
      );
    });

    it("should use standard SAML endpoint for standard regions", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "app",
        azure_default_username: "user",
        azure_default_role_arn: "role",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "ap-northeast-1",
      });

      await login.loginAsync(
        "default",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );

      expect(console.log).toHaveBeenCalledWith(
        "Using AWS SAML endpoint",
        "https://signin.aws.amazon.com/saml"
      );
    });
  });

  describe("loginAll", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return early when profiles is undefined", async () => {
      vi.mocked(awsConfig.getAllProfileNames).mockResolvedValue(undefined);
      const loginAsyncSpy = vi
        .spyOn(login, "loginAsync")
        .mockResolvedValue(undefined);

      await login.loginAll(
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false
      );

      expect(loginAsyncSpy).not.toHaveBeenCalled();
    });

    it("should iterate over all profiles with forceRefresh=true and skip expiration check", async () => {
      vi.mocked(awsConfig.getAllProfileNames).mockResolvedValue([
        "profile1",
        "profile2",
      ]);
      vi.mocked(awsConfig.isProfileAboutToExpireAsync).mockResolvedValue(false);
      const loginAsyncSpy = vi
        .spyOn(login, "loginAsync")
        .mockResolvedValue(undefined);

      await login.loginAll(
        "cli",
        true,
        true,
        false,
        false,
        false,
        true, // forceRefresh
        false,
        false
      );

      // When forceRefresh is true, isProfileAboutToExpireAsync should not be called
      expect(awsConfig.isProfileAboutToExpireAsync).not.toHaveBeenCalled();
      expect(loginAsyncSpy).toHaveBeenCalledTimes(2);
      expect(loginAsyncSpy).toHaveBeenCalledWith(
        "profile1",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );
      expect(loginAsyncSpy).toHaveBeenCalledWith(
        "profile2",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );
    });

    it("should skip profiles that are not about to expire when forceRefresh=false", async () => {
      vi.mocked(awsConfig.getAllProfileNames).mockResolvedValue([
        "profile1",
        "profile2",
        "profile3",
      ]);
      vi.mocked(awsConfig.isProfileAboutToExpireAsync)
        .mockResolvedValueOnce(true) // profile1 is about to expire
        .mockResolvedValueOnce(false) // profile2 is not
        .mockResolvedValueOnce(true); // profile3 is about to expire
      const loginAsyncSpy = vi
        .spyOn(login, "loginAsync")
        .mockResolvedValue(undefined);

      await login.loginAll(
        "cli",
        true,
        true,
        false,
        false,
        false,
        false, // forceRefresh
        false,
        false
      );

      expect(loginAsyncSpy).toHaveBeenCalledTimes(2);
      expect(loginAsyncSpy).toHaveBeenCalledWith(
        "profile1",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );
      expect(loginAsyncSpy).toHaveBeenCalledWith(
        "profile3",
        "cli",
        true,
        true,
        false,
        false,
        false,
        false,
        false
      );
    });

    it("should not call loginAsync when all profiles are not about to expire", async () => {
      vi.mocked(awsConfig.getAllProfileNames).mockResolvedValue([
        "profile1",
        "profile2",
      ]);
      vi.mocked(awsConfig.isProfileAboutToExpireAsync).mockResolvedValue(false);
      const loginAsyncSpy = vi
        .spyOn(login, "loginAsync")
        .mockResolvedValue(undefined);

      await login.loginAll(
        "cli",
        true,
        true,
        false,
        false,
        false,
        false, // forceRefresh
        false,
        false
      );

      expect(loginAsyncSpy).not.toHaveBeenCalled();
    });
  });

  describe("_askUserForRoleAndDurationAsync error cases", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should throw CLIError when defaultRoleArn is not found in roles", async () => {
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

      const error = await login
        ._askUserForRoleAndDurationAsync(
          roles,
          true,
          "arn:aws:iam::123456789012:role/NonExistentRole",
          "1"
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toContain(
        "was not found in the SAML response"
      );
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
      vi.restoreAllMocks();
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

    it("should not use HttpsProxyAgent when noVerifySsl is true without proxy", async () => {
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

      // When noVerifySsl is true without proxy, it uses https.Agent instead of HttpsProxyAgent
      expect(mockHttpsProxyAgent).not.toHaveBeenCalled();
      expect(awsConfig.setProfileCredentialsAsync).toHaveBeenCalled();
    });

    it("should return early when Credentials is not returned", async () => {
      mockSend.mockResolvedValue({});

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

      expect(awsConfig.setProfileCredentialsAsync).not.toHaveBeenCalled();
    });

    it("should save credentials with correct values", async () => {
      await login._assumeRoleAsync(
        "test-profile",
        "base64-assertion",
        {
          roleArn: "arn:aws:iam::123456789012:role/TestRole",
          principalArn: "arn:aws:iam::123456789012:saml-provider/TestProvider",
        },
        2,
        false,
        "us-east-1"
      );

      expect(awsConfig.setProfileCredentialsAsync).toHaveBeenCalledWith(
        "test-profile",
        {
          aws_access_key_id: "AKIAIOSFODNN7EXAMPLE",
          aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          aws_session_token: "session-token",
          aws_expiration: "2024-01-01T00:00:00.000Z",
        }
      );
    });

    it("should handle credentials with missing optional fields", async () => {
      mockSend.mockResolvedValue({
        Credentials: {
          AccessKeyId: undefined,
          SecretAccessKey: undefined,
          SessionToken: undefined,
          Expiration: undefined,
        },
      });

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

      expect(awsConfig.setProfileCredentialsAsync).toHaveBeenCalledWith(
        "test-profile",
        {
          aws_access_key_id: "",
          aws_secret_access_key: "",
          aws_session_token: "",
          aws_expiration: "",
        }
      );
    });
  });

  describe("_performLoginAsync launch arguments", () => {
    const originalPaths = { ...paths };
    const originalEnv = process.env;

    // Store launch args for verification, then throw to exit early
    let capturedLaunchArgs: unknown = null;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
      delete process.env.https_proxy;
      capturedLaunchArgs = null;
      // Reset paths
      Object.keys(paths).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paths as any)[key] = (originalPaths as any)[key];
      });

      // Mock puppeteer.launch to capture args and throw immediately
      mockPuppeteerLaunch.mockImplementation((args: unknown) => {
        capturedLaunchArgs = args;
        throw new Error("Mock launch error for testing");
      });
    });

    afterEach(() => {
      process.env = originalEnv;
      Object.keys(originalPaths).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paths as any)[key] = (originalPaths as any)[key];
      });
    });

    it("should include --user-data-dir when rememberMe=true and userDataDir is set", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (paths as any).userDataDir = "/custom/user/data/dir";

      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true, // headless
          false, // disableSandbox
          false, // cliProxy
          false, // noPrompt
          false, // enableChromeNetworkService
          "", // defaultUsername
          undefined, // defaultPassword
          false, // enableChromeSeamlessSso
          true, // rememberMe
          false, // noDisableExtensions
          false // disableGpu
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--user-data-dir=/custom/user/data/dir",
          ]),
        })
      );
    });

    it("should call mkdirp and use chromium path when rememberMe=true and userDataDir is not set", async () => {
      mockMkdirp.mockResolvedValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (paths as any).userDataDir = undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (paths as any).chromium = "/default/chromium/path";

      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          true, // rememberMe
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(mockMkdirp).toHaveBeenCalledWith("/default/chromium/path");
      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--user-data-dir=/default/chromium/path",
          ]),
        })
      );
    });

    it("should include --profile-directory when rememberMe=true and profileDir is set", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (paths as any).userDataDir = "/user/data";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (paths as any).profileDir = "CustomProfile";

      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          true, // rememberMe
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--user-data-dir=/user/data",
            "--profile-directory=CustomProfile",
          ]),
        })
      );
    });

    it("should include auth whitelist args when enableChromeSeamlessSso=true", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          true, // enableChromeSeamlessSso
          false,
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--auth-server-whitelist=autologon.microsoftazuread-sso.com",
            "--auth-negotiate-delegate-whitelist=autologon.microsoftazuread-sso.com",
          ]),
        })
      );
    });

    it("should include --disable-gpu when disableGpu=true", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          true // disableGpu
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining(["--disable-gpu"]),
        })
      );
    });

    it("should include --proxy-server when https_proxy env is set", async () => {
      process.env.https_proxy = "http://proxy.example.com:8080";

      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--proxy-server=http://proxy.example.com:8080",
          ]),
        })
      );
    });

    it("should include --no-sandbox when disableSandbox=true", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          true, // disableSandbox
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining(["--no-sandbox"]),
        })
      );
    });

    it("should include --enable-features=NetworkService when enableChromeNetworkService=true", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          true, // enableChromeNetworkService
          "",
          undefined,
          false,
          false,
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining(["--enable-features=NetworkService"]),
        })
      );
    });

    it("should set ignoreDefaultArgs with --disable-extensions when noDisableExtensions=true", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          true, // noDisableExtensions
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          ignoreDefaultArgs: ["--disable-extensions"],
        })
      );
    });

    it("should set ignoreDefaultArgs to empty array when noDisableExtensions=false", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          false, // noDisableExtensions
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          ignoreDefaultArgs: [],
        })
      );
    });

    it("should use executablePath when chromeBin is set", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (paths as any).chromeBin = "/custom/chrome/bin";

      try {
        await login._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          executablePath: "/custom/chrome/bin",
        })
      );
    });

    it("should include --app and --window-size when headless=false", async () => {
      try {
        await login._performLoginAsync(
          "https://login.example.com",
          false, // headless=false
          false,
          false,
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          false
        );
      } catch {
        // Expected to throw
      }

      expect(capturedLaunchArgs).toEqual(
        expect.objectContaining({
          args: expect.arrayContaining([
            "--app=https://login.example.com",
            "--window-size=425,550",
          ]),
        })
      );
    });
  });

  describe("_performLoginAsync SAML error handling", () => {
    const originalPaths = { ...paths };

    const createMockPage = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let requestHandler: ((req: any) => void) | null = null;
      let resolveRequestInterception: (() => void) | null = null;
      const requestInterceptionReady = new Promise<void>((resolve) => {
        resolveRequestInterception = resolve;
      });

      return {
        setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
        setViewport: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockImplementation((event: string, handler: unknown) => {
          if (event === "request") {
            requestHandler = handler as typeof requestHandler;
          }
        }),
        setRequestInterception: vi.fn().mockImplementation(() => {
          // Signal that request interception is set up and handler is ready
          if (resolveRequestInterception) resolveRequestInterception();
          return Promise.resolve();
        }),
        goto: vi.fn().mockResolvedValue(undefined),
        waitForNavigation: vi.fn().mockResolvedValue(undefined),
        $: vi.fn().mockResolvedValue(null),
        screenshot: vi.fn().mockResolvedValue(undefined),
        getRequestHandler: () => requestHandler,
        waitForRequestInterception: () => requestInterceptionReady,
      };
    };

    const createMockBrowser = (
      mockPage: ReturnType<typeof createMockPage>
    ) => ({
      pages: vi.fn().mockResolvedValue([mockPage]),
      close: vi.fn().mockResolvedValue(undefined),
    });

    beforeEach(() => {
      vi.clearAllMocks();
      Object.keys(paths).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paths as any)[key] = (originalPaths as any)[key];
      });
    });

    afterEach(() => {
      Object.keys(originalPaths).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paths as any)[key] = (originalPaths as any)[key];
      });
    });

    it("should throw error when SAMLResponse is not found in postData", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      const promise = login._performLoginAsync(
        "https://login.example.com",
        true,
        false,
        false, // cliProxy=false, so it waits for samlResponsePromise
        false,
        false,
        "",
        undefined,
        false,
        false,
        false,
        false
      );

      // Wait for the request handler to be set up
      await mockPage.waitForRequestInterception();

      // Simulate a request to SAML endpoint with empty SAMLResponse
      const requestHandler = mockPage.getRequestHandler();
      if (requestHandler) {
        requestHandler({
          url: () => "https://signin.aws.amazon.com/saml",
          postData: () => "OtherData=value", // No SAMLResponse
          respond: vi.fn().mockResolvedValue(undefined),
          continue: vi.fn().mockResolvedValue(undefined),
        });
      }

      await expect(promise).rejects.toThrow("SAML response not found");
    });

    it("should throw error when SAMLResponse is an array", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      const promise = login._performLoginAsync(
        "https://login.example.com",
        true,
        false,
        false,
        false,
        false,
        "",
        undefined,
        false,
        false,
        false,
        false
      );

      await mockPage.waitForRequestInterception();

      const requestHandler = mockPage.getRequestHandler();
      if (requestHandler) {
        // SAMLResponse appearing multiple times creates an array
        requestHandler({
          url: () => "https://signin.aws.amazon.com/saml",
          postData: () => "SAMLResponse=value1&SAMLResponse=value2",
          respond: vi.fn().mockResolvedValue(undefined),
          continue: vi.fn().mockResolvedValue(undefined),
        });
      }

      await expect(promise).rejects.toThrow("SAML can't be an array");
    });

    it("should throw error when postData is undefined", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      const promise = login._performLoginAsync(
        "https://login.example.com",
        true,
        false,
        false,
        false,
        false,
        "",
        undefined,
        false,
        false,
        false,
        false
      );

      await mockPage.waitForRequestInterception();

      const requestHandler = mockPage.getRequestHandler();
      if (requestHandler) {
        requestHandler({
          url: () => "https://signin.aws.amazon.com/saml",
          postData: () => undefined,
          respond: vi.fn().mockResolvedValue(undefined),
          continue: vi.fn().mockResolvedValue(undefined),
        });
      }

      await expect(promise).rejects.toThrow("SAML response not found");
    });

    it("should close browser when SAML response is received successfully", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      const promise = login._performLoginAsync(
        "https://login.example.com",
        true,
        false,
        false,
        false,
        false,
        "",
        undefined,
        false,
        false,
        false,
        false
      );

      await mockPage.waitForRequestInterception();

      // Simulate a valid SAML response
      const requestHandler = mockPage.getRequestHandler();
      if (requestHandler) {
        requestHandler({
          url: () => "https://signin.aws.amazon.com/saml",
          postData: () => "SAMLResponse=validBase64EncodedSaml",
          respond: vi.fn().mockResolvedValue(undefined),
          continue: vi.fn().mockResolvedValue(undefined),
        });
      }

      const result = await promise;
      expect(result).toBe("validBase64EncodedSaml");
      // Browser is closed by SAML request handler when response is received
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it("should close browser when puppeteer launch succeeds but SAML response is missing", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      const promise = login._performLoginAsync(
        "https://login.example.com",
        true,
        false,
        false,
        false,
        false,
        "",
        undefined,
        false,
        false,
        false,
        false
      );

      await mockPage.waitForRequestInterception();

      const requestHandler = mockPage.getRequestHandler();
      if (requestHandler) {
        requestHandler({
          url: () => "https://signin.aws.amazon.com/saml",
          postData: () => undefined,
          respond: vi.fn().mockResolvedValue(undefined),
          continue: vi.fn().mockResolvedValue(undefined),
        });
      }

      await expect(promise).rejects.toThrow("SAML response not found");
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe("_performLoginAsync cliProxy state handling", () => {
    const originalPaths = { ...paths };

    const createMockPage = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let requestHandler: ((req: any) => void) | null = null;
      let resolveRequestInterception: (() => void) | null = null;
      const requestInterceptionReady = new Promise<void>((resolve) => {
        resolveRequestInterception = resolve;
      });

      return {
        setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
        setViewport: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockImplementation((event: string, handler: unknown) => {
          if (event === "request") {
            requestHandler = handler as typeof requestHandler;
          }
        }),
        setRequestInterception: vi.fn().mockImplementation(() => {
          if (resolveRequestInterception) resolveRequestInterception();
          return Promise.resolve();
        }),
        goto: vi.fn().mockResolvedValue(undefined),
        waitForNavigation: vi.fn().mockResolvedValue(undefined),
        $: vi.fn().mockResolvedValue(null),
        screenshot: vi.fn().mockResolvedValue(undefined),
        getRequestHandler: () => requestHandler,
        waitForRequestInterception: () => requestInterceptionReady,
      };
    };

    const createMockBrowser = (
      mockPage: ReturnType<typeof createMockPage>
    ) => ({
      pages: vi.fn().mockResolvedValue([mockPage]),
      close: vi.fn().mockResolvedValue(undefined),
    });

    beforeEach(() => {
      vi.clearAllMocks();
      Object.keys(paths).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paths as any)[key] = (originalPaths as any)[key];
      });
    });

    afterEach(() => {
      Object.keys(originalPaths).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (paths as any)[key] = (originalPaths as any)[key];
      });
    });

    it("should throw CLIError with screenshot when unrecognized page persists beyond timeout", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      // page.$ always returns null (no state recognized)
      mockPage.$.mockResolvedValue(null);

      const error = await login
        ._performLoginAsync(
          "https://login.example.com",
          true, // headless
          false,
          true, // cliProxy=true
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          false
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toContain(
        "Unable to recognize page state!"
      );
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: "az2aws-unrecognized-state.png",
      });
    });

    it("should continue loop when page.$ throws an error", async () => {
      const mockPage = createMockPage();
      const mockBrowser = createMockBrowser(mockPage);
      mockPuppeteerLaunch.mockResolvedValue(mockBrowser);

      // First few calls throw error, subsequent calls return null
      let callCount = 0;
      mockPage.$.mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.reject(new Error("Page not ready"));
        }
        return Promise.resolve(null);
      });

      const error = await login
        ._performLoginAsync(
          "https://login.example.com",
          true,
          false,
          true, // cliProxy=true
          false,
          false,
          "",
          undefined,
          false,
          false,
          false,
          false
        )
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CLIError);
      expect((error as CLIError).message).toContain(
        "Unable to recognize page state!"
      );
      // Verify page.$ was called multiple times (loop continued after errors)
      expect(mockPage.$.mock.calls.length).toBeGreaterThan(3);
    });
  });
});
