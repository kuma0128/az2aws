import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { configureProfileAsync } from "./configureProfileAsync";

vi.mock("inquirer", () => ({
  default: {
    prompt: vi.fn(),
  },
}));

vi.mock("./awsConfig", () => ({
  awsConfig: {
    getProfileConfigAsync: vi.fn(),
    setProfileConfigValuesAsync: vi.fn(),
    removeProfileCredentialsAsync: vi.fn(),
  },
}));

import inquirer from "inquirer";
import { awsConfig } from "./awsConfig";
import { buildCredentialProcessCommand } from "./credentialProcess";

describe("configureProfileAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should configure a new profile when no existing config", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined,
    );
    vi.mocked(inquirer.prompt).mockResolvedValue({
      tenantId: "new-tenant-id",
      appIdUri: "https://new-app.example.com",
      username: "user@example.com",
      rememberMe: "false",
      defaultRoleArn: "arn:aws:iam::123456789:role/NewRole",
      defaultDurationHours: "8",
      region: "us-west-2",
    });

    await configureProfileAsync("newprofile");

    expect(awsConfig.getProfileConfigAsync).toHaveBeenCalledWith("newprofile");
    expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
      "newprofile",
      {
        azure_tenant_id: "new-tenant-id",
        azure_app_id_uri: "https://new-app.example.com",
        azure_default_username: "user@example.com",
        azure_default_role_arn: "arn:aws:iam::123456789:role/NewRole",
        azure_default_duration_hours: "8",
        azure_default_remember_me: false,
        region: "us-west-2",
      },
    );
  });

  it("should use existing config values as defaults", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
      azure_tenant_id: "existing-tenant",
      azure_app_id_uri: "https://existing-app.example.com",
      azure_default_username: "existing@example.com",
      azure_default_role_arn: "arn:aws:iam::123456789:role/ExistingRole",
      azure_default_duration_hours: "4",
      azure_default_remember_me: true,
      region: "eu-west-1",
    });
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined,
    );
    vi.mocked(inquirer.prompt).mockResolvedValue({
      tenantId: "updated-tenant",
      appIdUri: "https://updated-app.example.com",
      username: "updated@example.com",
      rememberMe: "true",
      defaultRoleArn: "arn:aws:iam::123456789:role/UpdatedRole",
      defaultDurationHours: "12",
      region: "ap-northeast-1",
    });

    await configureProfileAsync("existingprofile");

    expect(awsConfig.getProfileConfigAsync).toHaveBeenCalledWith(
      "existingprofile",
    );
    expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
      "existingprofile",
      {
        azure_tenant_id: "updated-tenant",
        azure_app_id_uri: "https://updated-app.example.com",
        azure_default_username: "updated@example.com",
        azure_default_role_arn: "arn:aws:iam::123456789:role/UpdatedRole",
        azure_default_duration_hours: "12",
        azure_default_remember_me: true,
        region: "ap-northeast-1",
      },
    );
  });

  it("should configure default profile", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined,
    );
    vi.mocked(inquirer.prompt).mockResolvedValue({
      tenantId: "default-tenant",
      appIdUri: "https://default-app.example.com",
      username: "",
      rememberMe: "false",
      defaultRoleArn: "",
      defaultDurationHours: "1",
      region: "us-east-1",
    });

    await configureProfileAsync("default");

    expect(awsConfig.getProfileConfigAsync).toHaveBeenCalledWith("default");
    expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({
        azure_tenant_id: "default-tenant",
      }),
    );
  });

  it("should set rememberMe to true when answer is 'true'", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined,
    );
    vi.mocked(inquirer.prompt).mockResolvedValue({
      tenantId: "tenant",
      appIdUri: "https://app.example.com",
      username: "user@example.com",
      rememberMe: "true",
      defaultRoleArn: "",
      defaultDurationHours: "1",
      region: "",
    });

    await configureProfileAsync("testprofile");

    expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
      "testprofile",
      expect.objectContaining({
        azure_default_remember_me: true,
      }),
    );
  });

  it("should set rememberMe to false when answer is 'false'", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined,
    );
    vi.mocked(inquirer.prompt).mockResolvedValue({
      tenantId: "tenant",
      appIdUri: "https://app.example.com",
      username: "",
      rememberMe: "false",
      defaultRoleArn: "",
      defaultDurationHours: "1",
      region: "",
    });

    await configureProfileAsync("testprofile");

    expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
      "testprofile",
      expect.objectContaining({
        azure_default_remember_me: false,
      }),
    );
  });

  it("should log profile name and completion message", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined,
    );
    vi.mocked(inquirer.prompt).mockResolvedValue({
      tenantId: "tenant",
      appIdUri: "https://app.example.com",
      username: "",
      rememberMe: "false",
      defaultRoleArn: "",
      defaultDurationHours: "1",
      region: "",
    });

    await configureProfileAsync("myprofile");

    expect(console.log).toHaveBeenCalledWith("Configuring profile 'myprofile'");
    expect(console.log).toHaveBeenCalledWith("Profile saved.");
  });

  describe("validation functions", () => {
    it("should validate tenantId - empty string returns false", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const tenantIdQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "tenantId",
      ) as { validate: (input: string) => boolean };

      expect(tenantIdQuestion.validate("")).toBe(false);
      expect(tenantIdQuestion.validate("valid-tenant")).toBe(true);
      expect(tenantIdQuestion.validate("   ")).toBe(false);
    });

    it("should validate appIdUri - empty string returns false", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const appIdUriQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "appIdUri",
      ) as { validate: (input: string) => boolean };

      expect(appIdUriQuestion.validate("")).toBe(false);
      expect(appIdUriQuestion.validate("https://app.example.com")).toBe(true);
      expect(appIdUriQuestion.validate("   ")).toBe(false);
    });

    it("should validate rememberMe - only accepts true or false", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const rememberMeQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "rememberMe",
      ) as { validate: (input: string) => boolean | string };

      expect(rememberMeQuestion.validate("true")).toBe(true);
      expect(rememberMeQuestion.validate("false")).toBe(true);
      expect(rememberMeQuestion.validate("yes")).toBe(
        "Remember me must be either true or false",
      );
      expect(rememberMeQuestion.validate("invalid")).toBe(
        "Remember me must be either true or false",
      );
      expect(rememberMeQuestion.validate("")).toBe(
        "Remember me must be either true or false",
      );
    });

    it("should validate defaultDurationHours - must be between 1 and 12", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const durationHoursQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "defaultDurationHours",
      ) as { validate: (input: string | number) => boolean | string };

      expect(durationHoursQuestion.validate(1)).toBe(true);
      expect(durationHoursQuestion.validate(12)).toBe(true);
      expect(durationHoursQuestion.validate(6)).toBe(true);
      expect(durationHoursQuestion.validate("8")).toBe(true);
      expect(durationHoursQuestion.validate(0)).toBe(
        "Duration hours must be a whole number between 1 and 12",
      );
      expect(durationHoursQuestion.validate(-1)).toBe(
        "Duration hours must be a whole number between 1 and 12",
      );
      expect(durationHoursQuestion.validate(13)).toBe(
        "Duration hours must be a whole number between 1 and 12",
      );
      expect(durationHoursQuestion.validate("1.5")).toBe(
        "Duration hours must be a whole number between 1 and 12",
      );
      expect(durationHoursQuestion.validate("1e1")).toBe(
        "Duration hours must be a whole number between 1 and 12",
      );
    });

    it("should use existing rememberMe value as default when profile exists", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "existing-tenant",
        azure_app_id_uri: "https://existing-app.example.com",
        azure_default_username: "existing@example.com",
        azure_default_role_arn: "",
        azure_default_duration_hours: "4",
        azure_default_remember_me: true,
        region: "",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "true",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const rememberMeQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "rememberMe",
      ) as { default: string };

      expect(rememberMeQuestion.default).toBe("true");
    });

    it("should default rememberMe to 'true' when no profile exists", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const rememberMeQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "rememberMe",
      ) as { default: string };

      expect(rememberMeQuestion.default).toBe("true");
    });

    it("should use existing false rememberMe value as default when profile exists", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "existing-tenant",
        azure_app_id_uri: "https://existing-app.example.com",
        azure_default_username: "existing@example.com",
        azure_default_role_arn: "",
        azure_default_duration_hours: "4",
        azure_default_remember_me: false,
        region: "",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const rememberMeQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "rememberMe",
      ) as { default: string };

      expect(rememberMeQuestion.default).toBe("false");
    });

    it("should use existing defaultDurationHours value as default when profile exists", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "existing-tenant",
        azure_app_id_uri: "https://existing-app.example.com",
        azure_default_username: "existing@example.com",
        azure_default_role_arn: "",
        azure_default_duration_hours: "8",
        azure_default_remember_me: false,
        region: "",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "8",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const durationHoursQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "defaultDurationHours",
      ) as { default: string | number };

      expect(durationHoursQuestion.default).toBe(8);
    });

    it("should default defaultDurationHours to 1 when no profile exists", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://app.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("test");

      const durationHoursQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "defaultDurationHours",
      ) as { default: string | number };

      expect(durationHoursQuestion.default).toBe(1);
    });

    it("should use azure_app_id as default for appIdUri when azure_app_id_uri is missing (azaws compat)", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "existing-tenant",
        azure_app_id_uri: "",
        azure_app_id: "https://signin.aws.amazon.com/saml#example-prod",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://signin.aws.amazon.com/saml#example-prod",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("azaws-prod");

      const appIdUriQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "appIdUri",
      ) as { default: string };

      expect(appIdUriQuestion.default).toBe(
        "https://signin.aws.amazon.com/saml#example-prod",
      );
    });

    it("should prefer azure_app_id_uri over azure_app_id when both are set", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "existing-tenant",
        azure_app_id_uri: "https://uri.example.com",
        azure_app_id: "https://id.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          tenantId: "tenant",
          appIdUri: "https://uri.example.com",
          username: "",
          rememberMe: "false",
          defaultRoleArn: "",
          defaultDurationHours: "1",
          region: "",
        });
      });

      await configureProfileAsync("mixed");

      const appIdUriQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "appIdUri",
      ) as { default: string };

      expect(appIdUriQuestion.default).toBe("https://uri.example.com");
    });
  });

  describe("credential_process wiring", () => {
    const baseAnswers = {
      tenantId: "tenant",
      appIdUri: "https://app.example.com",
      username: "user@example.com",
      rememberMe: "true",
      defaultRoleArn: "",
      defaultDurationHours: "1",
      region: "us-east-1",
    };

    it("should wire credential_process when the answer is true", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "true",
      });

      await configureProfileAsync("myprofile");

      expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
        "myprofile",
        expect.objectContaining({
          credential_process: buildCredentialProcessCommand("myprofile"),
        }),
      );
      // Static credentials remain available until the initial login has
      // durably populated the credential cache.
      expect(awsConfig.removeProfileCredentialsAsync).not.toHaveBeenCalled();
    });

    it("should quote profile names containing whitespace", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "true",
      });

      await configureProfileAsync("my profile");

      expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
        "my profile",
        expect.objectContaining({
          credential_process: buildCredentialProcessCommand("my profile"),
        }),
      );
    });

    it("should remove an az2aws-managed entry when the answer is false", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: true,
        region: "",
        credential_process: "az2aws --profile myprofile --credential-process",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "false",
      });

      await configureProfileAsync("myprofile");

      const savedValues = vi.mocked(awsConfig.setProfileConfigValuesAsync).mock
        .calls[0][1] as Record<string, unknown>;
      expect("credential_process" in savedValues).toBe(true);
      expect(savedValues.credential_process).toBeUndefined();
    });

    it("should leave a foreign credential_process untouched when the answer is false", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: true,
        region: "",
        credential_process: "aws-vault export --format=json myprofile",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "false",
      });

      await configureProfileAsync("myprofile");

      const savedValues = vi.mocked(awsConfig.setProfileConfigValuesAsync).mock
        .calls[0][1] as Record<string, unknown>;
      expect("credential_process" in savedValues).toBe(false);
    });

    it("should default the wiring question to false when a foreign credential_process exists", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: true,
        region: "",
        credential_process: "aws-vault export --format=json myprofile",
      });
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          ...baseAnswers,
          credentialProcess: "false",
        });
      });

      await configureProfileAsync("myprofile");

      const credentialProcessQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "credentialProcess",
      ) as { default: string; validate: (input: string) => boolean | string };

      expect(credentialProcessQuestion.default).toBe("false");
      expect(credentialProcessQuestion.validate("true")).toBe(
        "Existing credential_process is managed by another tool and cannot be overwritten.",
      );
      expect(credentialProcessQuestion.validate("false")).toBe(true);
      expect(credentialProcessQuestion.validate("yes")).toBe(
        "credential_process must be either true or false",
      );
    });

    it("should reject replacing a foreign credential_process when prompt validation is bypassed", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: true,
        region: "",
        credential_process: "aws-vault export --format=json myprofile",
      });
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "true",
      });

      await expect(configureProfileAsync("myprofile")).rejects.toThrow(
        "Existing credential_process is managed by another tool and cannot be overwritten.",
      );
      expect(awsConfig.setProfileConfigValuesAsync).not.toHaveBeenCalled();
      expect(awsConfig.removeProfileCredentialsAsync).not.toHaveBeenCalled();
    });

    it("should treat similarly named executables as foreign", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
        azure_tenant_id: "tenant",
        azure_app_id_uri: "https://app.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: true,
        region: "",
        credential_process:
          "my-az2aws-helper --profile myprofile --credential-process",
      });

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          ...baseAnswers,
          credentialProcess: "false",
        });
      });

      await configureProfileAsync("myprofile");

      const credentialProcessQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "credentialProcess",
      ) as { default: string };
      expect(credentialProcessQuestion.default).toBe("false");
      const savedValues = vi.mocked(awsConfig.setProfileConfigValuesAsync).mock
        .calls[0][1] as Record<string, unknown>;
      expect("credential_process" in savedValues).toBe(false);
      expect(awsConfig.removeProfileCredentialsAsync).not.toHaveBeenCalled();
    });

    it("should default the wiring question to true for new profiles", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );

      let capturedQuestions: unknown[] = [];
      vi.mocked(inquirer.prompt).mockImplementation((questions) => {
        capturedQuestions = questions as unknown[];
        return Promise.resolve({
          ...baseAnswers,
          credentialProcess: "true",
        });
      });

      await configureProfileAsync("newprofile");

      const credentialProcessQuestion = capturedQuestions.find(
        (q: unknown) => (q as { name: string }).name === "credentialProcess",
      ) as { default: string };

      expect(credentialProcessQuestion.default).toBe("true");
    });

    it("should print follow-up guidance after wiring credential_process", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
        undefined,
      );
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "true",
      });

      await configureProfileAsync("myprofile");

      expect(console.log).toHaveBeenCalledWith(
        "AWS CLI will refresh credentials automatically via credential_process.",
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Run 'az2aws --profile=myprofile' once"),
      );
    });

    it("should name the default profile explicitly in follow-up guidance", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "true",
      });

      await configureProfileAsync("default");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Run 'az2aws --profile=default' once"),
      );
    });

    it("should quote whitespace in the follow-up login command", async () => {
      vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
      vi.mocked(inquirer.prompt).mockResolvedValue({
        ...baseAnswers,
        credentialProcess: "true",
      });

      await configureProfileAsync("my profile");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(`Run 'az2aws --profile="my profile"' once`),
      );
    });

    it.each(["", "   "])(
      "should repair an empty credential_process value %j",
      async (credentialProcess) => {
        vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue({
          azure_tenant_id: "tenant",
          azure_app_id_uri: "https://app.example.com",
          azure_default_username: "",
          azure_default_role_arn: "",
          azure_default_duration_hours: "1",
          azure_default_remember_me: true,
          region: "",
          credential_process: credentialProcess,
        });

        let capturedQuestions: unknown[] = [];
        vi.mocked(inquirer.prompt).mockImplementation((questions) => {
          capturedQuestions = questions as unknown[];
          return Promise.resolve({
            ...baseAnswers,
            credentialProcess: "true",
          });
        });

        await configureProfileAsync("myprofile");

        const credentialProcessQuestion = capturedQuestions.find(
          (question: unknown) =>
            (question as { name: string }).name === "credentialProcess",
        ) as { default: string };
        expect(credentialProcessQuestion.default).toBe("true");
        expect(awsConfig.setProfileConfigValuesAsync).toHaveBeenCalledWith(
          "myprofile",
          expect.objectContaining({
            credential_process: buildCredentialProcessCommand("myprofile"),
          }),
        );
      },
    );
  });
});
