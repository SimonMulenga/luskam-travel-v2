const allowedSpecialCharacters = "!@#$%^&*()_+-=[]{};':\"|<>?,./`~\\";

export const passwordRequirements = [
  { id: "length", label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { id: "uppercase", label: "At least one uppercase letter (A–Z)", test: (value: string) => /[A-Z]/.test(value) },
  { id: "lowercase", label: "At least one lowercase letter (a–z)", test: (value: string) => /[a-z]/.test(value) },
  { id: "number", label: "At least one number (0–9)", test: (value: string) => /[0-9]/.test(value) },
  { id: "special", label: "At least one special character", test: (value: string) => [...value].some((character) => allowedSpecialCharacters.includes(character)) },
] as const;

export function getPasswordRequirementResults(value: string) {
  return passwordRequirements.map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    satisfied: requirement.test(value),
  }));
}

export function isPasswordValid(value: string) {
  return passwordRequirements.every((requirement) => requirement.test(value));
}
