import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { GameManager } from "./game/GameManager.ts";

const app = express();
const httpServer = createServer(app);

// Single instance by design: game timers and socket lookups live in this process's memory.
// Log instead of crash when an async socket handler fails (e.g. Redis briefly unreachable).
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// Serve the web build (Docker copies it to ./public next to the bundled server); no-op in dev
app.use(express.static(path.join(import.meta.dirname, "public")));

const gameManager = new GameManager(io);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = () => {
  console.log("Shutting down gracefully...");
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
