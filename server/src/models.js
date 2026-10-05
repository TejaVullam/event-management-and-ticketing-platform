import mongoose from "mongoose";

const email = { type: String, required: true, unique: true, lowercase: true, trim: true };
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email,
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["user", "organizer", "admin"], default: "user" }
}, { timestamps: true });

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 5000 },
  venue: { type: String, maxlength: 300 },
  startAt: Date, endAt: Date,
  capacity: { type: Number, required: true, min: 1, max: 100000 },
  availableSeats: { type: Number, required: true, min: 0 },
  price: { type: Number, default: 0, min: 0 },
  image: String, category: String,
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["draft", "published", "cancelled", "completed"], default: "draft" }
}, { timestamps: true });
eventSchema.index({ status: 1, startAt: 1 });

const bookingSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  quantity: { type: Number, min: 1, max: 20, required: true },
  status: { type: String, enum: ["confirmed", "waitlisted", "cancelled"], default: "confirmed" },
  qrToken: { type: String, select: false },
  ticketCode: { type: String, unique: true, sparse: true, index: true },
  checkedInAt: Date,
  cancelledAt: Date
}, { timestamps: true });
bookingSchema.index({ event: 1, user: 1, createdAt: -1 });
bookingSchema.index({ qrToken: 1 }, { sparse: true, unique: true });

const waitlistSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  quantity: { type: Number, min: 1, max: 20, required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  status: { type: String, enum: ["waiting", "offered", "fulfilled", "cancelled"], default: "waiting" },
  offeredUntil: Date
}, { timestamps: true });
waitlistSchema.index({ event: 1, status: 1, createdAt: 1 });
waitlistSchema.index({ event: 1, user: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["waiting", "offered"] } } });

export const User = mongoose.model("User", userSchema);
export const Event = mongoose.model("Event", eventSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
export const Waitlist = mongoose.model("Waitlist", waitlistSchema);
