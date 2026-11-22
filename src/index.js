import "dotenv/config";
import express from "express";
import cors from "cors";
import servicesRouter from "./routes/services.js";
import bookingsRouter from "./routes/bookings.js";
import paymentsRouter, { webhookHandler } from "./routes/payments.js";
import adminRouter from "./routes/admin.js";
import usersRouter from "./routes/users.js";

const app = express();

const allowedOrigins = ["http://localhost:3000", ...(process.env.CLIENT_URL || "").split(",")]
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Stripe needs the raw body to verify the signature, so the webhook is registered before express.json().
app.post("/api/payments/webhook", ...webhookHandler);
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => res.json({ name: "FixMate API", status: "ok" }));
app.use("/api/services", servicesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/users", usersRouter);

app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 ? "Internal server error" : err.message });
});

if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`FixMate API listening on http://localhost:${port}`));
}

export default app;
