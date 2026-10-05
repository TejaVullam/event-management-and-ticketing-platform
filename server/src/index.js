import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { router } from "./routes.js";
import { io as events } from "./realtime.js";
import { rateLimit } from "./middleware.js";
import { errorHandler } from "./errorHandler.js";

export const app = express();
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
app.disable("x-powered-by");
app.use(helmet());
app.use(morgan("combined"));
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit(300));
app.use((req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); next(); });
app.get("/health", (req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));
app.use("/api", router);
app.use(errorHandler);

export const server = http.createServer(app);
const socket = new Server(server, { cors: { origin: clientUrl } });
events.to = room => ({ emit: (event, data) => socket.to(room).emit(event, data) });
socket.on("connection", client => client.on("join:event", id => client.join(`event:${id}`)));
if (process.argv[1]?.endsWith("index.js")) {
  const port = Number(process.env.PORT || 4000);
  mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/event_booking")
    .then(() => server.listen(port, () => console.log(`API listening on ${port}`)))
    .catch(error => { console.error(`MongoDB unavailable: ${error.message}`); process.exitCode = 1; });
}
