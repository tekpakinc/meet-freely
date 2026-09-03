import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@22.4.0";
import { adminClient } from "../_shared/billing.ts";

const entitledStatuses = new Set(["active", "trialing", "past_due"]);

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = request.headers.get("stripe-signature");
  if (!secret || !webhookSecret || !signature) return new Response("Webhook is not configured", { status: 503 });

  const stripe = new Stripe(secret, { apiVersion: "2026-07-29.dahlia" });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = adminClient();
  const { error: ledgerError } = await admin.from("stripe_events").insert({ event_id: event.id, event_type: event.type });
  if (ledgerError?.code === "23505") return new Response("Already processed", { status: 200 });
  if (ledgerError) return new Response("Could not record event", { status: 500 });

  try {
    if (event.type.startsWith("customer.subscription.")) {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.supabase_user_id;
      const update = {
        stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
        stripe_subscription_id: subscription.id,
        membership_status: subscription.status,
        membership_active: entitledStatuses.has(subscription.status),
        membership_current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
      };
      const query = admin.from("accounts").update(update);
      const { error } = userId ? await query.eq("user_id", userId) : await query.eq("stripe_customer_id", update.stripe_customer_id);
      if (error) throw error;
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
      if (userId) { const { error } = await admin.from("accounts").update({
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        membership_status: session.payment_status === "paid" ? "active" : "incomplete",
        membership_active: session.payment_status === "paid",
      }).eq("user_id", userId); if (error) throw error; }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) { const { error } = await admin.from("accounts").update({ membership_status: "past_due" }).eq("stripe_customer_id", customerId); if (error) throw error; }
    }
    return new Response("ok", { status: 200 });
  } catch {
    await admin.from("stripe_events").delete().eq("event_id", event.id);
    return new Response("Event processing failed", { status: 500 });
  }
});
