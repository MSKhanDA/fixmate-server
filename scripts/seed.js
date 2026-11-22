/**
 * Seeds FixMate with demo users, services, bookings and payments.
 *
 * Users are created through BetterAuth's real sign-up endpoint (so passwords are hashed
 * exactly as BetterAuth expects), which means the Next.js client must be running at
 * SEED_AUTH_URL. Roles and profile fields are then set directly in the database.
 *
 *   npm run seed            # users (kept if they exist) + fresh services/bookings/payments
 */
import "dotenv/config";
import { collections, closeDb } from "../src/db.js";

const AUTH_URL = (process.env.SEED_AUTH_URL || process.env.CLIENT_URL?.split(",")[0] || "http://localhost:3000").replace(/\/$/, "");
const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=75`;
const daysAgo = (n, hour = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};
const dayOnly = (n) => new Date(daysAgo(n).toISOString().slice(0, 10) + "T00:00:00.000Z");

const USERS = [
  { name: "Sadia Karim", email: "admin@fixmate.com", password: "Admin@123", role: "admin", phone: "+880 1711-000001", area: "Gulshan, Dhaka", bio: "Platform admin at FixMate." },
  { name: "Rafiq Hasan", email: "rafiq.tech@fixmate.com", password: "Tech@1234", role: "technician", phone: "+880 1711-200100", area: "Mirpur, Dhaka", bio: "Mobile and laptop repair specialist with 8 years of bench experience. Apple and Samsung certified parts, 90-day warranty on every screen." },
  { name: "Nusrat Jahan", email: "nusrat.tech@fixmate.com", password: "Tech@1234", role: "technician", phone: "+880 1711-300200", area: "Dhanmondi, Dhaka", bio: "HVAC and home appliance technician. I service split ACs, refrigerators and washing machines across Dhanmondi, Lalmatia and Mohammadpur." },
  { name: "Tanvir Ahmed", email: "tanvir.tech@fixmate.com", password: "Tech@1234", role: "technician", phone: "+880 1711-400300", area: "Uttara, Dhaka", bio: "Licensed electrician and TV repair technician. House wiring, DB boards, LED/LCD panel and power-board repairs." },
  { name: "Ayesha Rahman", email: "customer@fixmate.com", password: "Customer@123", role: "customer", phone: "+880 1811-555666", area: "Mohammadpur, Dhaka", bio: "" },
  { name: "Imran Kabir", email: "imran@fixmate.com", password: "Customer@123", role: "customer", phone: "+880 1911-777888", area: "Banani, Dhaka", bio: "" },
];

const TECH = Object.fromEntries(USERS.filter((u) => u.role === "technician").map((u) => [u.email.split(".")[0], u]));

const SERVICES = [
  // Rafiq — phones & laptops
  { key: "iphone", tech: "rafiq", title: "iPhone Screen Replacement", category: "Smartphone", basePrice: 79, estimatedDuration: "1-2 hours", serviceMode: "Shop Drop-off", image: img("1639776738932-956082f0b704"), description: "Cracked or unresponsive iPhone display replaced with a high-quality OLED/LCD panel. Includes True Tone transfer, waterproof seal and a 90-day warranty on the screen." },
  { key: "android", tech: "rafiq", title: "Android Battery & Charging Port Repair", category: "Smartphone", basePrice: 35, estimatedDuration: "1 hour", serviceMode: "Shop Drop-off", image: img("1550041473-d296a3a8a18a"), description: "Fast-draining battery or loose charging port? I replace batteries and USB-C/micro-USB ports for Samsung, Xiaomi, Realme, Oppo and Vivo phones, with a full diagnostic." },
  { key: "phone-water", tech: "rafiq", title: "Water Damage Recovery for Phones", category: "Smartphone", basePrice: 45, estimatedDuration: "1-2 days", serviceMode: "Shop Drop-off", image: img("1746005514011-ea00280f3b6e"), description: "Ultrasonic board cleaning, corrosion removal and component-level repair for phones that got wet. Data recovery attempted first, before any part is replaced." },
  { key: "laptop-service", tech: "rafiq", title: "Laptop Servicing & Thermal Paste", category: "Laptop & PC", basePrice: 30, estimatedDuration: "2-3 hours", serviceMode: "Home Visit", image: img("1721332154191-ba5f1534266e"), description: "Overheating or loud fan? Full internal dust cleaning, fresh thermal paste, fan lubrication and a temperature stress test, done at your home." },
  { key: "laptop-screen", tech: "rafiq", title: "Laptop Screen & Keyboard Replacement", category: "Laptop & PC", basePrice: 65, estimatedDuration: "1 day", serviceMode: "Shop Drop-off", image: img("1721333089073-215a56fd710c"), description: "Broken hinge, dead pixels or missing keys. Genuine-grade replacement panels and keyboards for HP, Dell, Lenovo, Asus and MacBook models." },
  // Nusrat — AC, fridge, washer
  { key: "ac-service", tech: "nusrat", title: "Split AC Servicing & Deep Cleaning", category: "AC", basePrice: 25, estimatedDuration: "1-2 hours", serviceMode: "Home Visit", image: img("1770838773417-08b18661c62f"), description: "Jet-wash of indoor and outdoor units, filter and coil cleaning, drain line flush and cooling performance check. Recommended every 6 months." },
  { key: "ac-gas", tech: "nusrat", title: "AC Gas Refill & Leak Repair", category: "AC", basePrice: 55, estimatedDuration: "2-3 hours", serviceMode: "Home Visit", image: img("1776860150250-757406c52438"), description: "Not cooling enough? I find and seal refrigerant leaks, vacuum the system and recharge R32/R410A gas to the correct pressure." },
  { key: "fridge", tech: "nusrat", title: "Refrigerator Not Cooling Repair", category: "Refrigerator", basePrice: 40, estimatedDuration: "2-4 hours", serviceMode: "Home Visit", image: img("1721613877687-c9099b698faa"), description: "Diagnosis and repair of compressor, thermostat, defrost and fan problems for single and double-door refrigerators of all major brands." },
  { key: "fridge-gas", tech: "nusrat", title: "Refrigerator Gas Charge & Compressor Check", category: "Refrigerator", basePrice: 50, estimatedDuration: "3-4 hours", serviceMode: "Home Visit", image: img("1484154218962-a197022b5858"), description: "Refrigerant recharge with leak test, compressor relay and overload check, and door gasket inspection to keep your fridge efficient." },
  { key: "washer", tech: "nusrat", title: "Washing Machine Drum & Motor Repair", category: "Washing Machine", basePrice: 45, estimatedDuration: "2-3 hours", serviceMode: "Home Visit", image: img("1626806819282-2c1dc01a5e0c"), description: "Front and top-load machines: noisy drum, bearing replacement, motor and belt repair, drain pump and inlet valve fixes." },
  // Tanvir — TV, electrical
  { key: "tv-panel", tech: "tanvir", title: "LED TV Backlight & Panel Repair", category: "TV", basePrice: 60, estimatedDuration: "1 day", serviceMode: "Shop Drop-off", image: img("1567690187548-f07b1d7bf5a9"), description: "Sound but no picture? Dim or flickering screen? Backlight strip replacement and T-con/panel diagnosis for 32\" to 65\" LED TVs." },
  { key: "tv-power", tech: "tanvir", title: "TV Power Board & No-Power Fix", category: "TV", basePrice: 35, estimatedDuration: "3-5 hours", serviceMode: "Home Visit", image: img("1646861039459-fd9e3aabf3fb"), description: "TV not turning on or clicking? Component-level power supply board repair or replacement, done at your place for most models." },
  { key: "wiring", tech: "tanvir", title: "House Wiring & DB Board Installation", category: "Electrical", basePrice: 90, estimatedDuration: "1 day", serviceMode: "Home Visit", image: img("1682345262055-8f95f3c513ea"), description: "New or replacement wiring, distribution board with MCBs and RCCB, earthing check and a full safety report. Licensed electrician." },
  { key: "fan-light", tech: "tanvir", title: "Ceiling Fan, Light & Switch Installation", category: "Electrical", basePrice: 15, estimatedDuration: "1-2 hours", serviceMode: "Home Visit", image: img("1758101755915-462eddc23f57"), description: "Install or replace ceiling fans, LED lights, switches, sockets and regulators. Includes testing and safe cable management." },
  { key: "washer-tanvir", tech: "tanvir", title: "Washing Machine PCB & Error Code Repair", category: "Washing Machine", basePrice: 50, estimatedDuration: "3-4 hours", serviceMode: "Home Visit", image: img("1622473590925-e3616c0a41bf"), description: "Error codes, dead control panel or a program that stops mid-wash. Control board diagnosis and repair for LG, Samsung, Whirlpool and Walton machines." },
  // Not public yet
  { key: "gaming-pc", tech: "tanvir", title: "Gaming PC Build & Upgrade", category: "Laptop & PC", basePrice: 40, estimatedDuration: "4-6 hours", serviceMode: "Shop Drop-off", image: img("1658240527554-9cf987b4de49"), approvalStatus: "pending", description: "Custom gaming PC assembly or upgrade: GPU, RAM, SSD and cooling installation, cable management, BIOS update and stress testing." },
  { key: "ac-install", tech: "nusrat", title: "New AC Installation (1-2 Ton)", category: "AC", basePrice: 70, estimatedDuration: "3-4 hours", serviceMode: "Home Visit", image: img("1667983453881-4992fe86ab1b"), approvalStatus: "pending", description: "Professional split AC installation with copper piping up to 10 feet, wall bracket, vacuuming and test run." },
  { key: "phone-unlock", tech: "rafiq", title: "Phone Software Flash", category: "Smartphone", basePrice: 10, estimatedDuration: "30 minutes", serviceMode: "Shop Drop-off", image: img("1566728595333-75a1d7cae961"), approvalStatus: "rejected", description: "Software flashing for phones stuck on the boot logo. Rejected for now: please add which models are supported." },
];

// [customer, service, status, paid?, daysAgo created, finalAmount?, problem]
const BOOKINGS = [
  ["customer", "iphone", "completed", true, 120, 85, "The screen cracked after a fall and the touch stopped working in the top half."],
  ["customer", "ac-service", "completed", true, 95, 25, "AC is blowing warm air and dripping water from the indoor unit."],
  ["imran", "laptop-service", "completed", true, 70, 30, "Laptop gets very hot and the fan is loud even when idle."],
  ["imran", "wiring", "completed", true, 50, 110, "Need new wiring for two rooms and a proper DB board with breakers."],
  ["customer", "fridge", "completed", true, 28, 48, "Fridge section is not cooling although the freezer is working fine."],
  ["imran", "tv-panel", "completed", true, 12, 72, "TV has sound but the screen stays black, sometimes it flickers."],
  ["customer", "washer", "completed", false, 6, 55, "Drum makes a loud banging noise during spin and the machine shakes."],
  ["imran", "android", "completed", false, 4, 35, "Phone only charges when the cable is held at an angle."],
  ["customer", "tv-power", "in-progress", false, 3, null, "TV does not turn on at all, red standby light blinks three times."],
  ["imran", "ac-gas", "accepted", false, 2, null, "AC runs but the room never cools below 28 degrees."],
  ["customer", "laptop-screen", "requested", false, 1, null, "Half of the laptop keyboard stopped working after a small spill."],
  ["imran", "fan-light", "requested", false, 0, null, "Need two ceiling fans installed and one faulty switch board replaced."],
  ["customer", "phone-water", "rejected", false, 20, null, "Phone fell into a bucket of water and now shows no display."],
  ["imran", "fridge-gas", "cancelled", false, 15, null, "Freezer has frost building up quickly and fridge feels warm."],
];

async function signUp(user) {
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch(`${AUTH_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: AUTH_URL },
      body: JSON.stringify({ name: user.name, email: user.email, password: user.password, role: user.role === "admin" ? "customer" : user.role }),
    });
    if (res.status !== 429) break;
    // BetterAuth rate-limits sign ups; wait as long as it asks.
    const wait = Number(res.headers.get("x-retry-after") || res.headers.get("retry-after") || 10);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
  }
  if (res.ok) return "created";
  const body = await res.json().catch(() => ({}));
  if (res.status === 422 || /exist/i.test(body.message || body.code || "")) return "exists";
  throw new Error(`Sign up failed for ${user.email}: ${res.status} ${body.message || ""}`);
}

