import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

const DISMISSED_KEY = "luskam.pwa-install-dismissed.v1";
const originalUserAgent = navigator.userAgent;

function useUserAgent(value: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value });
}

function makeInstallEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.defineProperties(event, {
    prompt: { value: prompt },
    platforms: { value: ["web"] },
    userChoice: { value: Promise.resolve({ outcome, platform: "web" }) },
  });
  return { event, prompt };
}

describe("Android PWA installation prompt", () => {
  beforeEach(() => {
    window.localStorage.removeItem(DISMISSED_KEY);
    useUserAgent("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile");
    delete (navigator as Navigator & { standalone?: boolean }).standalone;
    delete (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string }[]> }).getInstalledRelatedApps;
  });

  afterEach(() => {
    useUserAgent(originalUserAgent);
    window.localStorage.removeItem(DISMISSED_KEY);
  });

  it("calls the native prompt only after the Install App click", async () => {
    render(<PwaInstallPrompt />);
    expect(await screen.findByText(/open your browser menu/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install App" })).not.toBeInTheDocument();

    const { event, prompt } = makeInstallEvent("accepted");
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    const installButton = screen.getByRole("button", { name: "Install App" });
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(installButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Install Luskam Travel")).not.toBeInTheDocument();
  });

  it("remembers Not Now and does not re-prompt on a later visit", async () => {
    const { unmount } = render(<PwaInstallPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "Not Now" }));
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("true");
    unmount();

    render(<PwaInstallPrompt />);
    const { event } = makeInstallEvent();
    act(() => { window.dispatchEvent(event); });
    expect(screen.queryByLabelText("Install Luskam Travel")).not.toBeInTheDocument();
  });

  it("hides when already running in standalone mode and after appinstalled", () => {
    (navigator as Navigator & { standalone?: boolean }).standalone = true;
    const standalone = render(<PwaInstallPrompt />);
    expect(screen.queryByLabelText("Install Luskam Travel")).not.toBeInTheDocument();
    standalone.unmount();

    delete (navigator as Navigator & { standalone?: boolean }).standalone;
    render(<PwaInstallPrompt />);
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.queryByLabelText("Install Luskam Travel")).not.toBeInTheDocument();
  });

  it("hides when Chrome reports the web app is already installed", async () => {
    const installedApps = Promise.resolve([{ platform: "webapp" }]);
    (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string }[]> }).getInstalledRelatedApps = vi.fn(() => installedApps);
    await act(async () => {
      render(<PwaInstallPrompt />);
      await installedApps;
      await Promise.resolve();
    });
    expect(screen.queryByLabelText("Install Luskam Travel")).not.toBeInTheDocument();
  });

  it("preserves the existing iPhone Add to Home Screen path without showing Android UI", () => {
    useUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile");
    render(<PwaInstallPrompt />);
    expect(screen.queryByLabelText("Install Luskam Travel")).not.toBeInTheDocument();
    const { event } = makeInstallEvent();
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });
});
