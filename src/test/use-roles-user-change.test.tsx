import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, pendingRoleQueries } = vi.hoisted(() => ({
  authState: { userId: "customer-a", loading: false },
  pendingRoleQueries: new Map<string, (result: { data: { role: "admin" | "agent" | "user" }[] | null; error: { message: string } | null }) => void>(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.userId ? { id: authState.userId } : null, loading: authState.loading }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => new Promise((resolve) => {
          pendingRoleQueries.set(userId, resolve as (result: { data: { role: "admin" | "agent" | "user" }[] | null; error: { message: string } | null }) => void);
        }),
      }),
    }),
  },
}));

import { useRoles } from "@/hooks/useRoles";

describe("useRoles user changes", () => {
  beforeEach(() => {
    authState.userId = "customer-a";
    authState.loading = false;
    pendingRoleQueries.clear();
  });

  it("clears the previous user's role immediately while loading the next identity", async () => {
    const { result, rerender } = renderHook(() => useRoles());
    await act(async () => {
      pendingRoleQueries.get("customer-a")?.({ data: [{ role: "admin" }], error: null });
    });
    expect(result.current.isAdmin).toBe(true);

    authState.userId = "customer-b";
    rerender();
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pendingRoleQueries.get("customer-b")?.({ data: [{ role: "user" }], error: null });
    });
    expect(result.current.roles).toEqual(["user"]);
    expect(result.current.loading).toBe(false);
  });

  it("clears admin access immediately on sign-out", async () => {
    const { result, rerender } = renderHook(() => useRoles());
    await act(async () => {
      pendingRoleQueries.get("customer-a")?.({ data: [{ role: "admin" }], error: null });
    });
    expect(result.current.isAdmin).toBe(true);

    authState.userId = null;
    rerender();
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAgent).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("replaces admin access with only the next user's agent role", async () => {
    const { result, rerender } = renderHook(() => useRoles());
    await act(async () => {
      pendingRoleQueries.get("customer-a")?.({ data: [{ role: "admin" }], error: null });
    });

    authState.userId = "agent-b";
    rerender();
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pendingRoleQueries.get("agent-b")?.({ data: [{ role: "agent" }], error: null });
    });
    expect(result.current.roles).toEqual(["agent"]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAgent).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("does not render staff privileges after an admin switches to a customer", async () => {
    const { result, rerender } = renderHook(() => useRoles());
    await act(async () => {
      pendingRoleQueries.get("customer-a")?.({ data: [{ role: "admin" }], error: null });
    });

    authState.userId = "customer-b";
    rerender();
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAgent).toBe(false);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pendingRoleQueries.get("customer-b")?.({ data: [{ role: "user" }], error: null });
    });
    expect(result.current.roles).toEqual(["user"]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAgent).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("ignores a stale role response that arrives after the authenticated user changes", async () => {
    const { result, rerender } = renderHook(() => useRoles());
    authState.userId = "customer-b";
    rerender();
    await act(async () => {
      pendingRoleQueries.get("customer-a")?.({ data: [{ role: "admin" }], error: null });
    });
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);

    await act(async () => {
      pendingRoleQueries.get("customer-b")?.({ data: [{ role: "user" }], error: null });
    });
    expect(result.current.roles).toEqual(["user"]);
    expect(result.current.loading).toBe(false);
  });

  it("stops loading and exposes an error when the role lookup fails", async () => {
    const { result } = renderHook(() => useRoles());
    await act(async () => {
      pendingRoleQueries.get("customer-a")?.({ data: null, error: { message: "role query failed" } });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.roles).toEqual([]);
    expect(result.current.error).toBe("role query failed");
  });
});
