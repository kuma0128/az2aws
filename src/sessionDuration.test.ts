import { describe, expect, it } from "vitest";
import {
  parseSessionDurationHours,
  sessionDurationHoursValidationMessage,
  validateSessionDurationHours,
} from "./sessionDuration";

describe("sessionDuration", () => {
  describe("parseSessionDurationHours", () => {
    it("should accept whole numbers between 1 and 12", () => {
      expect(parseSessionDurationHours("1")).toBe(1);
      expect(parseSessionDurationHours("12")).toBe(12);
      expect(parseSessionDurationHours(8)).toBe(8);
      expect(parseSessionDurationHours("08")).toBe(8);
    });

    it("should reject fractional and scientific notation values", () => {
      expect(parseSessionDurationHours("1.5")).toBeNull();
      expect(parseSessionDurationHours("1e1")).toBeNull();
      expect(parseSessionDurationHours(1.5)).toBeNull();
    });

    it("should reject non-positive, too large, and non-numeric values", () => {
      expect(parseSessionDurationHours("0")).toBeNull();
      expect(parseSessionDurationHours("-1")).toBeNull();
      expect(parseSessionDurationHours("13")).toBeNull();
      expect(parseSessionDurationHours("abc")).toBeNull();
      expect(parseSessionDurationHours(undefined)).toBeNull();
    });
  });

  describe("validateSessionDurationHours", () => {
    it("should return true for valid values", () => {
      expect(validateSessionDurationHours("1")).toBe(true);
      expect(validateSessionDurationHours("12")).toBe(true);
      expect(validateSessionDurationHours(6)).toBe(true);
    });

    it("should return the validation message for invalid values", () => {
      expect(validateSessionDurationHours("1.5")).toBe(
        sessionDurationHoursValidationMessage,
      );
      expect(validateSessionDurationHours("1e1")).toBe(
        sessionDurationHoursValidationMessage,
      );
      expect(validateSessionDurationHours("0")).toBe(
        sessionDurationHoursValidationMessage,
      );
    });
  });
});
