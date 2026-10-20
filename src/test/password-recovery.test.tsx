import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import { clearValidatedPasswordRecoverySession } from "@/lib/passwordRecoveryState";

const { auth, toast } = vi.hoisted(() => ({
  auth: {
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("sonner", () => ({ toast }));

const recoverySession = { user: { id: "synthetic-customer" }, access_token: "synthetic-access-token" };

function renderReset() {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth" element={<p>Sign in page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("password recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearValidatedPasswordRecoverySession();
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    auth.updateUser.mockResolvedValue({ data: { user: recoverySession.user }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("sends a recovery request to the staging site's reset route and always uses neutral copy", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: new Error("User not found") });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "synthetic@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));

    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists for this email, password reset instructions will be sent.");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("synthetic@example.test", {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(screen.queryByText("User not found")).not.toBeInTheDocument();
  });

  it("rejects a missing or expired recovery session", async () => {
    renderReset();
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("does not treat an ordinary signed-in session as password recovery", async () => {
    auth.getSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    renderReset();
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has expired");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("allows a validated recovery session, enforces the new password, updates and returns to login", async () => {
    auth.getSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    auth.onAuthStateChange.mockImplementation((callback: (event: string, session: typeof recoverySession | null) => void) => ({
      data: { subscription: { unsubscribe: vi.fn() } },
      callback,
    }));
    const view = renderReset();
    const authRegistration = auth.onAuthStateChange.mock.results.at(-1)?.value;
    act(() => authRegistration.callback("PASSWORD_RECOVERY", recoverySession));

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Fresh-Password-2!" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "Fresh-Password-2!" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save new password" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByText("Sign in page")).toBeInTheDocument();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Fresh-Password-2!" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    view.unmount();
  });

  it("keeps the recovery form active and hides backend details when update fails", async () => {
    auth.getSession.mockResolvedValue({ data: { session: recoverySession }, error: null });
    auth.onAuthStateChange.mockImplementation((callback: (event: string, session: typeof recoverySession | null) => void) => ({
      data: { subscription: { unsubscribe: vi.fn() } }, callback,
    }));
    renderReset();
    const authRegistration = auth.onAuthStateChange.mock.results.at(-1)?.value;
    act(() => authRegistration.callback("PASSWORD_RECOVERY", recoverySession));
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: new Error("expired private token") });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Fresh-Password-2!" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "Fresh-Password-2!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The recovery link may have expired");
    expect(screen.queryByText("expired private token")).not.toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
