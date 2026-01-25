import inquirer, { Question } from "inquirer";
import { awsConfig, ProfileConfig } from "./awsConfig";

export async function configureProfileAsync(
  profileName: string
): Promise<void> {
  console.log(`Configuring profile '${profileName}'`);

  const profile = await awsConfig.getProfileConfigAsync(profileName);

  const questions: Question[] = [
    {
      name: "tenantId",
      message: "Azure Tenant ID:",
      validate: (input): boolean => !!input,
      default: profile && profile.azure_tenant_id,
    },
    {
      name: "appIdUri",
      message: "Azure App ID URI:",
      validate: (input): boolean => !!input,
      default: profile && profile.azure_app_id_uri,
    },
    {
      name: "username",
      message: "Default Username:",
      default: profile && profile.azure_default_username,
    },
    {
      name: "rememberMe",
      message:
        "Stay logged in: skip authentication while refreshing aws credentials (true|false)",
      default:
        (profile &&
          profile.azure_default_remember_me &&
          profile.azure_default_remember_me.toString()) ||
        "false",
      validate: (input): boolean | string => {
        if (input === "true" || input === "false") return true;
        return "Remember me must be either true or false";
      },
    },
    {
      name: "defaultRoleArn",
      message: "Default Role ARN (if multiple):",
      default: profile && profile.azure_default_role_arn,
    },
    {
      name: "defaultDurationHours",
      message: "Default Session Duration Hours (up to 12):",
      default: (profile && profile.azure_default_duration_hours) || 1,
      validate: (input): boolean | string => {
        input = Number(input);
        if (input > 0 && input <= 12) return true;
        return "Duration hours must be between 1 and 12";
      },
    },
    {
      name: "region",
      message: "AWS Region:",
      default: profile && profile.region,
    },
    {
      name: "assertionConsumerServiceUrl",
      message: "Assertion Consumer Service URL (optional):",
      default: profile && profile.assertion_consumer_service_url,
      validate: (input): boolean | string => {
        if (!input) return true;
        try {
          const url = new URL(input);
          if (url.protocol !== "https:" && url.protocol !== "http:") {
            return "Assertion Consumer Service URL must start with http:// or https://";
          }
        } catch {
          return "Assertion Consumer Service URL must be a valid URL";
        }
        return true;
      },
    },
  ];

  const answers = await inquirer.prompt(questions);

  const configValues: ProfileConfig = {
    azure_tenant_id: answers.tenantId as string,
    azure_app_id_uri: answers.appIdUri as string,
    azure_default_username: answers.username as string,
    azure_default_role_arn: answers.defaultRoleArn as string,
    azure_default_duration_hours: answers.defaultDurationHours as string,
    azure_default_remember_me: (answers.rememberMe as string) === "true",
    region: answers.region as string,
  };
  const assertionConsumerServiceUrl = answers.assertionConsumerServiceUrl as
    | string
    | undefined;
  if (assertionConsumerServiceUrl) {
    configValues.assertion_consumer_service_url =
      assertionConsumerServiceUrl;
  }

  await awsConfig.setProfileConfigValuesAsync(profileName, configValues);

  console.log("Profile saved.");
}
