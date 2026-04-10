import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import { chmod, mkdir } from "node:fs/promises";
import path from "path";
import { awsConfig } from "./awsConfig";
import { paths } from "./paths";

vi.mock("fs");
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  chmod: vi.fn().mockResolvedValue(undefined),
}));

const defaultConfigPath = paths.config;
const defaultCredentialsPath = paths.credentials;

describe("awsConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paths.config = defaultConfigPath;
    paths.credentials = defaultCredentialsPath;
  });

  describe("getProfileConfigAsync", () => {
    it("should return undefined when config file does not exist", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, configContent);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, configContent);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, configContent);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, credentialsContent);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, credentialsContent);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, credentialsContent);
        },
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      expect(result).toBe(false);
    });

    // Boundary tests for refreshLimitInMs = 11 * 60 * 1000 (11 minutes)
    // Using fake timers to ensure deterministic boundary testing
    describe("boundary tests with fixed time", () => {
      const FIXED_TIME = new Date("2024-01-15T12:00:00.000Z").getTime();
      const REFRESH_LIMIT_MS = 11 * 60 * 1000; // 11 minutes

      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_TIME);
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("should return false at exactly 11 minutes boundary", async () => {
        const futureDate = new Date(FIXED_TIME + REFRESH_LIMIT_MS); // exactly 11 minutes
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
            callback: (
              err: NodeJS.ErrnoException | null,
              data?: string,
            ) => void,
          ) => {
            callback(null, credentialsContent);
          },
        );

        const result = await awsConfig.isProfileAboutToExpireAsync("default");
        // At exactly 11 minutes, timeDifference == refreshLimitInMs, so it's NOT less than limit
        expect(result).toBe(false);
      });

      it("should return true just before 11 minutes boundary", async () => {
        const futureDate = new Date(FIXED_TIME + REFRESH_LIMIT_MS - 1); // 11 minutes - 1ms
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
            callback: (
              err: NodeJS.ErrnoException | null,
              data?: string,
            ) => void,
          ) => {
            callback(null, credentialsContent);
          },
        );

        const result = await awsConfig.isProfileAboutToExpireAsync("default");
        expect(result).toBe(true);
      });

      it("should return false just after 11 minutes boundary", async () => {
        const futureDate = new Date(FIXED_TIME + REFRESH_LIMIT_MS + 1); // 11 minutes + 1ms
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
            callback: (
              err: NodeJS.ErrnoException | null,
              data?: string,
            ) => void,
          ) => {
            callback(null, credentialsContent);
          },
        );

        const result = await awsConfig.isProfileAboutToExpireAsync("default");
        expect(result).toBe(false);
      });
    });

    it("should return true when aws_expiration is invalid date string", async () => {
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
aws_expiration = invalid-date-string
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, credentialsContent);
        },
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      // Invalid Date results in NaN - treat as expired for safety
      expect(result).toBe(true);
    });

    it("should return true when aws_expiration is empty string", async () => {
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
aws_expiration =
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, credentialsContent);
        },
      );

      const result = await awsConfig.isProfileAboutToExpireAsync("default");
      // Empty string results in Invalid Date (NaN) - treat as expired for safety
      expect(result).toBe(true);
    });
  });

  describe("getAllProfileNames", () => {
    it("should return empty array when config file does not exist", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, configContent);
        },
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
        "Unknown config type: 'unknown'",
      );
    });

    it("should reject when file read fails with non-ENOENT error", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          const error = new Error("Permission denied") as NodeJS.ErrnoException;
          error.code = "EACCES";
          callback(error);
        },
      );

      await expect(awsConfig._loadAsync("config")).rejects.toThrow(
        "Permission denied",
      );
    });

    it("should return parsed INI data with correct structure for multiple sections", async () => {
      const configContent = `
[default]
azure_tenant_id = default-tenant
region = us-east-1

[profile dev]
azure_tenant_id = dev-tenant
azure_app_id_uri = https://dev.example.com
region = us-west-2

[profile prod]
azure_tenant_id = prod-tenant
azure_app_id_uri = https://prod.example.com
region = eu-west-1
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, configContent);
        },
      );

      const result =
        await awsConfig._loadAsync<Record<string, Record<string, string>>>(
          "config",
        );

      expect(result).toBeDefined();
      expect(result?.default).toEqual({
        azure_tenant_id: "default-tenant",
        region: "us-east-1",
      });
      expect(result?.["profile dev"]).toEqual({
        azure_tenant_id: "dev-tenant",
        azure_app_id_uri: "https://dev.example.com",
        region: "us-west-2",
      });
      expect(result?.["profile prod"]).toEqual({
        azure_tenant_id: "prod-tenant",
        azure_app_id_uri: "https://prod.example.com",
        region: "eu-west-1",
      });
    });

    it("should return empty object for empty file content", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, "");
        },
      );

      const result =
        await awsConfig._loadAsync<Record<string, unknown>>("config");
      expect(result).toEqual({});
    });

    it("should parse INI with special characters in values", async () => {
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
aws_session_token = FwoGZXIvYXdzEBYaDH+token/with+special==chars
`;

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, credentialsContent);
        },
      );

      const result =
        await awsConfig._loadAsync<Record<string, Record<string, string>>>(
          "credentials",
        );

      expect(result?.default.aws_access_key_id).toBe("AKIAIOSFODNN7EXAMPLE");
      expect(result?.default.aws_secret_access_key).toBe(
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      );
      expect(result?.default.aws_session_token).toBe(
        "FwoGZXIvYXdzEBYaDH+token/with+special==chars",
      );
    });

    it("should return undefined for non-existent file (ENOENT)", async () => {
      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          callback(error);
        },
      );

      const result = await awsConfig._loadAsync("config");
      expect(result).toBeUndefined();
    });
  });

  describe("_saveAsync", () => {
    it("should throw error for unknown config type", async () => {
      await expect(
        awsConfig._saveAsync("unknown", { test: {} as never }),
      ).rejects.toThrow("Unknown config type: 'unknown'");
    });

    it("should throw error when data is not provided", async () => {
      await expect(
        awsConfig._saveAsync("config", undefined as never),
      ).rejects.toThrow("You must provide data for saving.");
    });

    it("should save data to file successfully", async () => {
      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          callback(null);
        },
      );

      await expect(
        awsConfig._saveAsync("config", {
          default: {
            azure_tenant_id: "test-tenant",
            azure_app_id_uri: "https://app.example.com",
          } as never,
        }),
      ).resolves.toBeUndefined();

      expect(fs.writeFile).toHaveBeenCalled();
      expect(mkdir).toHaveBeenCalledWith(path.dirname(paths.config), {
        recursive: true,
        mode: 0o700,
      });
      expect(chmod).toHaveBeenNthCalledWith(
        1,
        path.dirname(paths.config),
        0o700,
      );
      expect(chmod).toHaveBeenNthCalledWith(2, paths.config, 0o600);
    });

    it("should create the parent directory for a custom config path", async () => {
      const customConfigPath = path.join("/tmp", "custom-aws", "config");
      paths.config = customConfigPath;

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          callback(null);
        },
      );

      await expect(
        awsConfig._saveAsync("config", {
          default: {
            azure_tenant_id: "test-tenant",
            azure_app_id_uri: "https://app.example.com",
          } as never,
        }),
      ).resolves.toBeUndefined();

      expect(mkdir).toHaveBeenCalledWith(path.dirname(customConfigPath), {
        recursive: true,
        mode: 0o700,
      });
      expect(chmod).toHaveBeenNthCalledWith(
        1,
        path.dirname(customConfigPath),
        0o700,
      );
      expect(chmod).toHaveBeenNthCalledWith(2, customConfigPath, 0o600);
    });

    it("should create the parent directory for a custom credentials path", async () => {
      const customCredentialsPath = path.join(
        "/tmp",
        "custom-aws",
        "credentials",
      );
      paths.credentials = customCredentialsPath;

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          callback(null);
        },
      );

      await expect(
        awsConfig._saveAsync("credentials", {
          default: {
            aws_access_key_id: "AKIAIOSFODNN7EXAMPLE",
            aws_secret_access_key: "secret",
            aws_session_token: "token",
            aws_expiration: "2024-12-31T23:59:59.000Z",
          },
        }),
      ).resolves.toBeUndefined();

      expect(mkdir).toHaveBeenCalledWith(path.dirname(customCredentialsPath), {
        recursive: true,
        mode: 0o700,
      });
      expect(chmod).toHaveBeenNthCalledWith(
        1,
        path.dirname(customCredentialsPath),
        0o700,
      );
      expect(chmod).toHaveBeenNthCalledWith(2, customCredentialsPath, 0o600);
    });

    it("should ignore permission-related chmod errors", async () => {
      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          callback(null);
        },
      );
      vi.mocked(chmod)
        .mockRejectedValueOnce(
          Object.assign(new Error("Operation not permitted"), {
            code: "EPERM",
          }),
        )
        .mockRejectedValueOnce(
          Object.assign(new Error("Invalid argument"), { code: "EINVAL" }),
        );

      await expect(
        awsConfig._saveAsync("config", {
          default: {
            azure_tenant_id: "test-tenant",
            azure_app_id_uri: "https://app.example.com",
          } as never,
        }),
      ).resolves.toBeUndefined();

      expect(fs.writeFile).toHaveBeenCalled();
      expect(chmod).toHaveBeenCalledTimes(2);
    });

    it("should still throw for unexpected chmod errors", async () => {
      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          callback(null);
        },
      );
      vi.mocked(chmod).mockRejectedValueOnce(
        Object.assign(new Error("I/O error"), { code: "EIO" }),
      );

      await expect(
        awsConfig._saveAsync("config", {
          default: {
            azure_tenant_id: "test-tenant",
            azure_app_id_uri: "https://app.example.com",
          } as never,
        }),
      ).rejects.toThrow("I/O error");
    });
  });

  describe("setProfileConfigValuesAsync", () => {
    it("should set config values for default profile with correct section name", async () => {
      let writtenData = "";

      vi.mocked(fs.readFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          _encoding: BufferEncoding | fs.ObjectEncodingOptions,
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, "");
        },
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          writtenData = data.toString();
          callback(null);
        },
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
      expect(writtenData).toContain(
        "azure_app_id_uri=https://new-app.example.com",
      );
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, existingConfig);
        },
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          writtenData = data.toString();
          callback(null);
        },
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, existingConfig);
        },
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          writtenData = data.toString();
          callback(null);
        },
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
      expect(writtenData).toContain(
        "azure_app_id_uri=https://updated-app.example.com",
      );
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, "");
        },
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          writtenData = data.toString();
          callback(null);
        },
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
        "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
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
          callback: (err: NodeJS.ErrnoException | null, data?: string) => void,
        ) => {
          callback(null, existingCredentials);
        },
      );

      vi.mocked(fs.writeFile).mockImplementation(
        (
          _path: fs.PathOrFileDescriptor,
          data: string | NodeJS.ArrayBufferView,
          callback: fs.NoParamCallback,
        ) => {
          writtenData = data.toString();
          callback(null);
        },
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
