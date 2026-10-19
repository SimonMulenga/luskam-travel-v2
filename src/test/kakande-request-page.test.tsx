import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Kakande from "@/pages/Kakande";

const { invoke, rpcMock } = vi.hoisted(() => ({ invoke: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, functions: { invoke } } }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/TurnstileWidget", async () => {
  const React = await import("react");
  return { TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => React.createElement("button", { type: "button", onClick: () => onToken("synthetic-turnstile-token") }, "Complete synthetic CAPTCHA") };
});

describe("Kakande request page submission", () => {
  const publicOptions = [
    { trip_id: "dec-2026", option_id: "synthetic-flight-option", month_label: "December 2026", transport_mode: "flight", departure_date: "2026-12-10", price_per_traveller_zmw: 11200, availability: "open" },
    { trip_id: "dec-2026", option_id: "synthetic-road-option", month_label: "December 2026", transport_mode: "road", departure_date: "2026-12-08", price_per_traveller_zmw: 4700, availability: "filling_fast" },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    invoke.mockReset();
    rpcMock.mockReset().mockResolvedValue({ data: publicOptions, error: null });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } });
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a" });
  });

  const flushListing = async () => {
    const pending = rpcMock.mock.results[0]?.value as Promise<unknown> | undefined;
    await act(async () => {
      if (pending) await pending;
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    });
  };

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("shows a reference only after the backend confirms persistence", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("synthetic network failure") });
    const { unmount } = render(<Kakande />);
    await flushListing();
    expect(rpcMock).toHaveBeenCalledWith("list_public_kakande_trip_options");
    await expect(rpcMock.mock.results[0]?.value).resolves.toEqual({ data: publicOptions, error: null });
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
    await flushListing();
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
    expect(options.body).toMatchObject({ tripId: "dec-2026", mode: "flight", travellers: 1, turnstileToken: "synthetic-turnstile-token" });
    expect(options.body).not.toHaveProperty("passport");
    expect(options.body).not.toHaveProperty("pricePerTravellerZmw");
    expect(options.body).not.toHaveProperty("totalQuotedAmountZmw");
    expect(options.body.idempotencyKey).toBe("0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a");
    unmount();
  });

  it("lets a customer select an eligible road option and never sends displayed prices", async () => {
    invoke.mockResolvedValue({ data: { reference: "KMR-20261018-0123456789ABCDEF", duplicate: false }, error: null });
    render(<Kakande />);
    await flushListing();
    fireEvent.click(screen.getByRole("radio", { name: /By road/ }));
    fireEvent.change(screen.getByPlaceholderText("Your full name"), { target: { value: "Synthetic Test Customer" } });
    fireEvent.change(screen.getByPlaceholderText("+260…"), { target: { value: "+260 977 000 111" } });
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "synthetic@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete synthetic CAPTCHA" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send trip request" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const [, options] = invoke.mock.calls[0];
    expect(options.body).toMatchObject({ tripId: "dec-2026", mode: "road", travellers: 1 });
    expect(options.body).not.toHaveProperty("pricePerTravellerZmw");
    expect(options.body).not.toHaveProperty("totalQuotedAmountZmw");
  });

  it("shows empty and error states without enabling a request for ineligible options", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { ...publicOptions[0], availability: "closed" },
        { ...publicOptions[1], departure_date: "2026-04-30", availability: "open" },
      ],
      error: null,
    });
    const emptyView = render(<Kakande />);
    await flushListing();
    expect(screen.getByText("No future trip options are currently published.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send trip request" })).not.toBeInTheDocument();
    expect(screen.getByText("Historical listed departures")).toBeInTheDocument();
    emptyView.unmount();

    rpcMock.mockResolvedValue({ data: null, error: new Error("private listing failure") });
    render(<Kakande />);
    await flushListing();
    expect(screen.getByRole("alert")).toHaveTextContent("Published trip options could not be loaded");
    expect(screen.queryByRole("button", { name: "Send trip request" })).not.toBeInTheDocument();
    expect(screen.queryByText("private listing failure")).not.toBeInTheDocument();
  });
});
