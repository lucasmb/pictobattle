import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import cors from 'cors';
import dotenv from 'dotenv';
import { GameManager } from './game/GameManager.ts';
import { SocketEvents } from '@pictobattle/shared';
import type {
    CreateRoomPayload,
    JoinRoomPayload,
    SelectWordPayload,
    DrawPayload,
    SendMessagePayload,
} from '@pictobattle/shared';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Redis Pub/Sub for horizontal scaling
// This allows multiple server instances to communicate through Redis
const redisHost = process.env.REDIS_HOST || 'localhost';
const pubClient = new Redis(redisHost);
const subClient = pubClient.duplicate();

pubClient.on('error', (err: Error) => {
    console.error('Redis Pub Client Error:', err);
});

subClient.on('error', (err: Error) => {
    console.error('Redis Sub Client Error:', err);
});

const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

// Enable Redis adapter for pub/sub across multiple instances
io.adapter(createAdapter(pubClient, subClient));
console.log(`📡 Redis Pub/Sub adapter enabled for horizontal scaling`);

app.use(cors());
app.use(express.json());

const gameManager = new GameManager(io);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io connection handling is managed by GameManager
// const gameManager = new GameManager(io); line above handles it.

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔄 Horizontal scaling: ${process.env.REDIS_HOST ? 'Enabled' : 'Disabled (Redis not configured)'}`);
});
