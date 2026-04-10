import ini from "ini";
import _debug from "debug";
import { paths } from "./paths";
import { chmod, mkdir } from "node:fs/promises";
import fs from "fs";
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
      debug(`Skipping permission hardening for '${fsPath}' due to ${code}`);
      return;
    }

    throw error;
  }
}

// Autorefresh credential time limit in milliseconds
const refreshLimitInMs = 11 * 60 * 1000;

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
    values: ProfileConfig,
  ): Promise<void> {
    const sectionName =
      profileName === "default" ? "default" : `profile ${profileName}`;
    debug(
      `Setting config for profile '${profileName}' in section '${sectionName}'`,
    );
    const config =
      (await this._loadAsync<{ [key: string]: ProfileConfig }>("config")) || {};

    config[sectionName] = {
      ...config[sectionName],
      ...values,
    };

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

  async _loadAsync<T extends Record<string, unknown>>(
    type: string,
  ): Promise<T | undefined> {
    const targetPath = paths[type];
    if (!targetPath) throw new Error(`Unknown config type: '${type}'`);

    return new Promise<T | undefined>((resolve, reject) => {
      debug(`Loading '${type}' file at '${targetPath}'`);
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

    if (targetDir !== ".") {
      debug(`Creating target directory '${targetDir}' if not exists.`);
      await mkdir(targetDir, { recursive: true, mode: awsDirMode });
      await hardenPathPermissions(targetDir, awsDirMode);
    } else {
      debug(
        `Skipping target directory creation for '${targetPath}' because it uses the current working directory.`,
      );
    }

    debug(`Writing '${type}' INI to file '${targetPath}'`);
    await writeFile(targetPath, text);
    await hardenPathPermissions(targetPath, awsFileMode);
  },
};
