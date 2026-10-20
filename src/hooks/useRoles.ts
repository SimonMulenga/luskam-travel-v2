import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "agent" | "user";

type RoleState = { userId: string | null; roles: AppRole[]; loading: boolean; error: string | null };

export const useRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<RoleState>({ userId: null, roles: [], loading: true, error: null });

  useEffect(() => {
    if (authLoading) {
      setState({ userId, roles: [], loading: true, error: null });
      return;
    }
    if (!userId) {
      setState({ userId: null, roles: [], loading: false, error: null });
      return;
    }

    let active = true;
    const requestedUserId = userId;
    setState({ userId: requestedUserId, roles: [], loading: true, error: null });
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", requestedUserId);
        if (!active) return;
        setState({
          userId: requestedUserId,
          roles: error ? [] : ((data ?? []) as { role: AppRole }[]).map((row) => row.role),
          loading: false,
          error: error?.message ?? null,
        });
      } catch {
        if (!active) return;
        setState({ userId: requestedUserId, roles: [], loading: false, error: "Role access could not be loaded." });
      }
    })();
    return () => { active = false; };
  }, [userId, authLoading]);

  // The user id tag prevents one render of the previous user's privileges
  // from leaking while the next role lookup is waiting for its effect.
  const stateMatchesUser = !authLoading && state.userId === userId;
  const roles = userId && stateMatchesUser ? state.roles : [];
  const loading = authLoading || (!!userId && (!stateMatchesUser || state.loading));

  return {
    roles,
    loading,
    error: stateMatchesUser ? state.error : null,
    isAdmin: roles.includes("admin"),
    isAgent: roles.includes("agent") || roles.includes("admin"),
  };
};
