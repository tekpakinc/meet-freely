import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = origin === "https://meetfreely.app" || origin.endsWith(".chatgpt.site") ? origin : "https://meetfreely.app";
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Vary": "Origin" };
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return new Response(JSON.stringify({ error: "Sign in again before deleting your account." }), { status: 401, headers });
  const body = await request.json().catch(() => ({}));
  if (body.confirmation !== "DELETE") return new Response(JSON.stringify({ error: "Deletion was not confirmed." }), { status: 400, headers });

  const url = Deno.env.get("SUPABASE_URL")!;
  const publishable = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const memberClient = createClient(url, publishable, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await memberClient.auth.getUser();
  if (userError || !user) return new Response(JSON.stringify({ error: "Your session could not be verified." }), { status: 401, headers });

  const adminClient = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: account } = await adminClient.from("accounts").select("membership_active,membership_status").eq("user_id", user.id).maybeSingle();
  const liveBillingStates = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
  if (account?.membership_active || liveBillingStates.has(account?.membership_status ?? "inactive")) {
    return new Response(JSON.stringify({ error: "Cancel membership first, then return after paid access has ended to permanently delete your account." }), { status: 409, headers });
  }
  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) return new Response(JSON.stringify({ error: "Account deletion could not be completed." }), { status: 500, headers });
  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers });
});
