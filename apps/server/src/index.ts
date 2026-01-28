import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

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
});
