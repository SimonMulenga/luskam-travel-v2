import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      authEventReceived = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    void supabase.auth.getSession().then(({ data }) => {
      // An auth event is newer than the startup snapshot. Never let a delayed
      // getSession response restore an account that has already signed out or changed.
      if (!active || authEventReceived) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!active || authEventReceived) return;
      setSession(null);
      setUser(null);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading, signOut: () => supabase.auth.signOut() };
};
