import jwt from "jsonwebtoken";
import { collections } from "../db.js";

/**
 * Verifies the Bearer JWT minted by the Next.js app for a BetterAuth session,
 * then loads the user from the database so the role is always current
 * (an admin's role change takes effect on the very next request).
 */
export async function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized: token missing" });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Unauthorized: invalid or expired token" });
  }

  const { users } = await collections();
  const user = await users.findOne({ email: payload.email });
  if (!user) return res.status(401).json({ message: "Unauthorized: user not found" });

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image || "",
    role: user.role || "customer",
  };
  next();
}

const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : res.status(403).json({ message: `Forbidden: ${role} access only` });

export const verifyCustomer = requireRole("customer");
export const verifyTechnician = requireRole("technician");
export const verifyAdmin = requireRole("admin");
