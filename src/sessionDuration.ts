export const sessionDurationHoursValidationMessage =
  "Duration hours must be a whole number between 1 and 12";

export function parseSessionDurationHours(
  input: string | number | undefined,
): number | null {
  if (input === undefined) {
    return null;
  }

  if (typeof input === "number") {
    return Number.isInteger(input) && input > 0 && input <= 12 ? input : null;
  }

  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return parsed > 0 && parsed <= 12 ? parsed : null;
}

export function validateSessionDurationHours(
  input: string | number,
): true | string {
  // Inquirer types `validate` input as string, but it may validate a numeric
  // `default` value before coercing it to user input.
  return parseSessionDurationHours(input) === null
    ? sessionDurationHoursValidationMessage
    : true;
}
