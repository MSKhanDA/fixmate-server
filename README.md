# FixMate — API Server

REST API for **FixMate**, a smart device & home appliance repair service platform. Built with Express 5, MongoDB and Stripe. Authentication lives in the Next.js client (BetterAuth); this server verifies the short-lived JWT the client issues and enforces every role, ownership and job-status rule.

- **Live API:** https://fixmate-server-dusky.vercel.app
- **Live site:** https://fixmate-client-rho-coral.vercel.app
- **Client repository:** https://github.com/MSKhanDA/fixmate-client

## Test accounts

| Role       | Email                     | Password       |
| ---------- | ------------------------- | -------------- |
| Admin      | `admin@fixmate.com`       | `Admin@123`    |
| Technician | `rafiq.tech@fixmate.com`  | `Tech@1234`    |
| Customer   | `customer@fixmate.com`    | `Customer@123` |

## Key features

- **JWT verification & role middlewares** — `verifyToken` (401 when missing/invalid), `verifyCustomer`, `verifyTechnician`, `verifyAdmin` (403 for the wrong role). The role is read fresh from the database on every request, and every "my data" endpoint takes the email from the token, never from the URL.
- **Server-enforced job pipeline** — only the technician who owns a job can move it, and only one step at a time: `requested → accepted | rejected`, `accepted → in-progress`, `in-progress → completed` (requires `finalAmount > 0`). Customers may cancel only while `requested`. Updates are conditional on the current status, so concurrent changes cannot skip a step.
- **Payment gate** — Checkout is created only for the logged-in customer's own `completed` + `unpaid` booking, with the amount loaded from the database.
- **Idempotent payments** — the success-page verification and the Stripe webhook share one `recordPayment` function; unique indexes on `stripeSessionId` and `bookingId` guarantee a payment is stored once.
- **Server-side search, filter, sort & pagination** for public services (`search`, `category`, `mode`, `sort`, `page`, `limit`) using MongoDB queries with escaped regex input.
- **Business rules** — no duplicate active request for the same service, technicians/admins cannot request repairs, edited services return to `pending`, only approved + available services are public, admins cannot change their own role.
- **Seed script** with connected demo data: admin, 3 technicians, 2 customers, 18 services (15 approved), bookings in every status and payments spread over six months.

## API

| Method & path                                     | Access                       |
| ------------------------------------------------- | ---------------------------- |
| `GET /api/services` (search/filter/sort/paginate) | Public                       |
| `GET /api/services/:id`                           | Public                       |
| `GET /api/services/mine`                          | verifyToken, verifyTechnician |
| `POST /api/services`                              | verifyToken, verifyTechnician |
| `PATCH /api/services/:id`                         | verifyToken, verifyTechnician |
| `PATCH /api/services/:id/availability`            | verifyToken, verifyTechnician |
| `DELETE /api/services/:id`                        | verifyToken, verifyTechnician |
| `POST /api/bookings`                              | verifyToken, verifyCustomer   |
| `GET /api/bookings/my`                            | verifyToken, verifyCustomer   |
| `PATCH /api/bookings/:id/cancel`                  | verifyToken, verifyCustomer   |
| `GET /api/bookings/technician`                    | verifyToken, verifyTechnician |
| `PATCH /api/bookings/:id/status`                  | verifyToken, verifyTechnician |
| `POST /api/payments/create-checkout-session`      | verifyToken, verifyCustomer   |
| `GET /api/payments/verify?session_id=`            | verifyToken, verifyCustomer   |
| `GET /api/payments/my`                            | verifyToken, verifyCustomer   |
| `POST /api/payments/webhook`                      | Stripe signature              |
| `GET /api/admin/stats`                            | verifyToken, verifyAdmin      |
| `GET /api/admin/users`                            | verifyToken, verifyAdmin      |
| `PATCH /api/admin/users/:id/role`                 | verifyToken, verifyAdmin      |
| `GET /api/admin/services`                         | verifyToken, verifyAdmin      |
| `PATCH /api/admin/services/:id/approval`          | verifyToken, verifyAdmin      |
| `GET /api/admin/bookings`                         | verifyToken, verifyAdmin      |
| `GET /api/admin/payments`                         | verifyToken, verifyAdmin      |
| `GET /api/users/me`, `PATCH /api/users/profile`   | verifyToken                   |

## Collections

`user` (BetterAuth's users collection with `role`, `phone`, `area`, `bio`), `services`, `bookings`, `payments`. BetterAuth also creates `session`, `account` and `verification`.

## npm packages

`express`, `cors`, `mongodb`, `jsonwebtoken`, `stripe`, `dotenv`

## Run locally

```bash
cp .env.example .env   # fill in the values
npm install
npm run dev            # http://localhost:5000
npm run seed           # needs the client running at SEED_AUTH_URL (users are created through BetterAuth)
```

| Variable                | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `MONGODB_URI`, `DB_NAME`| Same database as the client                                         |
| `JWT_SECRET`            | **Must equal** the client's `JWT_SECRET`                            |
| `CLIENT_URL`            | Comma-separated allowed origins; the first is used for Stripe redirects |
| `STRIPE_SECRET_KEY`     | Stripe test secret key                                              |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint                              |
| `SEED_AUTH_URL`         | Client URL used by the seed script                                  |

## Deploying (Vercel)

1. Import the repo in Vercel (it uses `vercel.json`) and add the variables above, with `CLIENT_URL` set to the production client URL.
2. In the Stripe Dashboard (test mode) add a webhook endpoint `https://fixmate-server-dusky.vercel.app/api/payments/webhook` for `checkout.session.completed`, then put its signing secret in `STRIPE_WEBHOOK_SECRET` and redeploy.
