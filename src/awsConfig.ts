import ini from "ini";
import _debug from "debug";
import { paths } from "./paths";
import { chmod, mkdir, rename, rm } from "node:fs/promises";
import fs from "fs";
import crypto from "node:crypto";
import path from "path";
import util from "util";

const debug = _debug("az2aws");

const writeFile = util.promisify(fs.writeFile);
const awsDirMode = 0o700;
const awsFileMode = 0o600;
const ignoredChmodErrorCodes = new Set([
  "EACCES",
  "EINVAL",
  "ENOSYS",
  "ENOTSUP",
  "EPERM",
  "EROFS",
]);

async function hardenPathPermissions(
  fsPath: string,
  mode: number,
): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  try {
    await chmod(fsPath, mode);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === "string" && ignoredChmodErrorCodes.has(code)) {
      debug(`Skipping permission hardening due to ${code}`);
      return;
    }

    throw error;
  }
}

async function hardenCreatedDirectories(
  createdDir: string,
  targetDir: string,
): Promise<void> {
  const resolvedCreatedDir = path.resolve(createdDir);
  const resolvedTargetDir = path.resolve(targetDir);
  const relativeTargetDir = path.relative(
    resolvedCreatedDir,
    resolvedTargetDir,
  );

  if (
    relativeTargetDir === ".." ||
    relativeTargetDir.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTargetDir)
  ) {
    debug(
      "Skipping permission hardening because the target directory is not within the created directory.",
    );
    return;
  }

  let currentDir = resolvedCreatedDir;
  await hardenPathPermissions(currentDir, awsDirMode);

  if (!relativeTargetDir) {
    return;
  }

  for (const segment of relativeTargetDir.split(path.sep)) {
    if (!segment || segment === ".") {
      continue;
    }

    currentDir = path.join(currentDir, segment);
    await hardenPathPermissions(currentDir, awsDirMode);
  }
}

