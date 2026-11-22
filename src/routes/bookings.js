import { Router } from "express";
import { collections, toObjectId } from "../db.js";
import { verifyToken, verifyCustomer, verifyTechnician } from "../middlewares/auth.js";
import { ACTIVE_STATUSES, BOOKING_STATUSES, TECHNICIAN_TRANSITIONS } from "../lib/constants.js";
import { HttpError, isNonEmptyString, queryString } from "../lib/http.js";

const router = Router();

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RX = /^\+?[\d\s-]{7,20}$/;

/** "YYYY-MM-DD" for a date offset from today (UTC). */
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

// POST /api/bookings — a customer sends a repair request for an approved service.
router.post("/", verifyToken, verifyCustomer, async (req, res) => {
  const { serviceId, customerPhone, address, preferredDate, problemDescription } = req.body || {};

  const errors = [];
  if (!PHONE_RX.test(customerPhone?.toString().trim() || "")) errors.push("Enter a valid phone number");
  if (!isNonEmptyString(address, 5, 300)) errors.push("Address must be at least 5 characters");
  // One day of slack so customers ahead of UTC (e.g. Dhaka, UTC+6) can still pick their "today".
  if (!DATE_RX.test(preferredDate || "") || preferredDate < isoDay(-1)) errors.push("Preferred date must be today or later");
  if (!isNonEmptyString(problemDescription, 20, 2000)) errors.push("Problem description must be at least 20 characters");
  if (errors.length) throw new HttpError(400, errors.join(". "));

  const _id = toObjectId(serviceId);
  const { services, bookings } = await collections();
  const service = _id && (await services.findOne({ _id, approvalStatus: "approved", isAvailable: true }));
  if (!service) throw new HttpError(404, "This service is not available for requests");
  if (service.technicianEmail === req.user.email) throw new HttpError(403, "You cannot request your own service");

  const active = await bookings.findOne({
    serviceId: service._id.toString(),
    customerEmail: req.user.email,
    status: { $in: ACTIVE_STATUSES },
  });
  if (active) throw new HttpError(409, "You already have an active request for this service");

  const now = new Date();
  const doc = {
    serviceId: service._id.toString(),
    serviceTitle: service.title,
    serviceImage: service.image,
    category: service.category,
    basePrice: service.basePrice,
    technicianName: service.technicianName,
    technicianEmail: service.technicianEmail,
    customerName: req.user.name,
    customerEmail: req.user.email,
    customerPhone: customerPhone.toString().trim(),
    address: address.trim(),
    preferredDate: new Date(`${preferredDate}T00:00:00.000Z`),
    problemDescription: problemDescription.trim(),
    status: "requested",
    finalAmount: service.basePrice,
    paymentStatus: "unpaid",
    statusHistory: [{ status: "requested", changedAt: now }],
    createdAt: now,
  };
  const { insertedId } = await bookings.insertOne(doc);
  res.status(201).json({ ...doc, _id: insertedId });
});

// GET /api/bookings/my — the logged-in customer's own bookings (email comes from the token, never the URL).
router.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  const { bookings } = await collections();
  res.json(await bookings.find({ customerEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
});

// GET /api/bookings/technician — jobs assigned to the logged-in technician, optional ?status= filter.
router.get("/technician", verifyToken, verifyTechnician, async (req, res) => {
  const status = queryString(req.query.status);
  const filter = { technicianEmail: req.user.email };
  if (BOOKING_STATUSES.includes(status)) filter.status = status;
  const { bookings } = await collections();
  res.json(await bookings.find(filter).sort({ createdAt: -1 }).toArray());
});

// PATCH /api/bookings/:id/cancel — the owner cancels while the job is still "requested".
router.patch("/:id/cancel", verifyToken, verifyCustomer, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(404, "Booking not found");
  const { bookings } = await collections();
  const booking = await bookings.findOne({ _id });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.customerEmail !== req.user.email) throw new HttpError(403, "Forbidden: this is not your booking");
  if (booking.status !== "requested") throw new HttpError(409, `A ${booking.status} booking can no longer be cancelled`);

  const updated = await bookings.findOneAndUpdate(
    { _id, status: "requested" }, // guards against a technician accepting at the same moment
    { $set: { status: "cancelled" }, $push: { statusHistory: { status: "cancelled", changedAt: new Date() } } },
    { returnDocument: "after" },
  );
  if (!updated) throw new HttpError(409, "The booking status changed, please refresh");
  res.json(updated);
});

// PATCH /api/bookings/:id/status — the owning technician moves the job one step along the pipeline.
router.patch("/:id/status", verifyToken, verifyTechnician, async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(404, "Booking not found");
  const { status, finalAmount } = req.body || {};
  const { bookings } = await collections();
  const booking = await bookings.findOne({ _id });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.technicianEmail !== req.user.email) throw new HttpError(403, "Forbidden: this job is not assigned to you");
  if (!TECHNICIAN_TRANSITIONS[booking.status]?.includes(status)) {
    throw new HttpError(400, `Invalid status change: ${booking.status} → ${status}`);
  }

  const set = { status };
  if (status === "completed") {
    const amount = Number(finalAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "finalAmount must be a number greater than 0");
    set.finalAmount = Math.round(amount * 100) / 100;
  }

  const updated = await bookings.findOneAndUpdate(
    { _id, status: booking.status }, // only applies if nobody changed it in the meantime
    { $set: set, $push: { statusHistory: { status, changedAt: new Date() } } },
    { returnDocument: "after" },
  );
  if (!updated) throw new HttpError(409, "The booking status changed, please refresh");
  res.json(updated);
});

export default router;
