/** Feature flags fail closed unless explicitly enabled with the string "true". */
export function isAiAssistantEnabled(value: string | undefined): boolean {
  return value === "true";
}
