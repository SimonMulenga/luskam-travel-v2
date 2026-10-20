import { describe, expect, it } from "vitest";
import { isAiAssistantEnabled } from "@/lib/featureFlags";

describe("AI assistant feature flag", () => {
  it("defaults to disabled unless explicitly enabled", () => {
    expect(isAiAssistantEnabled(undefined)).toBe(false);
    expect(isAiAssistantEnabled("")).toBe(false);
    expect(isAiAssistantEnabled("false")).toBe(false);
    expect(isAiAssistantEnabled("TRUE")).toBe(false);
    expect(isAiAssistantEnabled("true")).toBe(true);
  });
});
