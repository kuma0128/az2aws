import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { credentialCache as credentialCacheImplementation } from "./credentialCache";
import type { ProfileConfig, ProfileCredentials } from "./awsConfig";
import { paths } from "./paths";

const originalCacheDir = paths.az2awsCache;
const originalConfigPath = paths.config;
const isWindows = process.platform === "win32";
let tempDir: string;

const cacheProfile: ProfileConfig = {
  azure_tenant_id: "tenant",
  azure_app_id_uri: "app",
  azure_default_username: "user",
  azure_default_role_arn: "role",
  azure_default_duration_hours: "1",
  azure_default_remember_me: false,
  region: "us-east-1",
  credential_process: "az2aws --profile default --credential-process",
};

const credentialCache = {
  getValidCachedCredentialsAsync(
    profileName: string,
    profile: ProfileConfig = cacheProfile,
  ) {
    return credentialCacheImplementation.getValidCachedCredentialsAsync(
      profileName,
      profile,
    );
  },
  isCacheFreshAsync(
    profileName: string,
    profile: ProfileConfig = cacheProfile,
  ) {
    return credentialCacheImplementation.isCacheFreshAsync(
      profileName,
      profile,
    );
  },
  setCachedCredentialsAsync(
    profileName: string,
    credentials: ProfileCredentials,
    profile: ProfileConfig = cacheProfile,
  ) {
    return credentialCacheImplementation.setCachedCredentialsAsync(
      profileName,
      credentials,
      profile,
    );
  },
};

function findCacheFileAsync(profileName: string): string {
  const fileId = crypto
    .createHash("sha256")
    .update(path.resolve(paths.config))
    .update("\0")
    .update(profileName)
    .digest("hex");
  return path.join(paths.az2awsCache, `${fileId}.json`);
}

function credentialsExpiringIn(minutes: number): ProfileCredentials {
  return {
    aws_access_key_id: "AKIAIOSFODNN7EXAMPLE",
    aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    aws_session_token: "session-token",
    aws_expiration: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
  };
}

