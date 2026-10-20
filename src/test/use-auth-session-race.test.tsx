import { act, renderHook } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authHarness = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  resolveInitialSession: null as null | ((result: { data: { session: unknown } }) => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        authHarness.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => new Promise((resolve) => {
        authHarness.resolveInitialSession = resolve as (result: { data: { session: unknown } }) => void;
      }),
    },
  },
}));

import { useAuth } from "@/hooks/useAuth";

const sessionFor = (id: string) => ({ user: { id, email: `${id}@example.test` } }) as unknown as Session;

describe("useAuth startup session race", () => {
  beforeEach(() => {
    authHarness.listener = null;
    authHarness.resolveInitialSession = null;
  });

  it("keeps a newer account change when the initial session snapshot resolves late", async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);

    act(() => authHarness.listener?.("SIGNED_IN", sessionFor("current-user")));
    expect(result.current.user?.id).toBe("current-user");
    expect(result.current.loading).toBe(false);

    await act(async () => {
      authHarness.resolveInitialSession?.({ data: { session: sessionFor("stale-user") } });
    });
    expect(result.current.user?.id).toBe("current-user");
  });

  it("does not restore a signed-out user from a delayed initial session", async () => {
    const { result } = renderHook(() => useAuth());
    act(() => authHarness.listener?.("SIGNED_OUT", null));
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);

    await act(async () => {
      authHarness.resolveInitialSession?.({ data: { session: sessionFor("signed-out-user") } });
    });
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });
});
