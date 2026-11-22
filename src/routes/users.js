import { Router } from "express";
import { collections, toObjectId } from "../db.js";
import { verifyToken } from "../middlewares/auth.js";
import { HttpError, isNonEmptyString, isHttpUrl } from "../lib/http.js";

const router = Router();

const PROFILE_PROJECTION = { name: 1, email: 1, image: 1, role: 1, phone: 1, area: 1, bio: 1 };

// GET /api/users/me — the logged-in user's profile.
router.get("/me", verifyToken, async (req, res) => {
  const { users } = await collections();
  res.json(await users.findOne({ _id: toObjectId(req.user.id) }, { projection: PROFILE_PROJECTION }));
});

// PATCH /api/users/profile — any logged-in user updates their own name, phone, area, bio and photo.
// Email and role are never accepted here.
router.patch("/profile", verifyToken, async (req, res) => {
  const { name, phone = "", area = "", bio = "", image = "" } = req.body || {};
  const errors = [];
  if (!isNonEmptyString(name, 2, 60)) errors.push("Name must be 2-60 characters");
  if (typeof phone !== "string" || (phone.trim() && !/^\+?[\d\s-]{7,20}$/.test(phone.trim()))) errors.push("Enter a valid phone number");
  if (typeof area !== "string" || area.length > 100) errors.push("Area must be under 100 characters");
  if (typeof bio !== "string" || bio.length > 500) errors.push("Bio must be under 500 characters");
  if (typeof image !== "string" || (image && !isHttpUrl(image))) errors.push("Invalid photo URL");
  if (errors.length) throw new HttpError(400, errors.join(". "));

  const { users } = await collections();
  const updated = await users.findOneAndUpdate(
    { _id: toObjectId(req.user.id) },
    { $set: { name: name.trim(), phone: phone.trim(), area: area.trim(), bio: bio.trim(), image, updatedAt: new Date() } },
    { returnDocument: "after", projection: PROFILE_PROJECTION },
  );
  res.json(updated);
});

export default router;
