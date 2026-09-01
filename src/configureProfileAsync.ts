import inquirer from "inquirer";
import { CLIError } from "./CLIError";
import { awsConfig } from "./awsConfig";
import {
  buildCredentialProcessCommand,
  buildLoginCommand,
  isAz2awsCredentialProcess,
} from "./credentialProcess";
import {
  parseSessionDurationHours,
  sessionDurationHoursValidationMessage,
  validateSessionDurationHours,
} from "./sessionDuration";

export async function configureProfileAsync(
  profileName: string,
): Promise<void> {
  console.log(`Configuring profile '${profileName}'`);

  const profile = await awsConfig.getProfileConfigAsync(profileName);

  // Default to wiring credential_process unless the profile already delegates
  // to another tool, which az2aws must not overwrite.
  const existingCredentialProcess = profile?.credential_process;
  const hasForeignCredentialProcess =
    existingCredentialProcess !== undefined &&
    !isAz2awsCredentialProcess(existingCredentialProcess);
  const foreignCredentialProcessMessage =
    "Existing credential_process is managed by another tool and cannot be overwritten.";

  const questions = [
    {
      type: "input" as const,
      name: "tenantId",
      message: "Azure Tenant ID:",
      validate: (input: string): boolean => input.trim().length > 0,
      default: profile && profile.azure_tenant_id,
    },
    {
      type: "input" as const,
      name: "appIdUri",
      message: "Azure App ID URI:",
      validate: (input: string): boolean => input.trim().length > 0,
      default: profile && (profile.azure_app_id_uri || profile.azure_app_id),
    },
    {
      type: "input" as const,
      name: "username",
      message: "Default Username:",
      default: profile && profile.azure_default_username,
    },
    {
      type: "input" as const,
      name: "rememberMe",
      message:
        "Stay logged in: skip authentication while refreshing aws credentials (true|false)",
      default:
        profile?.azure_default_remember_me === undefined
          ? "true"
          : profile.azure_default_remember_me.toString(),
      validate: (input: string): boolean | string => {
        if (input === "true" || input === "false") return true;
        return "Remember me must be either true or false";
      },
    },
    {
      type: "input" as const,
      name: "credentialProcess",
      message:
        "Let AWS CLI refresh credentials automatically via credential_process (true|false)",
      default: hasForeignCredentialProcess ? "false" : "true",
      validate: (input: string): boolean | string => {
        if (input !== "true" && input !== "false") {
          return "credential_process must be either true or false";
        }
        if (input === "true" && hasForeignCredentialProcess) {
          return foreignCredentialProcessMessage;
        }
        return true;
      },
    },
    {
      type: "input" as const,
      name: "defaultRoleArn",
      message: "Default Role ARN (if multiple):",
      default: profile && profile.azure_default_role_arn,
    },
    {
      type: "input" as const,
      name: "defaultDurationHours",
      message: "Default Session Duration Hours (up to 12):",
      default:
        parseSessionDurationHours(profile?.azure_default_duration_hours) ?? 1,
      validate: validateSessionDurationHours,
    },
    {
      type: "input" as const,
      name: "region",
      message: "AWS Region:",
      default: profile && profile.region,
    },
  ];

  const answers = await inquirer.prompt(questions);
  const defaultDurationHours = parseSessionDurationHours(
    answers.defaultDurationHours as string | number | undefined,
  );

  if (defaultDurationHours === null) {
    throw new CLIError(sessionDurationHoursValidationMessage);
  }

  const wireCredentialProcess =
    (answers.credentialProcess as string) === "true";
  // Keep the invariant even when the prompt layer is mocked or bypassed.
  if (wireCredentialProcess && hasForeignCredentialProcess) {
    throw new CLIError(foreignCredentialProcessMessage);
  }
  const values: Record<string, unknown> = {
    azure_tenant_id: answers.tenantId as string,
    azure_app_id_uri: answers.appIdUri as string,
    azure_default_username: answers.username as string,
    azure_default_role_arn: answers.defaultRoleArn as string,
    azure_default_duration_hours: String(defaultDurationHours),
    azure_default_remember_me: (answers.rememberMe as string) === "true",
    region: answers.region as string,
  };

  if (wireCredentialProcess) {
    values.credential_process = buildCredentialProcessCommand(profileName);
  } else if (isAz2awsCredentialProcess(existingCredentialProcess)) {
    // undefined removes the previously wired az2aws entry; a foreign entry is
    // left untouched by omitting the key entirely.
    values.credential_process = undefined;
  }

  await awsConfig.setProfileConfigValuesAsync(profileName, values);

  console.log("Profile saved.");
  if (wireCredentialProcess) {
    const loginCommand = buildLoginCommand(profileName);
    console.log(
      "AWS CLI will refresh credentials automatically via credential_process.",
    );
    console.log(
      `Run '${loginCommand}' once to sign in; afterwards aws commands refresh on their own (az2aws must be on PATH).`,
    );
  }
}
