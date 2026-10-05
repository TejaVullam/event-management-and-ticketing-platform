# Evently — Event Booking MVP

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
- `GET /api/events`, `GET /api/events/:id`
- `POST/PATCH/DELETE /api/events` (organizer/admin)
- `POST /api/events/:id/book` (waitlists automatically when capacity is exceeded)
- `GET /api/bookings`, `GET /api/bookings/:id/qr`, cancellation
- `GET /api/analytics` (organizer/admin)

## Docker
`docker compose up --build` starts MongoDB, Redis, API, and Nginx-hosted web app.
