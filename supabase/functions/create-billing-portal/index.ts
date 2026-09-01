import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, corsHeaders, signedInMember, siteUrl, stripeRequest } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  try {
    const user = await signedInMember(request);
    if (!user) return new Response(JSON.stringify({ error: "Please sign in again." }), { status: 401, headers });
    const { data: account } = await adminClient().from("accounts").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!account?.stripe_customer_id) return new Response(JSON.stringify({ error: "No billing account was found." }), { status: 404, headers });
    const session = await stripeRequest("billing_portal/sessions", new URLSearchParams({ customer: account.stripe_customer_id, return_url: `${siteUrl}/?billing=returned` }));
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Billing could not be opened." }), { status: 500, headers });
  }
});

