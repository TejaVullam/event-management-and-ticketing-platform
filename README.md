# Evently � Event Booking MVP

JavaScript monorepo for event discovery, authenticated booking, capacity-aware waitlists, QR tickets, RBAC, realtime Socket.IO notifications, analytics, and Docker deployment.

## Run locally
1. `npm install`
2. Copy `server/.env.example` to `server/.env`.
3. Start MongoDB and Redis (or `docker compose up mongo redis -d`).
4. `npm run dev` (API :4000, Vite :5173).
5. `npm --workspace server run seed` creates the configured admin.

Register normally as a user. Organizer/admin accounts can create events with `POST /api/events`.

## API highlights
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/events?page=1&limit=20&search=music&status=published` (Redis cached for 60 seconds)
- `POST/PATCH/DELETE /api/events` (organizer/admin)
- `POST /api/events/:id/book`, `POST /api/events/:eventId/waitlist` (automatic promotion on cancellation)
- `GET /api/bookings`, `GET /api/bookings/:id/ticket`, `GET /api/bookings/:id/qr`, cancellation
- `POST /api/tickets/validate` with `ticketCode` (organizer event ownership is enforced)
- `GET /api/analytics` (organizer/admin)

## Docker
`docker compose up --build` starts MongoDB, Redis, API, separate email/reminder worker, and Nginx-hosted web app. Internal Docker URLs use `mongo`, `redis`, and `api`; browser requests use the `/api` reverse proxy.