async function main() {
  console.log(`Seeding FixMate (auth server: ${AUTH_URL})`);
  const { users, services, bookings, payments } = await collections();

  for (const u of USERS) {
    const result = await signUp(u);
    await users.updateOne({ email: u.email }, { $set: { name: u.name, role: u.role, phone: u.phone, area: u.area, bio: u.bio } });
    console.log(`  user ${u.email.padEnd(26)} ${u.role.padEnd(10)} ${result}`);
  }

  await Promise.all([services.deleteMany({}), bookings.deleteMany({}), payments.deleteMany({})]);

  const serviceIds = {};
  const serviceDocs = SERVICES.map((s, i) => {
    const tech = TECH[s.tech];
    const doc = {
      title: s.title,
      category: s.category,
      description: s.description,
      image: s.image,
      basePrice: s.basePrice,
      estimatedDuration: s.estimatedDuration,
      serviceMode: s.serviceMode,
      serviceArea: tech.area,
      technicianName: tech.name,
      technicianEmail: tech.email,
      approvalStatus: s.approvalStatus || "approved",
      isAvailable: true,
      createdAt: daysAgo(150 - i * 8),
    };
    return [s.key, doc];
  });
  const inserted = await services.insertMany(serviceDocs.map(([, d]) => d));
  serviceDocs.forEach(([key, doc], i) => (serviceIds[key] = { ...doc, _id: inserted.insertedIds[i] }));
  console.log(`  ${serviceDocs.length} services (${serviceDocs.filter(([, d]) => d.approvalStatus === "approved").length} approved)`);

  const customers = Object.fromEntries(USERS.filter((u) => u.role === "customer").map((u) => [u.email.split(/[.@]/)[0], u]));
  const pipeline = { requested: [], accepted: ["accepted"], "in-progress": ["accepted", "in-progress"], completed: ["accepted", "in-progress", "completed"], rejected: ["rejected"], cancelled: ["cancelled"] };

  let paymentCount = 0;
  for (const [i, [who, key, status, paid, ago, finalAmount, problem]] of BOOKINGS.entries()) {
    const c = customers[who];
    const s = serviceIds[key];
    const created = daysAgo(ago, 9);
    const steps = pipeline[status];
    const history = [{ status: "requested", changedAt: created }, ...steps.map((st, n) => ({ status: st, changedAt: new Date(created.getTime() + (n + 1) * 3 * 3600_000) }))];
    const amount = finalAmount ?? s.basePrice;
    const paidAt = new Date(created.getTime() + (steps.length + 1) * 3 * 3600_000);
    if (paid) history.push({ status: "paid", changedAt: paidAt });

    const { insertedId } = await bookings.insertOne({
      serviceId: s._id.toString(),
      serviceTitle: s.title,
      serviceImage: s.image,
      category: s.category,
      basePrice: s.basePrice,
      technicianName: s.technicianName,
      technicianEmail: s.technicianEmail,
      customerName: c.name,
      customerEmail: c.email,
      customerPhone: c.phone,
      address: c.email === "customer@fixmate.com" ? "House 21, Road 4, Block C, Mohammadpur, Dhaka" : "Flat 6B, House 9, Road 11, Banani, Dhaka",
      preferredDate: dayOnly(ago - 1),
      problemDescription: problem,
      status,
      finalAmount: amount,
      paymentStatus: paid ? "paid" : "unpaid",
      statusHistory: history,
      createdAt: created,
    });

    if (paid) {
      paymentCount++;
      await payments.insertOne({
        bookingId: insertedId.toString(),
        serviceTitle: s.title,
        customerName: c.name,
        customerEmail: c.email,
        technicianName: s.technicianName,
        technicianEmail: s.technicianEmail,
        amount,
        currency: "usd",
        transactionId: `pi_seed_${String(i).padStart(3, "0")}${insertedId.toString().slice(-12)}`,
        stripeSessionId: `cs_seed_${insertedId.toString()}`,
        paymentStatus: "paid",
        paidAt,
      });
    }
  }
  console.log(`  ${BOOKINGS.length} bookings, ${paymentCount} payments`);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