describe("credentialCache", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "az2aws-cache-test-"));
    paths.az2awsCache = path.join(tempDir, "az2aws", "cache");
    paths.config = path.join(tempDir, "aws-config-a");
  });

  afterEach(async () => {
    paths.az2awsCache = originalCacheDir;
    paths.config = originalConfigPath;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should round-trip credentials that are still valid", async () => {
    const credentials = credentialsExpiringIn(60);
    await expect(
      credentialCache.setCachedCredentialsAsync("default", credentials),
    ).resolves.toBe(true);

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toEqual(credentials);
  });

  it("should return undefined when no cache entry exists", async () => {
    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeUndefined();
  });

  it("should treat credentials expiring within the refresh window as a miss", async () => {
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentialsExpiringIn(10),
    );

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeUndefined();
  });

  it("should serve credentials that outlive the refresh window", async () => {
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentialsExpiringIn(12),
    );

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeDefined();
  });

  it("should treat already-expired credentials as a miss", async () => {
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentialsExpiringIn(-5),
    );

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeUndefined();
  });

  it("should treat an unparsable expiration as a miss", async () => {
    await credentialCache.setCachedCredentialsAsync("default", {
      ...credentialsExpiringIn(60),
      aws_expiration: "not-a-date",
    });

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeUndefined();
  });

  it("should treat corrupt JSON as a miss", async () => {
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentialsExpiringIn(60),
    );
    await writeFile(await findCacheFileAsync("default"), "{nope");

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeUndefined();
  });

  it("should treat an unexpected cache shape as a miss", async () => {
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentialsExpiringIn(60),
    );
    await writeFile(
      await findCacheFileAsync("default"),
      JSON.stringify({ version: 2, credentials: {} }),
    );

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toBeUndefined();
  });

  it("should overwrite an existing cache entry", async () => {
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentialsExpiringIn(60),
    );
    const newer = {
      ...credentialsExpiringIn(120),
      aws_session_token: "newer-token",
    };
    await credentialCache.setCachedCredentialsAsync("default", newer);

    const cached =
      await credentialCache.getValidCachedCredentialsAsync("default");
    expect(cached).toEqual(newer);
  });

  it("should keep profiles in separate cache entries", async () => {
    const defaultCredentials = credentialsExpiringIn(60);
    const otherCredentials = {
      ...credentialsExpiringIn(60),
      aws_session_token: "other-token",
    };
    await credentialCache.setCachedCredentialsAsync(
      "default",
      defaultCredentials,
    );
    await credentialCache.setCachedCredentialsAsync("other", otherCredentials);

    expect(
      await credentialCache.getValidCachedCredentialsAsync("default"),
    ).toEqual(defaultCredentials);
    expect(
      await credentialCache.getValidCachedCredentialsAsync("other"),
    ).toEqual(otherCredentials);
  });

  it("should keep case-distinct profile names in separate cache entries", async () => {
    const upperCredentials = credentialsExpiringIn(60);
    const lowerCredentials = {
      ...credentialsExpiringIn(60),
      aws_session_token: "lower-token",
    };
    await credentialCache.setCachedCredentialsAsync("Dev", upperCredentials);
    await credentialCache.setCachedCredentialsAsync("dev", lowerCredentials);

    expect(await credentialCache.getValidCachedCredentialsAsync("Dev")).toEqual(
      upperCredentials,
    );
    expect(await credentialCache.getValidCachedCredentialsAsync("dev")).toEqual(
      lowerCredentials,
    );
    expect(await readdir(paths.az2awsCache)).toHaveLength(2);
  });

  it("should keep identical profile names separate across AWS config files", async () => {
    const configA = path.join(tempDir, "aws-config-a");
    const configB = path.join(tempDir, "aws-config-b");
    const credentialsA = credentialsExpiringIn(60);
    const credentialsB = {
      ...credentialsExpiringIn(60),
      aws_session_token: "account-b-token",
    };

    paths.config = configA;
    await credentialCache.setCachedCredentialsAsync("default", credentialsA);

    paths.config = configB;
    expect(
      await credentialCache.getValidCachedCredentialsAsync("default"),
    ).toBeUndefined();
    await credentialCache.setCachedCredentialsAsync("default", credentialsB);
    expect(
      await credentialCache.getValidCachedCredentialsAsync("default"),
    ).toEqual(credentialsB);

    paths.config = configA;
    expect(
      await credentialCache.getValidCachedCredentialsAsync("default"),
    ).toEqual(credentialsA);
    expect(await readdir(paths.az2awsCache)).toHaveLength(2);
  });

  it("should reject cache metadata that does not match the active configuration", async () => {
    const credentials = credentialsExpiringIn(60);
    await credentialCache.setCachedCredentialsAsync("default", credentials);
    await writeFile(
      await findCacheFileAsync("default"),
      JSON.stringify({
        version: 3,
        configurationId: "another-configuration",
        profileName: "default",
        credentials,
      }),
    );

    expect(
      await credentialCache.getValidCachedCredentialsAsync("default"),
    ).toBeUndefined();
  });

  it("should reject credentials issued for different effective profile settings", async () => {
    const credentials = credentialsExpiringIn(60);
    await credentialCache.setCachedCredentialsAsync("default", credentials);

    const changedProfile = {
      ...cacheProfile,
      azure_default_role_arn: "another-role",
    };
    expect(
      await credentialCache.getValidCachedCredentialsAsync(
        "default",
        changedProfile,
      ),
    ).toBeUndefined();
    expect(
      await credentialCache.getValidCachedCredentialsAsync(
        "default",
        cacheProfile,
      ),
    ).toEqual(credentials);
  });

  it("should not bind cache metadata to the Azure password", async () => {
    const credentials = credentialsExpiringIn(60);
    const originalProfile = {
      ...cacheProfile,
      azure_default_password: "original-password",
    };
    await credentialCache.setCachedCredentialsAsync(
      "default",
      credentials,
      originalProfile,
    );

    const reauthenticatedProfile = {
      ...originalProfile,
      azure_default_password: "changed-password",
    };
    expect(
      await credentialCache.getValidCachedCredentialsAsync(
        "default",
        reauthenticatedProfile,
      ),
    ).toEqual(credentials);
  });

  it("should hash profile names that are not filesystem-safe", async () => {
    const credentials = credentialsExpiringIn(60);
    await credentialCache.setCachedCredentialsAsync(
      "my/team profile",
      credentials,
    );

    const entries = await readdir(paths.az2awsCache);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^[a-f0-9]{64}\.json$/);
    expect(entries[0]).not.toContain("my");
    expect(
      await credentialCache.getValidCachedCredentialsAsync("my/team profile"),
    ).toEqual(credentials);
  });

  it.each(["CON", "長".repeat(300)])(
    "should use a portable fixed-length filename for profile %s",
    async (profileName) => {
      const credentials = credentialsExpiringIn(60);
      await credentialCache.setCachedCredentialsAsync(profileName, credentials);

      expect(path.basename(await findCacheFileAsync(profileName))).toMatch(
        /^[a-f0-9]{64}\.json$/,
      );
      expect(
        await credentialCache.getValidCachedCredentialsAsync(profileName),
      ).toEqual(credentials);
    },
  );

  it.skipIf(isWindows)(
    "should restrict cache file and directory permissions",
    async () => {
      await credentialCache.setCachedCredentialsAsync(
        "default",
        credentialsExpiringIn(60),
      );

      const dirMode = (await stat(paths.az2awsCache)).mode & 0o777;
      const fileMode =
        (await stat(await findCacheFileAsync("default"))).mode & 0o777;
      expect(dirMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
    },
  );

  it("should report write failures without throwing", async () => {
    // Point the cache directory below a regular file so mkdir fails.
    const blockingFile = path.join(tempDir, "blocking");
    await writeFile(blockingFile, "");
    paths.az2awsCache = path.join(blockingFile, "cache");

    await expect(
      credentialCache.setCachedCredentialsAsync(
        "default",
        credentialsExpiringIn(60),
      ),
    ).resolves.toBe(false);
  });

  describe("isCacheFreshAsync", () => {
    it("should return true for a valid entry", async () => {
      await credentialCache.setCachedCredentialsAsync(
        "default",
        credentialsExpiringIn(60),
      );
      expect(await credentialCache.isCacheFreshAsync("default")).toBe(true);
    });

    it("should return false for a missing or expiring entry", async () => {
      expect(await credentialCache.isCacheFreshAsync("default")).toBe(false);

      await credentialCache.setCachedCredentialsAsync(
        "default",
        credentialsExpiringIn(5),
      );
      expect(await credentialCache.isCacheFreshAsync("default")).toBe(false);
    });
  });
});
