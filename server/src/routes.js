import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import QRCode from "qrcode";
import { User, Event, Booking } from "./models.js";
import { cacheGet, cacheSet, cacheDelete } from "./cache.js";
import { enqueueBookingJob } from "./queue.js";
import { io } from "./realtime.js";
const router = express.Router();
const secret = process.env.JWT_SECRET || "dev-secret";
export const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || "").replace(/^Bearer\s+/, ""), secret); next(); } catch { res.status(401).json({ error: "Authentication required" }); } };
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
const tokenFor = u => jwt.sign({ id: u.id, email: u.email, role: u.role }, secret, { expiresIn: "7d" });
router.post("/auth/register", async (req, res) => { const { name, email, password } = req.body; if (!name || !email || !password) return res.status(400).json({ error: "name, email and password required" }); if (await User.findOne({ email })) return res.status(409).json({ error: "Email already registered" }); const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) }); res.status(201).json({ token: tokenFor(user), user: { id: user.id, name, email, role: user.role } }); });
router.post("/auth/login", async (req, res) => { const user = await User.findOne({ email: req.body.email }); if (!user || !(await bcrypt.compare(req.body.password || "", user.passwordHash))) return res.status(401).json({ error: "Invalid credentials" }); res.json({ token: tokenFor(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } }); });
router.get("/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});
router.get("/events", async (req, res) => { const key = `events:${JSON.stringify(req.query)}`; const cached = await cacheGet(key); if (cached) return res.json(cached); const filter = { status: req.query.status || "published" }; if (req.query.q) filter.$or = [{ title: { $regex: req.query.q, $options: "i" } }, { venue: { $regex: req.query.q, $options: "i" } }]; const events = await Event.find(filter).populate("organizer", "name").sort({ startAt: 1 }); await cacheSet(key, events, 30); res.json(events); });
router.get("/events/:id", async (req, res) => { const e = await Event.findById(req.params.id).populate("organizer", "name email"); e ? res.json(e) : res.status(404).json({ error: "Not found" }); });
router.post("/events", auth, roles("organizer", "admin"), async (req, res) => { const data = { ...req.body, organizer: req.user.id }; if (!data.capacity) return res.status(400).json({ error: "capacity is required" }); data.availableSeats = data.capacity; const e = await Event.create(data); await cacheDelete("events:*"); res.status(201).json(e); });
router.patch("/events/:id", auth, roles("organizer", "admin"), async (req, res) => { const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, organizer: req.user.id }; const e = await Event.findOneAndUpdate(filter, req.body, { new: true, runValidators: true }); if (!e) return res.status(404).json({ error: "Event not found" }); await cacheDelete("events:*"); res.json(e); });
router.delete("/events/:id", auth, roles("organizer", "admin"), async (req, res) => { await Event.findByIdAndUpdate(req.params.id, { status: "cancelled" }); await cacheDelete("events:*"); res.json({ ok: true }); });
router.post("/events/:id/book", auth, async (req, res) => {
  const quantity = Math.max(1, Number(req.body.quantity || 1)); const event = await Event.findOneAndUpdate({ _id: req.params.id, status: "published", availableSeats: { $gte: quantity } }, { $inc: { availableSeats: -quantity } }, { new: true });
  let status = "confirmed"; if (!event) { const exists = await Event.findOne({ _id: req.params.id, status: "published" }); if (!exists) return res.status(404).json({ error: "Event not found" }); status = "waitlisted"; }
  const booking = await Booking.create({ event: req.params.id, user: req.user.id, quantity, status, qrToken: status === "confirmed" ? crypto.randomBytes(24).toString("hex") : undefined });
  await enqueueBookingJob({ bookingId: booking.id, status }); io.to(`event:${req.params.id}`).emit("seats:update", { availableSeats: event?.availableSeats ?? 0, status });
  res.status(201).json(await booking.populate("event"));
});
router.get("/bookings", auth, async (req, res) => res.json(await Booking.find(req.user.role === "admin" ? {} : { user: req.user.id }).populate("event", "title venue startAt").sort({ createdAt: -1 })));
router.get("/bookings/:id/ticket", auth, async (req, res) => { const b = await Booking.findOne({ _id: req.params.id, ...(req.user.role === "admin" ? {} : { user: req.user.id }), status: "confirmed" }).populate("event", "title venue startAt"); if (!b) return res.status(404).json({ error: "Ticket not found" }); res.json({ ticketId: b.id, bookingId: b.id, event: b.event, quantity: b.quantity, qrToken: b.qrToken, checkedInAt: b.checkedInAt }); });
router.get("/tickets/my", auth, async (req, res) => res.json(await Booking.find({ user: req.user.id }).populate("event", "title venue startAt").sort({ createdAt: -1 })));
router.get("/tickets/:id", auth, async (req, res) => { const b = await Booking.findOne({ _id: req.params.id, ...(req.user.role === "admin" ? {} : { user: req.user.id }) }).populate("event", "title venue startAt"); if (!b) return res.status(404).json({ error: "Ticket not found" }); res.json(b); });
router.get("/tickets/:id/qr", auth, async (req, res) => { const b = await Booking.findOne({ _id: req.params.id, user: req.user.id, status: "confirmed" }); if (!b) return res.status(404).json({ error: "Ticket not found" }); res.type("png").send(await QRCode.toBuffer(JSON.stringify({ bookingId: b.id, token: b.qrToken }))); });
router.get("/bookings/:id/qr", auth, async (req, res) => { const b = await Booking.findOne({ _id: req.params.id, user: req.user.id, status: "confirmed" }); if (!b) return res.status(404).json({ error: "Ticket not found" }); res.type("png").send(await QRCode.toBuffer(JSON.stringify({ bookingId: b.id, token: b.qrToken }))); });
router.post("/tickets/validate", auth, roles("organizer", "admin"), async (req, res) => { const b = await Booking.findOne({ ...(req.body.bookingId ? { _id: req.body.bookingId } : {}), ...(req.body.ticketCode ? { qrToken: req.body.ticketCode } : { qrToken: req.body.token }), status: "confirmed" }).populate("event", "title organizer"); if (!b) return res.status(400).json({ valid: false, error: "Invalid ticket" }); if (b.checkedInAt) return res.status(409).json({ valid: false, error: "Already checked in" }); b.checkedInAt = new Date(); await b.save(); res.json({ valid: true, bookingId: b.id, checkedInAt: b.checkedInAt, event: b.event }); });
router.post("/bookings/:id/cancel", auth, async (req, res) => { const b = await Booking.findOneAndUpdate({ _id: req.params.id, user: req.user.id, status: "confirmed" }, { status: "cancelled" }, { new: true }); if (!b) return res.status(404).json({ error: "Booking not found" }); await Event.findByIdAndUpdate(b.event, { $inc: { availableSeats: b.quantity } }); io.to(`event:${b.event}`).emit("seats:update", { bookingCancelled: true }); res.json(b); });
router.post("/tickets/:id/cancel", auth, async (req, res) => {
  const b = await Booking.findOneAndUpdate({ _id: req.params.id, user: req.user.id, status: "confirmed" }, { status: "cancelled" }, { new: true });
  if (!b) return res.status(404).json({ error: "Ticket not found" });
  await Event.findByIdAndUpdate(b.event, { $inc: { availableSeats: b.quantity } });
  io.to(`event:${b.event}`).emit("seats:update", { bookingCancelled: true });
  res.json(b);
});
router.get("/analytics", auth, roles("organizer", "admin"), async (req, res) => { const events = await Event.find(req.user.role === "admin" ? {} : { organizer: req.user.id }); const ids = events.map(e => e._id); const rows = await Booking.aggregate([{ $match: { event: { $in: ids } } }, { $group: { _id: "$status", bookings: { $sum: "$quantity" }, revenue: { $sum: { $multiply: ["$quantity", { $ifNull: ["$price", 0] }] } } } }]); res.json({ events: events.length, totalCapacity: events.reduce((n, e) => n + e.capacity, 0), availableSeats: events.reduce((n, e) => n + e.availableSeats, 0), bookings: rows }); });
router.get("/analytics/overview", auth, roles("organizer", "admin"), async (req, res) => {
  const events = await Event.find(req.user.role === "admin" ? {} : { organizer: req.user.id });
  const ids = events.map(e => e._id);
  const totalTickets = await Booking.countDocuments({ event: { $in: ids }, status: "confirmed" });
  const totalRevenue = await Booking.aggregate([{ $match: { event: { $in: ids }, status: "confirmed" } }, { $lookup: { from: "events", localField: "event", foreignField: "_id", as: "event" } }, { $unwind: "$event" }, { $group: { _id: null, total: { $sum: { $multiply: ["$quantity", "$event.price"] } } } }]);
  res.json({ totalEvents: events.length, totalTickets, totalRevenue: totalRevenue[0]?.total || 0, availableSeats: events.reduce((sum, event) => sum + event.availableSeats, 0), upcomingEvents: events.filter(event => event.startAt > new Date()).length });
});
export { router };
