import { describe, it, expect, beforeEach, vi } from "vitest";
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
  },
}));

import inquirer from "inquirer";
import { awsConfig } from "./awsConfig";

describe("configureProfileAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("should configure a new profile when no existing config", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined
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
      }
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
      undefined
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
      "existingprofile"
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
      }
    );
  });

  it("should configure default profile", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined
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
      })
    );
  });

  it("should set rememberMe to true when answer is 'true'", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined
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
      })
    );
  });

  it("should set rememberMe to false when answer is 'false'", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined
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
      })
    );
  });

  it("should log profile name and completion message", async () => {
    vi.mocked(awsConfig.getProfileConfigAsync).mockResolvedValue(undefined);
    vi.mocked(awsConfig.setProfileConfigValuesAsync).mockResolvedValue(
      undefined
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
});
