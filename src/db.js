import { MongoClient, ObjectId } from "mongodb";

let client;
let ready;

async function connect() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  client ??= new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME || "fixmate");
  await Promise.all([
    db.collection("services").createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 }),
    db.collection("services").createIndex({ technicianEmail: 1 }),
    db.collection("bookings").createIndex({ customerEmail: 1, serviceId: 1, status: 1 }),
    db.collection("bookings").createIndex({ technicianEmail: 1 }),
    // A Stripe session and a booking can each produce at most one payment record.
    db.collection("payments").createIndex({ stripeSessionId: 1 }, { unique: true }),
    db.collection("payments").createIndex({ bookingId: 1 }, { unique: true }),
  ]);
  return db;
}

/** Shared, lazily connected handles to the four FixMate collections. */
export async function collections() {
  ready ??= connect().catch((err) => {
    ready = undefined; // allow a retry on the next request
    throw err;
  });
  const db = await ready;
  return {
    users: db.collection("user"), // BetterAuth's user collection
    services: db.collection("services"),
    bookings: db.collection("bookings"),
    payments: db.collection("payments"),
  };
}

/** Returns an ObjectId, or null when the string is not a valid id. */
export function toObjectId(id) {
  return typeof id === "string" && ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null;
}

export async function closeDb() {
  await client?.close();
  client = undefined;
  ready = undefined;
}
