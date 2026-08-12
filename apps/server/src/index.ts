import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import cors from "cors";
import { GameManager } from "./game/GameManager.ts";
import { getRedisOptions } from "./config/redis.ts";

const app = express();
const httpServer = createServer(app);

// Redis Pub/Sub for horizontal scaling
// This allows multiple server instances to communicate through Redis
const pubClient = new Redis(getRedisOptions());
const subClient = pubClient.duplicate();

pubClient.on("error", (err: Error) => {
  console.error("Redis Pub Client Error:", err);
});

subClient.on("error", (err: Error) => {
  console.error("Redis Sub Client Error:", err);
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Enable Redis adapter for pub/sub across multiple instances
io.adapter(createAdapter(pubClient, subClient));
console.log(`📡 Redis Pub/Sub adapter enabled for horizontal scaling`);

app.use(cors());
app.use(express.json());

const gameManager = new GameManager(io);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(
    `🔄 Horizontal scaling: ${process.env.REDIS_HOST ? "Enabled" : "Disabled (Redis not configured)"}`,
  );
});

const shutdown = () => {
  console.log("Shutting down gracefully...");
  httpServer.close(() => {
    pubClient.disconnect();
    subClient.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
