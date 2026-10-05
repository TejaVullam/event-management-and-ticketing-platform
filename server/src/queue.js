import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { promoteWaitlist } from "./services.js";
import mongoose from "mongoose";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true
});
export const bookingQueue = new Queue("booking-jobs", { connection });
export const enqueueBookingJob = (data, opts = {}) =>
  bookingQueue.add("booking-created", data, { removeOnComplete: 100, removeOnFail: 1000, attempts: 3, ...opts }).catch(() => null);

export const startWorker = () => new Worker("booking-jobs", async job => {
  if (job.name === "release-waitlist") await promoteWaitlist(job.data.eventId);
}, { connection });

if (process.argv[1]?.endsWith("queue.js")) {
  mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/event_booking")
    .then(() => { startWorker().on("completed", job => console.log(`Processed ${job.name}`)); console.log("Booking worker started"); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
