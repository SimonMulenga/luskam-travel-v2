import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Kakande from "@/pages/Kakande";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/TurnstileWidget", async () => {
  const React = await import("react");
  return { TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => React.createElement("button", { type: "button", onClick: () => onToken("synthetic-turnstile-token") }, "Complete synthetic CAPTCHA") };
});

describe("Kakande request page submission", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    invoke.mockReset();
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } });
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a" });
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("shows a reference only after the backend confirms persistence", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("synthetic network failure") });
    const { unmount } = render(<Kakande />);
    fireEvent.change(screen.getByPlaceholderText("Your full name"), { target: { value: "Synthetic Test Customer" } });
    fireEvent.change(screen.getByPlaceholderText("+260…"), { target: { value: "+260 977 000 111" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "synthetic@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete synthetic CAPTCHA" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send trip request" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Travel request received")).not.toBeInTheDocument();
    expect(screen.queryByText(/KMR-/)).not.toBeInTheDocument();
    unmount();
  });

  it("shows the backend reference after a confirmed response and submits the Kakande action token", async () => {
    invoke.mockResolvedValue({ data: { reference: "KMR-20261018-0123456789ABCDEF", duplicate: false }, error: null });
    const { unmount } = render(<Kakande />);
    fireEvent.change(screen.getByPlaceholderText("Your full name"), { target: { value: "Synthetic Test Customer" } });
    fireEvent.change(screen.getByPlaceholderText("+260…"), { target: { value: "+260 977 000 111" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "synthetic@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete synthetic CAPTCHA" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send trip request" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Travel request received")).toBeInTheDocument();
    expect(screen.getByText("KMR-20261018-0123456789ABCDEF")).toBeInTheDocument();
    const [, options] = invoke.mock.calls[0];
    expect(options.body).toMatchObject({ tripId: "jun-2026", mode: "flight", travellers: 1, turnstileToken: "synthetic-turnstile-token" });
    expect(options.body).not.toHaveProperty("passport");
    expect(options.body).not.toHaveProperty("pricePerTravellerZmw");
    expect(options.body).not.toHaveProperty("totalQuotedAmountZmw");
    expect(options.body.idempotencyKey).toBe("0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a");
    unmount();
  });
});
