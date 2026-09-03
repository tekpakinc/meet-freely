import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, corsHeaders, signedInMember, siteUrl, stripeRequest } from "../_shared/billing.ts";

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  try {
    const user = await signedInMember(request);
    if (!user) return new Response(JSON.stringify({ error: "Please sign in again." }), { status: 401, headers });
    const admin = adminClient();
    const { data: account } = await admin.from("accounts").select("state,verification,membership_active,stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!account || account.state !== "active" || account.verification !== "verified") {
      return new Response(JSON.stringify({ error: "Adult verification must be approved before membership can begin." }), { status: 403, headers });
    }
    if (account.membership_active) return new Response(JSON.stringify({ error: "Your membership is already active." }), { status: 409, headers });

    let customerId = account.stripe_customer_id as string | null;
    if (!customerId) {
      const customerBody = new URLSearchParams({ email: user.email ?? "", "metadata[supabase_user_id]": user.id, "metadata[app]": "meet_freely" });
      const customer = await stripeRequest("customers", customerBody);
      customerId = customer.id;
      const { error } = await admin.from("accounts").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
      if (error) throw error;
    }

    const priceId = Deno.env.get("STRIPE_PRICE_ID");
    if (!priceId) throw new Error("The Meet Freely membership price is not configured yet.");
    const body = new URLSearchParams({
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: user.id,
      success_url: `${siteUrl}/?membership=success`,
      cancel_url: `${siteUrl}/?membership=canceled`,
      "metadata[supabase_user_id]": user.id,
      "metadata[app]": "meet_freely",
      "subscription_data[metadata][supabase_user_id]": user.id,
      "subscription_data[metadata][app]": "meet_freely",
      integration_identifier: "meetfree_xqrzvnhk",
    });
    const session = await stripeRequest("checkout/sessions", body);
    return new Response(JSON.stringify({ url: session.url }), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout could not be started.";
    console.error("create-checkout-session failed:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});

