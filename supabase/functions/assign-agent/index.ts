import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller and require admin
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, service);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const { email } = await req.json();
    if (!email || typeof email !== "string") return json({ error: "email required" }, 400);

    // Find target user
    const target = await findUserByEmail(admin, email.toLowerCase());
    if (!target) return json({ error: "No signed-up user found with that email. Ask them to create an account first." }, 404);

    const { error: insertErr } = await admin
      .from("user_roles")
      .insert({ user_id: target.id, role: "agent" });
    if (insertErr && !insertErr.message.includes("duplicate")) return json({ error: insertErr.message }, 400);

    return json({ ok: true, user_id: target.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  // Paginate through users (up to a few pages)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const found = data.users.find((u: { email?: string }) => (u.email ?? "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
