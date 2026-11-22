import { Router } from "express";
import express from "express";
import Stripe from "stripe";
import { collections, toObjectId } from "../db.js";
import { verifyToken, verifyCustomer } from "../middlewares/auth.js";
import { HttpError, queryString } from "../lib/http.js";

const router = Router();

let stripeClient;
const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(500, "Stripe is not configured");
  return (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY));
};

const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");

/**
 * Saves the payment for a paid Checkout Session and marks its booking paid.
 * Idempotent: the success page and the webhook (and Stripe's retries) may all call it
 * for the same session; unique indexes on stripeSessionId and bookingId make sure only
 * one payment document is ever stored.
 */
async function recordPayment(session) {
  const { bookings, payments } = await collections();
  const bookingId = session.metadata?.bookingId;
  const _id = toObjectId(bookingId);
  const booking = _id && (await bookings.findOne({ _id }));
  if (!booking) throw new HttpError(404, "Booking for this payment was not found");

  const transactionId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const doc = {
    bookingId,
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: session.amount_total / 100,
    currency: session.currency || "usd",
    transactionId: transactionId || session.id,
    stripeSessionId: session.id,
    paymentStatus: "paid",
    paidAt: new Date(),
  };

  try {
    await payments.updateOne({ stripeSessionId: session.id }, { $setOnInsert: doc }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err; // duplicate = already recorded by a concurrent call
  }

  await bookings.updateOne(
    { _id, paymentStatus: "unpaid" },
    { $set: { paymentStatus: "paid" }, $push: { statusHistory: { status: "paid", changedAt: new Date() } } },
  );

  return (await payments.findOne({ stripeSessionId: session.id })) || payments.findOne({ bookingId });
}

// POST /api/payments/create-checkout-session — pay for the customer's own completed, unpaid job.
router.post("/create-checkout-session", verifyToken, verifyCustomer, async (req, res) => {
  const _id = toObjectId(req.body?.bookingId);
  if (!_id) throw new HttpError(404, "Booking not found");
  const { bookings } = await collections();
  const booking = await bookings.findOne({ _id });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.customerEmail !== req.user.email) throw new HttpError(403, "Forbidden: this is not your booking");
  if (booking.status !== "completed") throw new HttpError(400, "Only completed jobs can be paid");
  if (booking.paymentStatus === "paid") throw new HttpError(409, "This job is already paid");

  // The amount always comes from the database, never from the client.
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: booking.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(booking.finalAmount * 100),
          product_data: {
            name: booking.serviceTitle,
            description: `Repair job completed by ${booking.technicianName}`,
            ...(booking.serviceImage ? { images: [booking.serviceImage] } : {}),
          },
        },
      },
    ],
    metadata: { bookingId: booking._id.toString(), customerEmail: booking.customerEmail },
    success_url: `${clientUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl()}/payment/cancel`,
  });

  res.json({ url: session.url });
});

// GET /api/payments/verify?session_id= — called by the success page to confirm and save the payment.
router.get("/verify", verifyToken, verifyCustomer, async (req, res) => {
  const sessionId = queryString(req.query.session_id);
  if (!sessionId.startsWith("cs_")) throw new HttpError(400, "A valid session_id is required");

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
  } catch {
    throw new HttpError(404, "Checkout session not found");
  }
  if (session.metadata?.customerEmail !== req.user.email) throw new HttpError(403, "Forbidden: this payment is not yours");
  if (session.payment_status !== "paid") throw new HttpError(400, "This payment has not been completed");

  res.json(await recordPayment(session));
});

// GET /api/payments/my — the logged-in customer's payment history.
router.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  const { payments } = await collections();
  res.json(await payments.find({ customerEmail: req.user.email }).sort({ paidAt: -1 }).toArray());
});

/** Stripe webhook; mounted with a raw body parser before express.json() so the signature can be checked. */
export const webhookHandler = [
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = stripe().webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).json({ message: `Webhook signature verification failed: ${err.message}` });
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session.payment_status === "paid") await recordPayment(session);
    }
    res.json({ received: true });
  },
];

export default router;
