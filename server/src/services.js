import crypto from "crypto";
import { Booking, Event, Waitlist } from "./models.js";

export const createBooking = async ({ eventId, userId, quantity }) => {
  const event = await Event.findOneAndUpdate(
    { _id: eventId, status: "published", availableSeats: { $gte: quantity } },
    { $inc: { availableSeats: -quantity } }, { new: true }
  );
  const status = event ? "confirmed" : "waitlisted";
  if (!event && !(await Event.exists({ _id: eventId, status: "published" }))) {
    const error = new Error("Event not found"); error.status = 404; throw error;
  }
  const ticketCode = event ? `EVT-${crypto.randomBytes(6).toString("hex").toUpperCase()}` : undefined;
  const booking = await Booking.create({ event: eventId, user: userId, quantity, status, ticketCode, qrToken: ticketCode });
  if (status === "waitlisted") await Waitlist.create({ event: eventId, user: userId, quantity, booking: booking.id });
  return { booking, event, status };
};

export const cancelBooking = async ({ bookingId, userId, isAdmin = false }) => {
  const filter = { _id: bookingId, status: "confirmed", ...(isAdmin ? {} : { user: userId }) };
  const booking = await Booking.findOneAndUpdate(filter, { status: "cancelled", cancelledAt: new Date() }, { new: true });
  if (!booking) return null;
  const event = await Event.findByIdAndUpdate(booking.event, { $inc: { availableSeats: booking.quantity } }, { new: true });
  const promoted = await promoteWaitlist(booking.event);
  return { booking, event, promoted };
};

export const promoteWaitlist = async eventId => {
  const event = await Event.findById(eventId);
  if (!event || event.availableSeats < 1) return null;
  const next = await Waitlist.findOneAndUpdate(
    { event: eventId, status: "waiting", quantity: { $lte: event.availableSeats } },
    { status: "fulfilled" }, { sort: { createdAt: 1 }, new: true }
  );
  if (!next) return null;
  await Event.findByIdAndUpdate(eventId, { $inc: { availableSeats: -next.quantity } });
  const ticketCode = `EVT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
  await Booking.findByIdAndUpdate(next.booking, { status: "confirmed", ticketCode, qrToken: ticketCode });
  return next;
};
