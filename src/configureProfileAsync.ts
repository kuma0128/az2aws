import inquirer from "inquirer";
import { awsConfig } from "./awsConfig";

export async function configureProfileAsync(
  profileName: string,
): Promise<void> {
  console.log(`Configuring profile '${profileName}'`);

  const profile = await awsConfig.getProfileConfigAsync(profileName);

  const questions = [
    {
      type: "input" as const,
      name: "tenantId",
      message: "Azure Tenant ID:",
      validate: (input: string): boolean => !!input,
      default: profile && profile.azure_tenant_id,
    },
    {
      type: "input" as const,
      name: "appIdUri",
      message: "Azure App ID URI:",
      validate: (input: string): boolean => !!input,
      default: profile && profile.azure_app_id_uri,
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
        (profile &&
          profile.azure_default_remember_me &&
          profile.azure_default_remember_me.toString()) ||
        "false",
      validate: (input: string): boolean | string => {
        if (input === "true" || input === "false") return true;
        return "Remember me must be either true or false";
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
      default: (profile && profile.azure_default_duration_hours) || 1,
      validate: (input: string): boolean | string => {
        const num = Number(input);
        if (num > 0 && num <= 12) return true;
        return "Duration hours must be between 1 and 12";
      },
    },
    {
      type: "input" as const,
      name: "region",
      message: "AWS Region:",
      default: profile && profile.region,
    },
  ];

  const answers = await inquirer.prompt(questions);

  await awsConfig.setProfileConfigValuesAsync(profileName, {
    azure_tenant_id: answers.tenantId as string,
    azure_app_id_uri: answers.appIdUri as string,
    azure_default_username: answers.username as string,
    azure_default_role_arn: answers.defaultRoleArn as string,
    azure_default_duration_hours: answers.defaultDurationHours as string,
    azure_default_remember_me: (answers.rememberMe as string) === "true",
    region: answers.region as string,
  });

  console.log("Profile saved.");
}
