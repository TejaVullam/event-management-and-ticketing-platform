import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true }, email: { type: String, unique: true, lowercase: true },
  passwordHash: String, role: { type: String, enum: ["user", "organizer", "admin"], default: "user" }
}, { timestamps: true });
const eventSchema = new mongoose.Schema({
  title: { type: String, required: true }, description: String, venue: String,
  startAt: Date, endAt: Date, capacity: { type: Number, required: true, min: 1 },
  availableSeats: { type: Number, required: true, min: 0 }, price: { type: Number, default: 0 },
  image: String, category: String, organizer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["draft", "published", "cancelled", "completed"], default: "draft" }
}, { timestamps: true });
const bookingSchema = new mongoose.Schema({
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  quantity: { type: Number, min: 1, required: true }, status: { type: String, enum: ["confirmed", "waitlisted", "cancelled"], default: "confirmed" },
  qrToken: String, checkedInAt: Date
}, { timestamps: true });
bookingSchema.index({ event: 1, user: 1 });
export const User = mongoose.model("User", userSchema);
export const Event = mongoose.model("Event", eventSchema);
export const Booking = mongoose.model("Booking", bookingSchema);
