import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
let queue;
try { const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null, enableOfflineQueue: false }); queue = new Queue("booking-jobs", { connection }); new Worker("booking-jobs", async job => console.log(`Processed ${job.name}`, job.data), { connection }); } catch {}
export const enqueueBookingJob = async data => queue ? queue.add("booking-created", data, { removeOnComplete: 100, attempts: 3 }) : null;
