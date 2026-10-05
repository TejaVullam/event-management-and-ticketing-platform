import express from "express";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import mongoose from "mongoose";
import { User, Event, Booking, Waitlist } from "./models.js";
import { cacheGet, cacheSet, cacheDelete } from "./cache.js";
import { enqueueBookingJob } from "./queue.js";
import { io } from "./realtime.js";
import { auth, roles, tokenFor } from "./middleware.js";
import { createBooking, cancelBooking } from "./services.js";
import { joinWaitlist } from "./services/waitlistService.js";
import { queueBookingConfirmation, queueBookingReminder } from "./jobs/queues.js";

export const router = express.Router();
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const validId = id => mongoose.isValidObjectId(id);
router.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "name, valid email and password (8+ characters) required" });
  try {
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ error: "Email already registered" }); throw e; }
});
router.post("/auth/login", async (req, res) => {
  const user = await User.findOne({ email: String(req.body?.email || "").toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(req.body?.password || "", user.passwordHash))) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: tokenFor(user), user: publicUser(user) });
});
router.get("/auth/me", auth, async (req, res) => { const u = await User.findById(req.user.id).select("-passwordHash"); u ? res.json(u) : res.status(404).json({ error: "User not found" }); });

router.get("/events", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1), limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = String(req.query.search || req.query.q || "").slice(0, 80);
  const status = ["draft", "published", "cancelled", "completed"].includes(req.query.status) ? req.query.status : "published";
  const key = `events:${page}:${limit}:${search}:${status}`; const cached = await cacheGet(key); if (cached) { console.log(`events cache hit ${key}`); return res.json(cached); } console.log(`events cache miss ${key}`);
  const filter = { status }; if (search) filter.$or = [{ title: { $regex: search, $options: "i" } }, { venue: { $regex: search, $options: "i" } }];
  const [events, total] = await Promise.all([Event.find(filter).populate("organizer", "name").sort({ startAt: 1 }).skip((page - 1) * limit).limit(limit), Event.countDocuments(filter)]);
  const result = { events, page, limit, total, pages: Math.ceil(total / limit) }; await cacheSet(key, result, 60); res.json(result);
});
router.get("/events/:id", async (req, res) => { if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid id" }); const e = await Event.findById(req.params.id).populate("organizer", "name email"); e ? res.json(e) : res.status(404).json({ error: "Not found" }); });
router.post("/events", auth, roles("organizer", "admin"), async (req, res) => {
  const { capacity, title } = req.body || {}; if (!title || !Number.isInteger(Number(capacity)) || Number(capacity) < 1) return res.status(400).json({ error: "title and positive integer capacity are required" });
  const e = await Event.create({ ...req.body, capacity: Number(capacity), availableSeats: Number(capacity), organizer: req.user.id }); await cacheDelete("events:*"); res.status(201).json(e);
});
router.patch("/events/:id", auth, roles("organizer", "admin"), async (req, res) => {
  const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, organizer: req.user.id };
  const update = { ...req.body }; delete update.organizer; delete update.availableSeats; delete update.capacity;
  const e = await Event.findOneAndUpdate(filter, update, { new: true, runValidators: true }); if (!e) return res.status(404).json({ error: "Event not found" }); await cacheDelete("events:*"); res.json(e);
});
router.delete("/events/:id", auth, roles("organizer", "admin"), async (req, res) => { const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, organizer: req.user.id }; const e = await Event.findOneAndUpdate(filter, { status: "cancelled" }, { new: true }); e ? res.json({ ok: true }) : res.status(404).json({ error: "Event not found" }); await cacheDelete("events:*"); });

