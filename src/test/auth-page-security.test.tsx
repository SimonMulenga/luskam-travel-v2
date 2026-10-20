import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthPage from "@/pages/Auth";

const { auth, toast, oauth } = vi.hoisted(() => ({
  auth: { signUp: vi.fn(), signInWithPassword: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  oauth: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: oauth } } }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("sonner", () => ({ toast }));

const accountSession = { user: { id: "customer-1", email: "customer@example.test" }, access_token: "synthetic-token" };
const renderAuth = () => render(
  <MemoryRouter initialEntries={["/auth?next=/account"]}>
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/account" element={<p>Account page</p>} />
    </Routes>
  </MemoryRouter>,
);

describe("Auth page registration and login feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    auth.signUp.mockResolvedValue({ data: { user: { id: "customer-1" }, session: null }, error: null });
    auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: null });
  });

  it("treats pending email verification as a neutral next-step notice, not a signed-in success", async () => {
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Synthetic Customer" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+260 977 000 001" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith({
      email: "customer@example.test",
      password: "Synthetic-Password-1!",
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: "Synthetic Customer", phone: "+260 977 000 001" },
      },
    }));
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("If registration can be completed"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Create your account" })).toBeInTheDocument();
  });

  it("does not report signup success or reveal Auth errors", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("Email already registered"),
    });
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Synthetic Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("If registration can be completed")));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(JSON.stringify(toast.info.mock.calls)).not.toContain("Email already registered");
  });

  it("uses the same generic message for password-login failures", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: new Error("Email not found") });
    renderAuth();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invalid email or password. Please check your credentials and try again."));
    expect(JSON.stringify(toast.error.mock.calls)).not.toContain("Email not found");
  });

  it("does not treat a response without a session as a successful login", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: accountSession.user, session: null }, error: null });
    renderAuth();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Sign in to your account" })).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Invalid email or password. Please check your credentials and try again.");
  });

  it("routes only after a real session is returned for signup", async () => {
    auth.signUp.mockResolvedValue({ data: { user: accountSession.user, session: accountSession }, error: null });
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Synthetic Customer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Account page")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Account created and signed in.");
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("routes a successful login through the session returned by Supabase", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: accountSession.user, session: accountSession }, error: null });
    renderAuth();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalled());
    // Supabase's auth state listener performs the session transition.
    const listener = auth.onAuthStateChange.mock.calls[0][0];
    act(() => listener("SIGNED_IN", accountSession));

    expect(await screen.findByText("Account page")).toBeInTheDocument();
  });

  it("keeps a legacy-password login active if Auth returns a session with a policy warning", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { user: accountSession.user, session: accountSession }, error: new Error("Weak password") });
    renderAuth();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "customer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "legacy-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const listener = auth.onAuthStateChange.mock.calls[0][0];
    act(() => listener("SIGNED_IN", accountSession));
    expect(await screen.findByText("Account page")).toBeInTheDocument();
  });

  it("shows live password requirements and blocks signup until confirmation matches", async () => {
    renderAuth();
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "weak" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    expect(screen.getByText("At least 8 characters").closest("li")).toHaveClass("text-muted-foreground");

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Synthetic-Password-1!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Synthetic-Password-1!" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled());
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("supports showing and hiding the password without changing its value", () => {
    renderAuth();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "legacy-password" } });
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("legacy-password");
  });
});
