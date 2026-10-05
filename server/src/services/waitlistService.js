import crypto from "crypto";
import { Event, Booking, Waitlist } from "../models.js";

export async function joinWaitlist({ eventId, userId, quantity }) {
  const event = await Event.findOne({ _id: eventId, status: "published" });
  if (!event) { const error = new Error("Event not found"); error.status = 404; throw error; }
  if (event.availableSeats > 0) { const error = new Error("Seats are still available; book the event instead"); error.status = 409; throw error; }
  const existing = await Waitlist.exists({ event: eventId, user: userId, status: { $in: ["waiting", "offered"] } });
  if (existing) { const error = new Error("Already on the waitlist"); error.status = 409; throw error; }
  const booking = await Booking.create({ event: eventId, user: userId, quantity, status: "waitlisted" });
  return Waitlist.create({ event: eventId, user: userId, quantity, booking: booking.id });
}

export async function promoteNext(eventId) {
  const event = await Event.findById(eventId);
  if (!event) return null;
  const next = await Waitlist.findOneAndUpdate(
    { event: eventId, status: "waiting", quantity: { $lte: event.availableSeats } },
    { status: "fulfilled" }, { sort: { createdAt: 1 }, new: true }
  );
  if (!next) return null;
  const updated = await Event.findOneAndUpdate(
    { _id: eventId, availableSeats: { $gte: next.quantity } },
    { $inc: { availableSeats: -next.quantity } }, { new: true }
  );
  if (!updated) { await Waitlist.findByIdAndUpdate(next.id, { status: "waiting" }); return null; }
  const ticketCode = crypto.randomBytes(12).toString("hex").toUpperCase();
  return Booking.findByIdAndUpdate(next.booking, { status: "confirmed", ticketCode, qrToken: ticketCode }, { new: true });
}