router.post("/events/:id/book", auth, async (req, res) => {
  const quantity = Number(req.body?.quantity || 1); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: "quantity must be 1-20" });
  const result = await createBooking({ eventId: req.params.id, userId: req.user.id, quantity }); await enqueueBookingJob({ bookingId: result.booking.id, status: result.status }); if (result.status === "confirmed") { await queueBookingConfirmation({ bookingId: result.booking.id }); await queueBookingReminder({ bookingId: result.booking.id }, Math.max(0, new Date(result.event.startAt).getTime() - Date.now() - 86400000)); }
  io.to(`event:${req.params.id}`).emit("seats:update", { availableSeats: result.event?.availableSeats ?? 0, status: result.status }); res.status(201).json(await result.booking.populate("event"));
});
router.get("/bookings", auth, async (req, res) => res.json(await Booking.find(req.user.role === "admin" ? {} : { user: req.user.id }).populate("event", "title venue startAt").sort({ createdAt: -1 })));
const findOwned = (id, user, status) => Booking.findOne({ _id: id, ...(user.role === "admin" ? {} : { user: user.id }), ...(status ? { status } : {}) }).select("+qrToken").populate("event", "title venue startAt organizer");
router.get("/bookings/:id/ticket", auth, async (req, res) => { const b = await findOwned(req.params.id, req.user, "confirmed"); b ? res.json({ ticketId: b.id, bookingId: b.id, ticketCode: b.ticketCode, event: b.event, quantity: b.quantity, checkedInAt: b.checkedInAt }) : res.status(404).json({ error: "Ticket not found" }); });
router.get("/tickets/my", auth, async (req, res) => res.json(await Booking.find({ user: req.user.id }).populate("event", "title venue startAt").sort({ createdAt: -1 })));
router.get("/tickets/:id", auth, async (req, res) => { const b = await findOwned(req.params.id, req.user); b ? res.json(b) : res.status(404).json({ error: "Ticket not found" }); });
const qr = async (req, res) => { const b = await findOwned(req.params.id, req.user, "confirmed"); if (!b) return res.status(404).json({ error: "Ticket not found" }); res.type("png").send(await QRCode.toBuffer(JSON.stringify({ bookingId: b.id, ticketCode: b.ticketCode, eventId: b.event?._id || b.event }))); };
router.get("/tickets/:id/qr", auth, qr); router.get("/bookings/:id/qr", auth, qr);
router.post("/tickets/validate", auth, roles("organizer", "admin"), async (req, res) => {
  const token = req.body?.ticketCode || req.body?.token; const b = await Booking.findOne({ ...(req.body?.bookingId ? { _id: req.body.bookingId } : { ticketCode: token }), status: "confirmed" }).select("+qrToken").populate("event", "title organizer");
  if (!b || !token || b.ticketCode !== token) return res.status(400).json({ valid: false, message: "Invalid ticket", error: "Invalid ticket" });
  if (req.user.role === "organizer" && String(b.event.organizer) !== String(req.user.id)) return res.status(403).json({ valid: false, error: "Not your event" });
  if (b.checkedInAt) return res.status(409).json({ valid: false, message: "Ticket already used", error: "Ticket already used" }); b.checkedInAt = new Date(); await b.save(); res.json({ valid: true, message: "Ticket validated successfully", bookingId: b.id, checkedInAt: b.checkedInAt, event: b.event });
});
const cancel = async (req, res) => {
  const result = await cancelBooking({ bookingId: req.params.id, userId: req.user.id, isAdmin: req.user.role === "admin" });
  if (!result) return res.status(404).json({ error: "Booking not found" });
  if (result.promoted) await queueBookingConfirmation({ bookingId: result.promoted.id });
  io.to(`event:${result.booking.event}`).emit("seats:update", { eventId: String(result.booking.event), availableSeats: result.event?.availableSeats, bookingCancelled: true });
  res.json(result.booking);
};
router.post("/bookings/:id/cancel", auth, cancel); router.post("/tickets/:id/cancel", auth, cancel);
router.get("/analytics", auth, roles("organizer", "admin"), async (req, res) => { const events = await Event.find(req.user.role === "admin" ? {} : { organizer: req.user.id }); const ids = events.map(e => e._id); const rows = await Booking.aggregate([{ $match: { event: { $in: ids } } }, { $group: { _id: "$status", bookings: { $sum: "$quantity" } } }]); res.json({ events: events.length, totalCapacity: events.reduce((n, e) => n + e.capacity, 0), availableSeats: events.reduce((n, e) => n + e.availableSeats, 0), bookings: rows }); });
router.get("/analytics/overview", auth, roles("organizer", "admin"), async (req, res) => { const events = await Event.find(req.user.role === "admin" ? {} : { organizer: req.user.id }); const ids = events.map(e => e._id); const confirmed = await Booking.aggregate([{ $match: { event: { $in: ids }, status: "confirmed" } }, { $lookup: { from: "events", localField: "event", foreignField: "_id", as: "event" } }, { $unwind: "$event" }, { $group: { _id: null, total: { $sum: { $multiply: ["$quantity", "$event.price"] } } } }]); res.json({ totalEvents: events.length, totalTickets: await Booking.countDocuments({ event: { $in: ids }, status: "confirmed" }), totalRevenue: confirmed[0]?.total || 0, availableSeats: events.reduce((n, e) => n + e.availableSeats, 0) }); });
router.get("/waitlist/:eventId", auth, async (req, res) => res.json(await Waitlist.find({ event: req.params.eventId, user: req.user.id }).sort({ createdAt: 1 })));
router.post("/events/:eventId/waitlist", auth, async (req, res) => {
  const quantity = Number(req.body?.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: "quantity must be 1-20" });
  res.status(201).json(await joinWaitlist({ eventId: req.params.eventId, userId: req.user.id, quantity }));
});
router.delete("/waitlist/:id", auth, async (req, res) => { const w = await Waitlist.findOneAndUpdate({ _id: req.params.id, user: req.user.id, status: { $in: ["waiting", "offered"] } }, { status: "cancelled" }, { new: true }); w ? res.json(w) : res.status(404).json({ error: "Waitlist entry not found" }); });
