import "dotenv/config";
import mongoose from "mongoose";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { sendBookingConfirmation, sendBookingReminder } from "../services/notificationService.js";
import { Booking } from "../models.js";
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null });
const run = async (job, notify) => notify(await Booking.findById(job.data.bookingId).populate("event user"));
export function startWorkers() {
  const email = new Worker("emailQueue", job => run(job, sendBookingConfirmation), { connection });
  const reminder = new Worker("reminderQueue", job => run(job, sendBookingReminder), { connection });
  return { email, reminder };
}
if (process.argv[1]?.endsWith("worker.js")) {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/event_booking");
  startWorkers();
  console.log("Email and reminder workers started");
}
