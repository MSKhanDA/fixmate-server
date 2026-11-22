import { Router } from "express";
import { collections, toObjectId } from "../db.js";
import { verifyToken, verifyTechnician } from "../middlewares/auth.js";
import { CATEGORIES, SERVICE_MODES } from "../lib/constants.js";
import { HttpError, escapeRegex, queryString, isNonEmptyString, isHttpUrl } from "../lib/http.js";

const router = Router();

const PUBLIC_FILTER = { approvalStatus: "approved", isAvailable: true };
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { basePrice: 1, _id: 1 },
  "price-desc": { basePrice: -1, _id: 1 },
};

/** Validates the editable service fields sent by a technician. */
function parseServiceInput(body = {}) {
  const errors = [];
  const title = body.title?.toString().trim();
  const description = body.description?.toString().trim();
  const estimatedDuration = body.estimatedDuration?.toString().trim();
  const serviceArea = body.serviceArea?.toString().trim();
  const basePrice = Number(body.basePrice);

  if (!isNonEmptyString(title, 3, 100)) errors.push("Title must be 3-100 characters");
  if (!CATEGORIES.includes(body.category)) errors.push("Choose a valid category");
  if (!isNonEmptyString(description, 20, 2000)) errors.push("Description must be at least 20 characters");
  if (!isHttpUrl(body.image)) errors.push("A service image is required");
  if (!Number.isFinite(basePrice) || basePrice <= 0) errors.push("Base price must be a positive number");
  if (!isNonEmptyString(estimatedDuration, 1, 50)) errors.push("Estimated duration is required");
  if (!SERVICE_MODES.includes(body.serviceMode)) errors.push("Choose a valid service mode");
  if (!isNonEmptyString(serviceArea, 2, 100)) errors.push("Service area is required");
  if (errors.length) throw new HttpError(400, errors.join(". "));

  return {
    title,
    category: body.category,
    description,
    image: body.image,
    basePrice: Math.round(basePrice * 100) / 100,
    estimatedDuration,
    serviceMode: body.serviceMode,
    serviceArea,
  };
}

/** Loads a service and ensures the logged-in technician owns it. */
async function findOwnedService(id, email) {
  const _id = toObjectId(id);
  if (!_id) throw new HttpError(404, "Service not found");
  const { services } = await collections();
  const service = await services.findOne({ _id });
  if (!service) throw new HttpError(404, "Service not found");
  if (service.technicianEmail !== email) throw new HttpError(403, "Forbidden: you do not own this service");
  return { services, service, _id };
}

// GET /api/services — public browse with server-side search, filter, sort and pagination.
router.get("/", async (req, res) => {
  const search = queryString(req.query.search);
  const category = queryString(req.query.category);
  const mode = queryString(req.query.mode);
  const sort = SORTS[queryString(req.query.sort)] || SORTS.newest;
  const limit = Math.min(Math.max(parseInt(queryString(req.query.limit)) || 12, 1), 48);
  const page = Math.max(parseInt(queryString(req.query.page)) || 1, 1);

  const filter = { ...PUBLIC_FILTER };
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: rx }, { category: rx }];
  }
  if (CATEGORIES.includes(category)) filter.category = category;
  if (SERVICE_MODES.includes(mode)) filter.serviceMode = mode;

  const { services } = await collections();
  const [items, total] = await Promise.all([
    services.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
    services.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
});

// GET /api/services/mine — every service of the logged-in technician.
router.get("/mine", verifyToken, verifyTechnician, async (req, res) => {
  const { services } = await collections();
  const items = await services.find({ technicianEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
  res.json(items);
});

// GET /api/services/:id — public details of an approved, available service plus its technician.
router.get("/:id", async (req, res) => {
  const _id = toObjectId(req.params.id);
  if (!_id) throw new HttpError(404, "Service not found");
  const { services, users } = await collections();
  const service = await services.findOne({ _id, ...PUBLIC_FILTER });
  if (!service) throw new HttpError(404, "Service not found");
  const tech = await users.findOne(
    { email: service.technicianEmail },
    { projection: { name: 1, image: 1, area: 1, bio: 1, phone: 1 } },
  );
  res.json({
    ...service,
    technician: {
      name: tech?.name || service.technicianName,
      image: tech?.image || "",
      area: tech?.area || service.serviceArea,
      bio: tech?.bio || "",
    },
  });
});

// POST /api/services — technician adds a service; it waits for admin approval.
router.post("/", verifyToken, verifyTechnician, async (req, res) => {
  const data = parseServiceInput(req.body);
  const { services } = await collections();
  const doc = {
    ...data,
    technicianName: req.user.name,
    technicianEmail: req.user.email,
    approvalStatus: "pending",
    isAvailable: true,
    createdAt: new Date(),
  };
  const { insertedId } = await services.insertOne(doc);
  res.status(201).json({ ...doc, _id: insertedId });
});

// PATCH /api/services/:id — owner edits a service; it goes back to pending review.
router.patch("/:id", verifyToken, verifyTechnician, async (req, res) => {
  const { services, _id } = await findOwnedService(req.params.id, req.user.email);
  const data = parseServiceInput(req.body);
  const updated = await services.findOneAndUpdate(
    { _id },
    { $set: { ...data, approvalStatus: "pending", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  res.json(updated);
});

// PATCH /api/services/:id/availability — owner turns a service on or off.
router.patch("/:id/availability", verifyToken, verifyTechnician, async (req, res) => {
  if (typeof req.body?.isAvailable !== "boolean") throw new HttpError(400, "isAvailable must be true or false");
  const { services, _id } = await findOwnedService(req.params.id, req.user.email);
  const updated = await services.findOneAndUpdate(
    { _id },
    { $set: { isAvailable: req.body.isAvailable } },
    { returnDocument: "after" },
  );
  res.json(updated);
});

// DELETE /api/services/:id — owner deletes a service (existing bookings keep their copied data).
router.delete("/:id", verifyToken, verifyTechnician, async (req, res) => {
  const { services, _id } = await findOwnedService(req.params.id, req.user.email);
  await services.deleteOne({ _id });
  res.json({ deleted: true });
});

export default router;
