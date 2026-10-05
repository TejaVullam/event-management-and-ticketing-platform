import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User, Event } from "./models.js";

const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (process.env.NODE_ENV === "production" && (!password || password.length < 12)) throw new Error("Set ADMIN_PASSWORD (12+ characters) in production");
await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/event_booking");
const existing = await User.findOne({ email });
const admin = existing || await User.create({ name: "Administrator", email, passwordHash: await bcrypt.hash(password || "Admin123!", 12), role: "admin" });
const organizerEmail = (process.env.ORGANIZER_EMAIL || "organizer@example.com").toLowerCase();
const organizer = await User.findOneAndUpdate({ email: organizerEmail }, { $setOnInsert: { name: "Organizer", email: organizerEmail, passwordHash: await bcrypt.hash(process.env.ORGANIZER_PASSWORD || "Organizer123!", 12), role: "organizer" } }, { upsert: true, new: true });
const userEmail = (process.env.USER_EMAIL || "user@example.com").toLowerCase();
await User.findOneAndUpdate({ email: userEmail }, { $setOnInsert: { name: "Demo User", email: userEmail, passwordHash: await bcrypt.hash(process.env.USER_PASSWORD || "User123!", 12), role: "user" } }, { upsert: true });
const examples = [
  ["Summer Music Festival", "Live music and food trucks", "Central Park"],
  ["Tech Meetup", "A practical evening of technology talks", "Innovation Hub"],
  ["Local Art Fair", "Artists, makers and workshops", "Town Hall"]
];
for (const [title, description, venue] of examples) {
  await Event.updateOne({ title, organizer: organizer.id }, { $setOnInsert: { title, description, venue, startAt: new Date(Date.now() + 7 * 86400000), capacity: 100, availableSeats: 100, price: 10, organizer: organizer.id, status: "published" } }, { upsert: true });
}
console.log(`Seeded accounts ${admin.email}, ${organizer.email} and 3 events`);
await mongoose.disconnect();
