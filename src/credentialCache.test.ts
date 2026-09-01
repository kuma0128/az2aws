import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { credentialCache } from "./credentialCache";
import type { ProfileCredentials } from "./awsConfig";
import { paths } from "./paths";

const originalCacheDir = paths.az2awsCache;
const originalConfigPath = paths.config;
const isWindows = process.platform === "win32";
let tempDir: string;

async function findCacheFileAsync(profileName: string): Promise<string> {
  const prefix = `${encodeURIComponent(profileName)}.`;
  const entries = await readdir(paths.az2awsCache);
  const entry = entries.find(
    (candidate) => candidate.startsWith(prefix) && candidate.endsWith(".json"),
  );
  if (!entry) {
    throw new Error(`Cache file for '${profileName}' was not found`);
  }
  return path.join(paths.az2awsCache, entry);
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
    await credentialCache.setCachedCredentialsAsync("default", credentials);

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
        version: 2,
        configurationId: "another-configuration",
        profileName: "default",
        credentials,
      }),
    );

    expect(
      await credentialCache.getValidCachedCredentialsAsync("default"),
    ).toBeUndefined();
  });

  it("should encode profile names that are not filesystem-safe", async () => {
    const credentials = credentialsExpiringIn(60);
    await credentialCache.setCachedCredentialsAsync(
      "my/team profile",
      credentials,
    );

    const entries = await readdir(paths.az2awsCache);
    expect(
      entries.some(
        (entry) =>
          entry.startsWith("my%2Fteam%20profile.") && entry.endsWith(".json"),
      ),
    ).toBe(true);
    expect(
      await credentialCache.getValidCachedCredentialsAsync("my/team profile"),
    ).toEqual(credentials);
  });

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

  it("should swallow write failures instead of failing the login", async () => {
    // Point the cache directory below a regular file so mkdir fails.
    const blockingFile = path.join(tempDir, "blocking");
    await writeFile(blockingFile, "");
    paths.az2awsCache = path.join(blockingFile, "cache");

    await expect(
      credentialCache.setCachedCredentialsAsync(
        "default",
        credentialsExpiringIn(60),
      ),
    ).resolves.toBeUndefined();
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
