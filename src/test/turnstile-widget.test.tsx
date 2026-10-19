import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnstileWidget } from "@/components/TurnstileWidget";

describe("TurnstileWidget", () => {
  afterEach(() => {
    delete (window as Window & { turnstile?: unknown }).turnstile;
    vi.unstubAllEnvs();
  });

  it("clears and resets expired tokens and recreates the widget after submission failure", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "synthetic-public-site-key");
    let options: {
      action: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    } | null = null;
    const api = {
      render: vi.fn((_container: HTMLElement, nextOptions: typeof options) => {
        options = nextOptions;
        return "synthetic-widget-id";
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    (window as Window & { turnstile?: unknown }).turnstile = api;
    const onToken = vi.fn();
    const { rerender } = render(<TurnstileWidget onToken={onToken} resetKey={0} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(options?.action).toBe("flight_quote_request");

    act(() => options?.callback("synthetic-token"));
    expect(onToken).toHaveBeenLastCalledWith("synthetic-token");

    act(() => options?.["expired-callback"]());
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(api.reset).toHaveBeenCalledWith("synthetic-widget-id");

    rerender(<TurnstileWidget onToken={onToken} resetKey={1} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
    expect(api.remove).toHaveBeenCalledWith("synthetic-widget-id");
  });

  it("supports a workflow-specific action without changing the flight default", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "synthetic-public-site-key");
    let action = "";
    (window as Window & { turnstile?: unknown }).turnstile = {
      render: vi.fn((_container: HTMLElement, options: { action: string }) => { action = options.action; return "kakande-widget"; }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    render(<TurnstileWidget action="kakande_trip_request" onToken={vi.fn()} resetKey={0} />);
    await waitFor(() => expect(action).toBe("kakande_trip_request"));
  });
});
