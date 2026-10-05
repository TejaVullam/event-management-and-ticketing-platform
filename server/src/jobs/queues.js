import { Queue } from "bullmq";
import IORedis from "ioredis";
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true });
export const emailQueue = new Queue("emailQueue", { connection });
export const reminderQueue = new Queue("reminderQueue", { connection });
const safeAdd = (queue, name, data, opts = {}) => queue.add(name, data, { removeOnComplete: 100, removeOnFail: 1000, attempts: 3, ...opts }).catch(() => null);
export const queueBookingConfirmation = data => safeAdd(emailQueue, "booking-confirmation", data);
export const queueBookingReminder = (data, delay) => safeAdd(reminderQueue, "booking-reminder", data, { delay });
