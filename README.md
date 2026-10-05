# Evently

Evently is a JavaScript event management and ticketing platform built with React, Express, MongoDB, Redis, BullMQ, and Socket.IO.

## Features

- JWT authentication with user, organizer, and admin roles
- Event creation, editing, cancellation, search, and pagination
- Atomic MongoDB seat reservations
- Waitlists with automatic promotion after cancellation
- Ticket codes and QR ticket generation
- Organizer/admin ticket validation
- Realtime seat availability updates with Socket.IO
- Redis caching for event listings
- BullMQ booking confirmation and reminder jobs
- Organizer and admin analytics

## Requirements

- Node.js 18+
- Docker Desktop, or local MongoDB and Redis

## Local setup

```powershell
npm install
Copy-Item server\.env.example server\.env
docker compose up -d mongo redis
npm --workspace server run seed
npm run dev
```

Open:

- Frontend: http://localhost:5173
- API: http://localhost:4000
- Health check: http://localhost:4000/health

Run the background worker in a separate terminal:

```powershell
npm --workspace server run worker
```

## Docker setup

The complete stack includes MongoDB, Redis, the API, the BullMQ worker, and the frontend:

```powershell
docker compose up --build
```

The application is available at http://localhost:5173.

## Seed accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | Admin123! |
| Organizer | organizer@example.com | Organizer123! |
| User | user@example.com | User123! |

The seed command is idempotent and creates three published demo events.

## API

### Authentication

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

### Events

```text
GET    /api/events?page=1&limit=20&search=&status=published
GET    /api/events/:id
POST   /api/events                  organizer/admin
PATCH  /api/events/:id              organizer/admin
DELETE /api/events/:id              organizer/admin
```

### Bookings and waitlists

```text
POST   /api/events/:id/book
POST   /api/events/:eventId/waitlist
GET    /api/bookings
POST   /api/bookings/:id/cancel
DELETE /api/waitlist/:id
```

### Tickets

```text
GET  /api/tickets/my
GET  /api/tickets/:id
GET  /api/tickets/:id/qr
POST /api/tickets/validate          organizer/admin
```

### Analytics

```text
GET /api/analytics/overview          organizer/admin
```

## Environment

Copy `server/.env.example` to `server/.env` and configure:

```text
PORT=4000
MONGO_URI=mongodb://localhost:27017/event_booking
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
CLIENT_URL=http://localhost:5173
REMINDER_DELAY_MS=60000
```

For Docker, the API uses `mongodb://mongo:27017/event_booking` and `redis://redis:6379` automatically.

## Architecture

```text
React/Vite
    |
    | REST and Socket.IO
    v
Express API ---- MongoDB
    |
    +----------- Redis ---- BullMQ worker
```

Event listings are cached in Redis for 60 seconds. Booking uses an atomic MongoDB update that decrements `availableSeats` only when enough seats remain, preventing overselling during concurrent requests.
