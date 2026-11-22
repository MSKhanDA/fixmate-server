import { Router } from "express";
import { collections, toObjectId } from "../db.js";
import { verifyToken, verifyAdmin } from "../middlewares/auth.js";
import { APPROVAL_STATUSES, BOOKING_STATUSES, ROLES } from "../lib/constants.js";
import { HttpError, queryString } from "../lib/http.js";

const router = Router();
router.use(verifyToken, verifyAdmin);

// GET /api/admin/stats — overview numbers and chart data.
router.get("/stats", async (req, res) => {
  const { users, services, bookings, payments } = await collections();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5, 1);
  sixMonthsAgo.setUTCHours(0, 0, 0, 0);

  const [totalUsers, totalTechnicians, totalCustomers, pendingServices, approvedServices, totalBookings, paidBookings, revenue, bookingsByStatus, revenueByMonth, servicesByCategory] =
    await Promise.all([
      users.countDocuments(),
      users.countDocuments({ role: "technician" }),
      users.countDocuments({ role: { $in: ["customer", null] } }),
      services.countDocuments({ approvalStatus: "pending" }),
      services.countDocuments({ approvalStatus: "approved" }),
      bookings.countDocuments(),
      bookings.countDocuments({ paymentStatus: "paid" }),
      payments.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
      bookings.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
      payments
        .aggregate([
          { $match: { paidAt: { $gte: sixMonthsAgo } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paidAt" } }, total: { $sum: "$amount" } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      services.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray(),
    ]);

  res.json({
    totalUsers,
    totalTechnicians,
    totalCustomers,
    pendingServices,
    approvedServices,
    totalBookings,
    paidBookings,
    totalRevenue: revenue[0]?.total || 0,
    bookingsByStatus: bookingsByStatus.map((b) => ({ status: b._id, count: b.count })),
    revenueByMonth: revenueByMonth.map((r) => ({ month: r._id, total: r.total })),
    servicesByCategory: servicesByCategory.map((s) => ({ category: s._id, count: s.count })),
  });
});

// GET /api/admin/users
router.get("/users", async (req, res) => {
  const { users } = await collections();
  const items = await users
    .find({}, { projection: { name: 1, email: 1, image: 1, role: 1, phone: 1, area: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(items);
});

// PATCH /api/admin/users/:id/role — change another user's role.
router.patch("/users/:id/role", async (req, res) => {
  const _id = toObjectId(req.params.id);
  const { role } = req.body || {};
  if (!_id) throw new HttpError(404, "User not found");
  if (!ROLES.includes(role)) throw new HttpError(400, "Role must be customer, technician or admin");
  if (_id.toString() === req.user.id) throw new HttpError(400, "You cannot change your own role");

  const { users } = await collections();
  const updated = await users.findOneAndUpdate(
    { _id },
    { $set: { role, updatedAt: new Date() } },
    { returnDocument: "after", projection: { name: 1, email: 1, image: 1, role: 1, createdAt: 1 } },
  );
  if (!updated) throw new HttpError(404, "User not found");
  res.json(updated);
});

// GET /api/admin/services?status= — all services, pending first.
router.get("/services", async (req, res) => {
  const status = queryString(req.query.status);
  const match = APPROVAL_STATUSES.includes(status) ? { approvalStatus: status } : {};
  const { services } = await collections();
  const items = await services
    .aggregate([
      { $match: match },
      { $addFields: { _order: { $indexOfArray: [APPROVAL_STATUSES, "$approvalStatus"] } } },
      { $sort: { _order: 1, createdAt: -1 } },
      { $project: { _order: 0 } },
    ])
    .toArray();
  res.json(items);
});

// PATCH /api/admin/services/:id/approval
router.patch("/services/:id/approval", async (req, res) => {
  const _id = toObjectId(req.params.id);
  const { approvalStatus } = req.body || {};
  if (!_id) throw new HttpError(404, "Service not found");
  if (!["approved", "rejected"].includes(approvalStatus)) throw new HttpError(400, "approvalStatus must be approved or rejected");

  const { services } = await collections();
  const updated = await services.findOneAndUpdate(
    { _id },
    { $set: { approvalStatus, reviewedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new HttpError(404, "Service not found");
  res.json(updated);
});

// GET /api/admin/bookings?status= — read-only list of every booking.
router.get("/bookings", async (req, res) => {
  const status = queryString(req.query.status);
  const filter = BOOKING_STATUSES.includes(status) ? { status } : {};
  const { bookings } = await collections();
  res.json(await bookings.find(filter).sort({ createdAt: -1 }).toArray());
});

// GET /api/admin/payments — every transaction plus total revenue.
router.get("/payments", async (req, res) => {
  const { payments } = await collections();
  const items = await payments.find().sort({ paidAt: -1 }).toArray();
  const totalRevenue = items.reduce((sum, p) => sum + (p.amount || 0), 0);
  res.json({ items, totalRevenue: Math.round(totalRevenue * 100) / 100 });
});

export default router;
