import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import { awsConfig } from "./awsConfig";

vi.mock("fs");
vi.mock("mkdirp", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

describe("awsConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getProfileConfigAsync", () => {
    it("should return undefined when config file does not exist", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        }
      );

      const result = await awsConfig.getProfileConfigAsync("default");
      expect(result).toBeUndefined();
    });

    it("should return profile config for default profile", async () => {
      const configContent = `
[default]
azure_tenant_id = test-tenant
azure_app_id_uri = https://app.example.com
region = us-east-1
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, configContent);
        }
      );

      const result = await awsConfig.getProfileConfigAsync("default");
      expect(result).toBeDefined();
      expect(result?.azure_tenant_id).toBe("test-tenant");
      expect(result?.azure_app_id_uri).toBe("https://app.example.com");
      expect(result?.region).toBe("us-east-1");
    });

    it("should return profile config for named profile", async () => {
      const configContent = `
[default]
region = us-east-1

[profile myprofile]
azure_tenant_id = my-tenant
azure_app_id_uri = https://my-app.example.com
region = eu-west-1
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, configContent);
        }
      );

      const result = await awsConfig.getProfileConfigAsync("myprofile");
      expect(result).toBeDefined();
      expect(result?.azure_tenant_id).toBe("my-tenant");
      expect(result?.region).toBe("eu-west-1");
    });

    it("should return undefined for non-existent profile", async () => {
      const configContent = `
[default]
region = us-east-1
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, configContent);
        }
      );

      const result = await awsConfig.getProfileConfigAsync("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("isProfileAboutToExpireAsync", () => {
    it("should return true when credentials file does not exist", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        }
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      expect(result).toBe(true);
    });

    it("should return true when profile has no expiration", async () => {
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, credentialsContent);
        }
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      expect(result).toBe(true);
    });

    it("should return true when credentials are about to expire", async () => {
      const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
aws_expiration = ${futureDate.toISOString()}
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, credentialsContent);
        }
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      expect(result).toBe(true);
    });

    it("should return false when credentials are not about to expire", async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
aws_expiration = ${futureDate.toISOString()}
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, credentialsContent);
        }
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      expect(result).toBe(false);
    });
  });

  describe("getAllProfileNames", () => {
    it("should return empty array when config file does not exist", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        }
      );

      const result = await awsConfig.getAllProfileNames();
      expect(result).toEqual([]);
    });

    it("should return all profile names", async () => {
      const configContent = `
[default]
region = us-east-1

[profile dev]
region = us-west-2

[profile prod]
region = eu-west-1
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, configContent);
        }
      );

      const result = await awsConfig.getAllProfileNames();
      expect(result).toContain("default");
      expect(result).toContain("dev");
      expect(result).toContain("prod");
    });
  });

  describe("_loadAsync", () => {
    it("should throw error for unknown config type", async () => {
      await expect(awsConfig._loadAsync("unknown")).rejects.toThrow(
        "Unknown config type: 'unknown'"
      );
    });

    it("should reject when file read fails with non-ENOENT error", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          const error = new Error("Permission denied") as NodeJS.ErrnoException;
          error.code = "EACCES";
          callback(error);
        }
      );

      await expect(awsConfig._loadAsync("config")).rejects.toThrow(
        "Permission denied"
      );
    });
  });

  describe("_saveAsync", () => {
    it("should throw error for unknown config type", async () => {
      await expect(
        awsConfig._saveAsync("unknown", { test: {} as never })
      ).rejects.toThrow("Unknown config type: 'unknown'");
    });

    it("should throw error when data is not provided", async () => {
      await expect(
        awsConfig._saveAsync("config", undefined as never)
      ).rejects.toThrow("You must provide data for saving.");
    });

    it("should save data to file successfully", async () => {
      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback
        ) => {
          callback(null);
        }
      );

      await expect(
        awsConfig._saveAsync("config", {
          default: {
            azure_tenant_id: "test-tenant",
            azure_app_id_uri: "https://app.example.com",
          } as never,
        })
      ).resolves.toBeUndefined();

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe("setProfileConfigValuesAsync", () => {
    it("should set config values for default profile with correct section name", async () => {
      let writtenData = "";

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, "");
        }
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback
        ) => {
          writtenData = data.toString();
          callback(null);
        }
      );

      await awsConfig.setProfileConfigValuesAsync("default", {
        azure_tenant_id: "new-tenant",
        azure_app_id_uri: "https://new-app.example.com",
        azure_default_username: "user@example.com",
        azure_default_role_arn: "arn:aws:iam::123456789:role/Test",
        azure_default_duration_hours: "8",
        azure_default_remember_me: true,
        region: "us-west-2",
      });

      expect(fs.writeFile).toHaveBeenCalled();
      // Default profile should use [default] section (not [profile default])
      expect(writtenData).toContain("[default]");
      expect(writtenData).not.toContain("[profile default]");
      expect(writtenData).toContain("azure_tenant_id=new-tenant");
      expect(writtenData).toContain("azure_app_id_uri=https://new-app.example.com");
      expect(writtenData).toContain("azure_default_remember_me=true");
    });

    it("should set config values for named profile with correct section name", async () => {
      let writtenData = "";
      const existingConfig = `
[default]
region = us-east-1
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, existingConfig);
        }
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback
        ) => {
          writtenData = data.toString();
          callback(null);
        }
      );

      await awsConfig.setProfileConfigValuesAsync("myprofile", {
        azure_tenant_id: "my-tenant",
        azure_app_id_uri: "https://my-app.example.com",
        azure_default_username: "",
        azure_default_role_arn: "",
        azure_default_duration_hours: "1",
        azure_default_remember_me: false,
        region: "eu-west-1",
      });

      expect(fs.writeFile).toHaveBeenCalled();
      // Named profile should use [profile myprofile] section
      expect(writtenData).toContain("[profile myprofile]");
      expect(writtenData).toContain("azure_tenant_id=my-tenant");
      // Should preserve existing default section
      expect(writtenData).toContain("[default]");
    });

    it("should merge with existing profile values", async () => {
      let writtenData = "";
      const existingConfig = `
[profile existing]
azure_tenant_id = old-tenant
azure_app_id_uri = https://old-app.example.com
custom_field = should-be-preserved
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, existingConfig);
        }
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback
        ) => {
          writtenData = data.toString();
          callback(null);
        }
      );

      await awsConfig.setProfileConfigValuesAsync("existing", {
        azure_tenant_id: "updated-tenant",
        azure_app_id_uri: "https://updated-app.example.com",
        azure_default_username: "new-user",
        azure_default_role_arn: "",
        azure_default_duration_hours: "2",
        azure_default_remember_me: true,
        region: "ap-southeast-1",
      });

      expect(fs.writeFile).toHaveBeenCalled();
      // Should update existing values
      expect(writtenData).toContain("azure_tenant_id=updated-tenant");
      expect(writtenData).toContain("azure_app_id_uri=https://updated-app.example.com");
      // Should preserve custom fields
      expect(writtenData).toContain("custom_field=should-be-preserved");
    });
  });

  describe("setProfileCredentialsAsync", () => {
    it("should set credentials for a profile with correct section name", async () => {
      let writtenData = "";
      const expiration = "2024-12-31T23:59:59.000Z";

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, "");
        }
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback
        ) => {
          writtenData = data.toString();
          callback(null);
        }
      );

      await awsConfig.setProfileCredentialsAsync("default", {
        aws_access_key_id: "AKIAIOSFODNN7EXAMPLE",
        aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        aws_session_token: "token123",
        aws_expiration: expiration,
      });

      expect(fs.writeFile).toHaveBeenCalled();
      // Credentials use profile name directly as section (not [profile name])
      expect(writtenData).toContain("[default]");
      expect(writtenData).toContain("aws_access_key_id=AKIAIOSFODNN7EXAMPLE");
      expect(writtenData).toContain(
        "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
      );
      expect(writtenData).toContain("aws_session_token=token123");
      expect(writtenData).toContain(`aws_expiration=${expiration}`);
    });

    it("should merge with existing credentials preserving other profiles", async () => {
      let writtenData = "";
      const existingCredentials = `
[existing]
aws_access_key_id = EXISTINGKEY
aws_secret_access_key = existingsecret
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void
        ) => {
          callback(null, existingCredentials);
        }
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback
        ) => {
          writtenData = data.toString();
          callback(null);
        }
      );

      await awsConfig.setProfileCredentialsAsync("newprofile", {
        aws_access_key_id: "NEWKEY",
        aws_secret_access_key: "newsecret",
        aws_session_token: "newtoken",
        aws_expiration: "2024-06-15T12:00:00.000Z",
      });

      expect(fs.writeFile).toHaveBeenCalled();
      // Should preserve existing profile
      expect(writtenData).toContain("[existing]");
      expect(writtenData).toContain("aws_access_key_id=EXISTINGKEY");
      // Should add new profile
      expect(writtenData).toContain("[newprofile]");
      expect(writtenData).toContain("aws_access_key_id=NEWKEY");
    });
  });
});
