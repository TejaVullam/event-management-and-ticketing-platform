import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { router } from "./routes.js";
import { io as events } from "./realtime.js";
const app = express(); app.use(cors({ origin: process.env.CLIENT_URL || "*" })); app.use(express.json()); app.get("/health", (req, res) => res.json({ ok: true })); app.use("/api", router); app.use((err, req, res, next) => res.status(500).json({ error: err.message || "Server error" }));
const server = http.createServer(app); const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || "*" } }); events.to = room => ({ emit: (event, data) => io.to(room).emit(event, data) }); io.on("connection", socket => socket.on("join:event", id => socket.join(`event:${id}`)));
const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`API listening on ${port}`));
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/event_booking", { serverSelectionTimeoutMS: 3000 })
  .then(() => console.log("MongoDB connected"))
  .catch(error => console.error(`MongoDB unavailable: ${error.message}`));
export { io };
