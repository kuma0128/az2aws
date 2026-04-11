const REDACTED = "[redacted]";
const SAFE_MICROSOFT_LOGIN_PATH_SEGMENTS = new Set([
  "common",
  "consumers",
  "organizations",
  "favicon.ico",
  "kmsi",
]);
const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>]+/gi;
const AWS_ACCESS_KEY_ID_PATTERN = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const SENSITIVE_FIELD_NAMES = [
  "AZURE_DEFAULT_PASSWORD",
  "password",
  "aws_access_key_id",
  "aws_secret_access_key",
  "aws_session_token",
  "AccessKeyId",
  "SecretAccessKey",
  "SessionToken",
  "SAMLAssertion",
  "SAMLResponse",
  "Authorization",
  "Cookie",
  "Set-Cookie",
];
const SENSITIVE_ASSIGNMENT_PATTERN = new RegExp(
  `((?:${SENSITIVE_FIELD_NAMES.join("|")})\\s*[=:]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;]+)`,
  "gi",
);
const SENSITIVE_JSON_PATTERN = new RegExp(
  `((?:"(?:${SENSITIVE_FIELD_NAMES.join("|")})"\\s*:\\s*))(?:"[^"]*"|null|[^\\s,}]+)`,
  "gi",
);
const SHARED_ENVIRONMENT_ERROR_MESSAGE =
  "az2aws failed with an unexpected error in a shared environment. Re-run locally with DEBUG=az2aws for full details.";

export function shouldAllowSensitiveOutput(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CI !== "true" && env.GITHUB_ACTIONS !== "true";
}

export function redactUrlForLogs(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split("/");

    if (
      parsedUrl.hostname === "login.microsoftonline.com" &&
      pathSegments[1] &&
      !SAFE_MICROSOFT_LOGIN_PATH_SEGMENTS.has(pathSegments[1])
    ) {
      pathSegments[1] = REDACTED;
      parsedUrl.pathname = pathSegments.join("/");
    }

    if (parsedUrl.username || parsedUrl.password) {
      parsedUrl.username = REDACTED;
      parsedUrl.password = REDACTED;
    }

    for (const key of new Set(parsedUrl.searchParams.keys())) {
      parsedUrl.searchParams.set(key, REDACTED);
    }

    if (parsedUrl.hash) {
      parsedUrl.hash = REDACTED;
    }

    return parsedUrl.toString();
  } catch {
    const questionMarkIndex = url.indexOf("?");
    if (questionMarkIndex === -1) {
      return url;
    }

    return `${url.slice(0, questionMarkIndex)}?${REDACTED}`;
  }
}

export function sanitizeMessage(message: string): string {
  return message
    .replace(URL_PATTERN, (url) => redactUrlForLogs(url))
    .replace(AWS_ACCESS_KEY_ID_PATTERN, REDACTED)
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1${REDACTED}`)
    .replace(SENSITIVE_JSON_PATTERN, `$1"${REDACTED}"`);
}

export function formatCliErrorMessage(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return shouldAllowSensitiveOutput(env) ? message : sanitizeMessage(message);
}

export function formatUnexpectedErrorMessage(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (shouldAllowSensitiveOutput(env)) {
    return error instanceof Error ? error.message : String(error);
  }

  return SHARED_ENVIRONMENT_ERROR_MESSAGE;
}

export function formatDebugErrorMessage(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return shouldAllowSensitiveOutput(env) ? message : sanitizeMessage(message);
}