async function atomicWriteTextFile(
  targetPath: string,
  text: string,
): Promise<void> {
  const targetDir = path.dirname(targetPath);
  const tempPath =
    targetDir === "."
      ? `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`
      : path.join(
          targetDir,
          `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`,
        );

  let shouldCleanupTempPath = false;

  try {
    await writeFile(tempPath, text);
    shouldCleanupTempPath = true;
    await hardenPathPermissions(tempPath, awsFileMode);
    await rename(tempPath, targetPath);
    shouldCleanupTempPath = false;
  } finally {
    if (shouldCleanupTempPath) {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  }
}

// Autorefresh credential time limit in milliseconds
export const refreshLimitInMs = 11 * 60 * 1000;

export interface ProfileConfig {
  azure_tenant_id: string;
  azure_app_id_uri: string;
  azure_default_username: string;
  azure_default_password?: string;
  azure_default_role_arn: string;
  azure_default_duration_hours: string;
  region: string;
  azure_default_remember_me: boolean;
  [key: string]: unknown;
}

export interface ProfileCredentials {
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_session_token: string;
  aws_expiration: string;
}

interface SaveData {
  [key: string]: ProfileConfig | ProfileCredentials;
}

export const awsConfig = {
  async setProfileConfigValuesAsync(
    profileName: string,
    values: ProfileConfig | Record<string, unknown>,
  ): Promise<void> {
    const sectionName =
      profileName === "default" ? "default" : `profile ${profileName}`;
    debug(
      `Setting config for profile '${profileName}' in section '${sectionName}'`,
    );
    const config =
      (await this._loadAsync<{ [key: string]: ProfileConfig }>("config")) || {};

    const section: Record<string, unknown> = {
      ...config[sectionName],
      ...values,
    };
    // A value of undefined means "remove this key from the profile".
    for (const key of Object.keys(section)) {
      if (section[key] === undefined) {
        delete section[key];
      }
    }
    config[sectionName] = section as ProfileConfig;

    await this._saveAsync("config", config);
  },

  async getProfileConfigAsync(
    profileName: string,
  ): Promise<ProfileConfig | undefined> {
    const sectionName =
      profileName === "default" ? "default" : `profile ${profileName}`;
    debug(
      `Getting config for profile '${profileName}' in section '${sectionName}'`,
    );
    const config = await this._loadAsync<{ [key: string]: ProfileConfig }>(
      "config",
    );

    if (!config) {
      return undefined;
    }

    return config[sectionName];
  },

  async isProfileAboutToExpireAsync(profileName: string): Promise<boolean> {
    debug(`Getting credentials for profile '${profileName}'`);
    const config = await this._loadAsync<{ [key: string]: ProfileCredentials }>(
      "credentials",
    );

    let expirationDate;

    if (
      !config ||
      config[profileName] === undefined ||
      config[profileName].aws_expiration === undefined
    ) {
      expirationDate = new Date();
    } else {
      expirationDate = new Date(config[profileName].aws_expiration);
    }

    const timeDifference = expirationDate.getTime() - new Date().getTime();

    // If expiration date is invalid (NaN), treat as expired for safety
    if (isNaN(timeDifference)) {
      debug("Invalid expiration date, treating as expired");
      return true;
    }

    debug(
      `Remaining time till credential expiration: ${
        timeDifference / 1000
      }s, refresh due if time lower than: ${refreshLimitInMs / 1000}s`,
    );
    return timeDifference < refreshLimitInMs;
  },

  async setProfileCredentialsAsync(
    profileName: string,
    values: ProfileCredentials,
  ): Promise<void> {
    const credentials =
      (await this._loadAsync<{
        [key: string]: ProfileCredentials;
      }>("credentials")) || {};

    debug(`Setting credentials for profile '${profileName}'`);
    credentials[profileName] = values;
    await this._saveAsync("credentials", credentials);
  },

  async removeProfileCredentialsAsync(profileName: string): Promise<void> {
    const credentials = await this._loadAsync<{
      [key: string]: ProfileCredentials;
    }>("credentials");

    if (!credentials || credentials[profileName] === undefined) {
      return;
    }

    debug(`Removing credentials for profile '${profileName}'`);
    delete credentials[profileName];
    await this._saveAsync("credentials", credentials);
  },

  async getAllProfileNames(): Promise<string[]> {
    debug(`Getting all configured profiles from config.`);
    const config =
      (await this._loadAsync<{ [key: string]: ProfileConfig }>("config")) || {};

    const profiles = Object.keys(config).map(function (e) {
      return e.replace("profile ", "");
    });
    debug(`Received profiles: ${profiles.toString()}`);
    return profiles;
  },

  async getAz2awsProfileNames(): Promise<string[]> {
    debug(`Getting az2aws-configured profiles from config.`);
    const config =
      (await this._loadAsync<{ [key: string]: ProfileConfig }>("config")) || {};

    const profiles: string[] = [];
    for (const [sectionName, sectionConfig] of Object.entries(config)) {
      let profileName: string;
      if (sectionName === "default") {
        profileName = "default";
      } else if (sectionName.startsWith("profile ")) {
        profileName = sectionName.substring("profile ".length);
      } else {
        debug(`Skipping non-profile section '${sectionName}'`);
        continue;
      }

      // Treat a profile as az2aws-managed if it has at least one azure_* key.
      // Required values (azure_tenant_id / azure_app_id_uri) may still be
      // supplied by environment variables at runtime, so don't hard-require
      // them in the config file.
      const hasAzureKey =
        sectionConfig &&
        typeof sectionConfig === "object" &&
        Object.keys(sectionConfig).some((key) => key.startsWith("azure_"));
      if (!hasAzureKey) {
        debug(
          `Skipping profile '${profileName}' because it has no az2aws (azure_*) keys`,
        );
        continue;
      }

      profiles.push(profileName);
    }

    debug(`Received az2aws profiles: ${profiles.toString()}`);
    return profiles;
  },

  async _loadAsync<T extends Record<string, unknown>>(
    type: string,
  ): Promise<T | undefined> {
    const targetPath = paths[type];
    if (!targetPath) throw new Error(`Unknown config type: '${type}'`);

    return new Promise<T | undefined>((resolve, reject) => {
      debug(`Loading '${type}' file`);
      fs.readFile(targetPath, "utf8", (err, data) => {
        if (err) {
          if (err.code === "ENOENT") {
            debug(`File not found. Returning undefined.`);
            return resolve(undefined);
          } else {
            return reject(err);
          }
        }

        debug("Parsing data");
        const parsedIni = ini.parse(data) as T;
        return resolve(parsedIni);
      });
    });
  },

  async _saveAsync(type: string, data: SaveData): Promise<void> {
    const targetPath = paths[type];
    if (!targetPath) throw new Error(`Unknown config type: '${type}'`);
    if (!data) throw new Error(`You must provide data for saving.`);

    debug(`Stringifying ${type} INI data`);
    const text = ini.stringify(data);
    const targetDir = path.dirname(targetPath);
    const isDefaultAwsDir =
      path.resolve(targetDir) === path.resolve(paths.awsDir);

    if (targetDir !== ".") {
      debug(`Creating target directory for '${type}' if it does not exist.`);
      const createdDir = await mkdir(targetDir, {
        recursive: true,
        mode: awsDirMode,
      });

      if (isDefaultAwsDir) {
        await hardenPathPermissions(targetDir, awsDirMode);
      } else if (createdDir) {
        await hardenCreatedDirectories(createdDir, targetDir);
      } else {
        debug(
          "Skipping directory permission hardening for existing custom directory.",
        );
      }
    } else {
      debug(
        `Skipping target directory creation for '${type}' because it uses the current working directory.`,
      );
    }

    debug(`Writing '${type}' INI to file atomically`);
    await atomicWriteTextFile(targetPath, text);
    // Defensive: atomicWriteTextFile already sets permissions on the temp file
    // before rename, but we re-apply here in case rename semantics differ across
    // platforms or file-systems.
    await hardenPathPermissions(targetPath, awsFileMode);
  },
};
