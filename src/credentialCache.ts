import crypto from "node:crypto";
import fs from "fs/promises";
import path from "path";
import _debug from "debug";
import { paths } from "./paths";
import {
  ProfileConfig,
  ProfileCredentials,
  refreshLimitInMs,
} from "./awsConfig";

const debug = _debug("az2aws");

const cacheDirMode = 0o700;
const cacheFileMode = 0o600;

interface CacheFileContents {
  version: number;
  configurationId: string;
  profileName: string;
  credentials: ProfileCredentials;
}

function activeConfigPathId(): string {
  return crypto
    .createHash("sha256")
    .update(path.resolve(paths.config))
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonicalize((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function profileConfigurationId(
  profileName: string,
  profile: ProfileConfig,
): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        configPath: path.resolve(paths.config),
        profileName,
        profile: canonicalize(profile),
      }),
    )
    .digest("hex");
}

function cacheFilePath(profileName: string): string {
  const configPathId = activeConfigPathId();
  return path.join(
    paths.az2awsCache,
    `${encodeURIComponent(profileName)}.${configPathId}.json`,
  );
}

function isProfileCredentials(value: unknown): value is ProfileCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.aws_access_key_id === "string" &&
    typeof candidate.aws_secret_access_key === "string" &&
    typeof candidate.aws_session_token === "string" &&
    typeof candidate.aws_expiration === "string"
  );
}

/**
 * On-disk cache for credentials served through `--credential-process`.
 *
 * The AWS CLI and SDKs do not cache credential_process output between
 * invocations, so without this cache every `aws` command would trigger a full
 * browser login. Cached credentials live outside `~/.aws/credentials` on
 * purpose: static keys in the shared credentials file take precedence over
 * `credential_process` in the resolver chain, so writing them there would
 * shadow the credential_process entry and keep serving stale keys after
 * expiry.
 *
 * Reads are best-effort: any unreadable, corrupt, or expiring cache entry is
 * treated as a miss so the caller falls back to a fresh login.
 */
export const credentialCache = {
  async getValidCachedCredentialsAsync(
    profileName: string,
    profile: ProfileConfig,
  ): Promise<ProfileCredentials | undefined> {
    const filePath = cacheFilePath(profileName);

    let contents: unknown;
    try {
      contents = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        debug(
          `Ignoring unreadable credential cache for profile '${profileName}': ${String(
            error,
          )}`,
        );
      }
      return undefined;
    }

    if (
      !contents ||
      typeof contents !== "object" ||
      (contents as CacheFileContents).version !== 3 ||
      (contents as CacheFileContents).configurationId !==
        profileConfigurationId(profileName, profile) ||
      (contents as CacheFileContents).profileName !== profileName ||
      !isProfileCredentials((contents as CacheFileContents).credentials)
    ) {
      debug(
        `Ignoring credential cache with unexpected format for profile '${profileName}'`,
      );
      return undefined;
    }

    const credentials = (contents as CacheFileContents).credentials;
    const remainingMs =
      new Date(credentials.aws_expiration).getTime() - Date.now();
    if (isNaN(remainingMs) || remainingMs < refreshLimitInMs) {
      debug(
        `Cached credentials for profile '${profileName}' are expired or about to expire`,
      );
      return undefined;
    }

    debug(
      `Serving cached credentials for profile '${profileName}' (${Math.round(
        remainingMs / 1000,
      )}s remaining)`,
    );
    return credentials;
  },

  async isCacheFreshAsync(
    profileName: string,
    profile: ProfileConfig,
  ): Promise<boolean> {
    return !!(await this.getValidCachedCredentialsAsync(profileName, profile));
  },

  /**
   * Persist credentials for later credential_process runs. The return value
   * makes failures observable to callers that must not remove fallback
   * credentials until the cache is durable.
   */
  async setCachedCredentialsAsync(
    profileName: string,
    credentials: ProfileCredentials,
    profile: ProfileConfig,
  ): Promise<boolean> {
    const filePath = cacheFilePath(profileName);
    const tempPath = path.join(
      paths.az2awsCache,
      `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
    );

    try {
      await fs.mkdir(paths.az2awsCache, {
        recursive: true,
        mode: cacheDirMode,
      });
      const contents: CacheFileContents = {
        version: 3,
        configurationId: profileConfigurationId(profileName, profile),
        profileName,
        credentials,
      };
      await fs.writeFile(tempPath, JSON.stringify(contents), {
        mode: cacheFileMode,
      });
      await fs.rename(tempPath, filePath);
      if (process.platform !== "win32") {
        // Defensive: the temp file was created with 0600, but re-apply in case
        // an earlier az2aws version left a wider mode on an existing file.
        await fs.chmod(filePath, cacheFileMode).catch(() => undefined);
      }
      return true;
    } catch (error) {
      debug(
        `Failed to write credential cache for profile '${profileName}': ${String(
          error,
        )}`,
      );
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      return false;
    }
  },
};
