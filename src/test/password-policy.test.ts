import { describe, expect, it } from "vitest";
import { getPasswordRequirementResults, isPasswordValid } from "@/lib/passwordPolicy";

describe("password policy", () => {
  it("requires length, uppercase, lowercase, number, and a special character", () => {
    expect(isPasswordValid("StrongPass1!")).toBe(true);
    for (const password of ["short1!", "lowercase1!", "UPPERCASE1!", "NoNumber!!", "NoSpecial123"]) {
      expect(isPasswordValid(password), `expected ${password} to fail`).toBe(false);
    }
  });

  it("reports each rule independently for the live checklist", () => {
    const results = getPasswordRequirementResults("Short1!");
    expect(results).toEqual([
      { id: "length", label: "At least 8 characters", satisfied: false },
      { id: "uppercase", label: "At least one uppercase letter (A–Z)", satisfied: true },
      { id: "lowercase", label: "At least one lowercase letter (a–z)", satisfied: true },
      { id: "number", label: "At least one number (0–9)", satisfied: true },
      { id: "special", label: "At least one special character", satisfied: true },
    ]);
  });
});
