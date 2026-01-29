import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import {
    SocketEvents,
    DEFAULT_GAME_SETTINGS,
    DEFAULT_WORDS,
} from '@pictobattle/shared';
import type {
    Room,
    Player,
    CreateRoomPayload,
    JoinRoomPayload,
    SelectWordPayload,
    DrawPayload,
    SendMessagePayload,
    Message,
} from '@pictobattle/shared';
import { generateRoomId, generatePlayerId, generateMessageId, selectRandomWord, selectRandomPlayer } from '../utils/helpers.ts';

export class GameManager {
    private redis: Redis;
    private rooms: Map<string, Room> = new Map(); // Local cache for timers
    private playerRooms: Map<string, string> = new Map(); // socketId -> roomId
    private roundTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(private io: Server) {
        this.redis = new Redis(process.env.REDIS_HOST || 'localhost');

        this.redis.on('error', (err: Error) => {
            console.error('Redis Error:', err);
        });

        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on(SocketEvents.CREATE_ROOM, (payload) => this.createRoom(socket, payload));
            socket.on(SocketEvents.JOIN_ROOM, (payload) => this.joinRoom(socket, payload));
            socket.on(SocketEvents.LEAVE_ROOM, () => this.leaveRoom(socket));
            socket.on(SocketEvents.START_GAME, () => this.startGame(socket));
            socket.on(SocketEvents.SELECT_WORD, (payload) => this.selectWord(socket, payload));
            socket.on(SocketEvents.DRAW, (payload) => this.handleDraw(socket, payload));
            socket.on(SocketEvents.CLEAR_CANVAS, () => this.clearCanvas(socket));
            socket.on(SocketEvents.SEND_MESSAGE, (payload) => this.handleMessage(socket, payload));
            socket.on(SocketEvents.RESTART_GAME, () => this.restartGame(socket));
            socket.on(SocketEvents.PLAYER_READY, () => this.setPlayerReady(socket));
            socket.on(SocketEvents.KICK_PLAYER, (payload) => this.kickPlayer(socket, payload));
            socket.on(SocketEvents.GET_ROOMS, () => this.sendRoomList(socket));
            socket.on('get_high_scores', () => this.sendHighScores(socket));

            socket.on('disconnect', () => this.handleDisconnect(socket));
        });
    }

    private async updateRoom(roomId: string, room: Room) {
        await this.redis.hset('rooms', roomId, JSON.stringify(room));
        this.rooms.set(roomId, room);
    }

    private async getRoom(roomId: string): Promise<Room | null> {
        const data = await this.redis.hget('rooms', roomId);
        if (!data) return null;
        return JSON.parse(data) as Room;
    }

    private async deleteRoom(roomId: string) {
        await this.redis.hdel('rooms', roomId);
        this.rooms.delete(roomId);
    }

    private async sendRoomList(socket: Socket) {
        const roomsData = await this.redis.hgetall('rooms');
        const roomsList = Object.values(roomsData)
            .map(data => JSON.parse(data) as Room)
            .filter(r => r.gameState === 'lobby')
            .map(r => ({
                id: r.id,
                name: r.name,
                players: r.players.length,
                maxPlayers: 8,
                gameState: r.gameState
            }));
        socket.emit(SocketEvents.ROOMS_LIST, { rooms: roomsList });
    }

    private async broadcastRoomList() {
        const roomsData = await this.redis.hgetall('rooms');
        const roomsList = Object.values(roomsData)
            .map(data => JSON.parse(data) as Room)
            .filter(r => r.gameState === 'lobby')
            .map(r => ({
                id: r.id,
                name: r.name,
                players: r.players.length,
                maxPlayers: 8,
                gameState: r.gameState
            }));
        this.io.emit(SocketEvents.ROOMS_LIST, { rooms: roomsList });
    }

    async createRoom(socket: Socket, payload: CreateRoomPayload) {
        const roomId = generateRoomId();
        const playerId = generatePlayerId();

        const player: Player = {
            id: playerId,
            name: payload.playerName,
            avatar: payload.playerAvatar,
            score: 0,
            isAdmin: true,
            isDrawing: false,
            hasGuessed: false,
            isReady: false,
        };

        const room: Room = {
            id: roomId,
            name: payload.roomName || `Room ${roomId}`,
            players: [player],
            currentRound: 0,
            totalRounds: DEFAULT_GAME_SETTINGS.totalRounds,
            currentWord: null,
            wordOptions: [],
            drawingPlayerId: null,
            roundStartTime: null,
            roundDuration: DEFAULT_GAME_SETTINGS.roundDuration,
            gameState: 'lobby',
            customWords: payload.customWords || [],
            revealedLetters: {},
        };

        await this.updateRoom(roomId, room);
        this.playerRooms.set(socket.id, roomId);
        socket.data.playerId = playerId;

        socket.join(roomId);
        socket.emit(SocketEvents.ROOM_CREATED, { roomId, room });

        await this.broadcastRoomList();
        console.log(`Room created: ${roomId} by ${player.name}`);
    }

    async joinRoom(socket: Socket, payload: JoinRoomPayload) {
        const room = await this.getRoom(payload.roomId);

        if (!room) {
            socket.emit(SocketEvents.ERROR, { message: 'Room not found' });
            return;
        }

        if (room.gameState !== 'lobby') {
            socket.emit(SocketEvents.ERROR, { message: 'Game already in progress' });
            return;
        }

        const playerId = generatePlayerId();
        const player: Player = {
            id: playerId,
            name: payload.playerName,
            avatar: payload.playerAvatar,
            score: 0,
            isAdmin: false,
            isDrawing: false,
            hasGuessed: false,
            isReady: false,
        };

        room.players.push(player);
        await this.updateRoom(payload.roomId, room);

        this.playerRooms.set(socket.id, payload.roomId);
        socket.join(payload.roomId);
        socket.data.playerId = playerId;

        socket.emit(SocketEvents.ROOM_JOINED, { room });
        this.io.to(payload.roomId).emit(SocketEvents.PLAYER_JOINED, { player });
        await this.broadcastRoomList();
        this.io.to(payload.roomId).emit(SocketEvents.ROOM_UPDATED, { room });

        console.log(`${player.name} joined room ${payload.roomId}`);
    }

    async leaveRoom(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = await this.getRoom(roomId);
        if (!room) return;

        const playerId = socket.data.playerId;
        room.players = room.players.filter((p) => p.id !== playerId);

        if (room.players.length === 0) {
            await this.deleteRoom(roomId);
            this.clearRoundTimer(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        } else {
            if (room.players.every((p) => !p.isAdmin)) {
                room.players[0].isAdmin = true;
            }

            await this.updateRoom(roomId, room);
            this.io.to(roomId).emit(SocketEvents.PLAYER_LEFT, { playerId });
            this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
        }

        socket.leave(roomId);
        this.playerRooms.delete(socket.id);
    }

    async startGame(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = await this.getRoom(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Only admin can start the game' });
            return;
        }

        const unreadyPlayers = room.players.filter(p => !p.isAdmin && !p.isReady);

        if (unreadyPlayers.length > 0) {
            for (const p of unreadyPlayers) {
                const targetSocketId = Array.from(this.playerRooms.entries())
                    .find(([_, rid]) => rid === roomId &&
                        this.io.sockets.sockets.get(_)?.data.playerId === p.id)?.[0];

                if (targetSocketId) {
                    const targetSocket = this.io.sockets.sockets.get(targetSocketId);
                    if (targetSocket) {
                        targetSocket.emit(SocketEvents.PLAYER_KICKED, { message: 'You were kicked for not being ready' });
                        await this.leaveRoom(targetSocket);
                    }
                }
            }

            const refreshedRoom = await this.getRoom(roomId);
            if (!refreshedRoom) return;
            room.players = refreshedRoom.players;
        }

        if (room.players.length < 2) {
            socket.emit(SocketEvents.ERROR, { message: 'Not enough ready players to start (minimum 2)' });
            return;
        }

        room.gameState = 'word-selection';
        room.currentRound = 1;
        room.players.forEach((p) => {
            p.score = 0;
            p.hasGuessed = false;
            p.isDrawing = false;
        });

        await this.updateRoom(roomId, room);
        this.io.to(roomId).emit(SocketEvents.GAME_STARTED, { room });
        await this.startNewRound(roomId);
    }

    private async startNewRound(roomId: string) {
        const room = await this.getRoom(roomId);
        if (!room) return;

        room.players.forEach((p) => { p.isDrawing = false; });
        const drawerIndex = (room.currentRound - 1) % room.players.length;
        const drawer = room.players[drawerIndex];
        room.drawingPlayerId = drawer.id;
        drawer.isDrawing = true;

        room.players.forEach((p) => { p.hasGuessed = false; });
        room.revealedLetters = {};

        const wordList = room.customWords.length > 0 ? room.customWords : DEFAULT_WORDS;
        room.wordOptions = [
            selectRandomWord(wordList),
            selectRandomWord(wordList),
            selectRandomWord(wordList),
        ];

        room.gameState = 'word-selection';
        await this.updateRoom(roomId, room);
        this.io.to(roomId).emit(SocketEvents.ROUND_START, { room });
    }

    async selectWord(socket: Socket, payload: SelectWordPayload) {
        const room = await this.getRoom(payload.roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isDrawing) {
            socket.emit(SocketEvents.ERROR, { message: 'Only the drawer can select a word' });
            return;
        }

        room.currentWord = payload.word;
        room.gameState = 'drawing';
        room.roundStartTime = Date.now();

        await this.updateRoom(payload.roomId, room);

        socket.emit(SocketEvents.WORD_SELECTED, { word: payload.word });
        socket.to(payload.roomId).emit(SocketEvents.WORD_SELECTED, {
            word: payload.word.replace(/./g, '_'),
            wordLength: payload.word.length,
        });

        this.io.to(payload.roomId).emit(SocketEvents.ROOM_UPDATED, { room });
        this.startRoundTimer(payload.roomId);
    }

    private startRoundTimer(roomId: string) {
        this.clearRoundTimer(roomId);
        const roomRef = this.rooms.get(roomId); // Use local cache for timer duration
        if (!roomRef) return;

        const timer = setTimeout(() => {
            this.endRound(roomId);
        }, roomRef.roundDuration * 1000);

        this.roundTimers.set(roomId, timer);
    }

    private clearRoundTimer(roomId: string) {
        const timer = this.roundTimers.get(roomId);
        if (timer) {
            clearTimeout(timer);
            this.roundTimers.delete(roomId);
        }
    }

    private async endRound(roomId: string) {
        const room = await this.getRoom(roomId);
        if (!room) return;

        this.clearRoundTimer(roomId);
        room.gameState = 'round-end';
        await this.updateRoom(roomId, room);

        this.io.to(roomId).emit(SocketEvents.ROUND_END, {
            word: room.currentWord,
            scores: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
        });

        if (room.currentRound >= room.totalRounds) {
            setTimeout(() => this.endGame(roomId), 5000);
        } else {
            setTimeout(async () => {
                const updatedRoom = await this.getRoom(roomId);
                if (!updatedRoom) return;
                updatedRoom.currentRound++;
                await this.updateRoom(roomId, updatedRoom);
                await this.startNewRound(roomId);
            }, 5000);
        }
    }

    private async endGame(roomId: string) {
        const room = await this.getRoom(roomId);
        if (!room) return;

        room.gameState = 'game-end';
        const finalScores = room.players
            .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score }))
            .sort((a, b) => b.score - a.score);

        // Record high scores
        for (const p of room.players) {
            if (p.score > 0) {
                await this.recordHighScore(p.name, p.score);
            }
        }

        await this.updateRoom(roomId, room);
        this.io.to(roomId).emit(SocketEvents.GAME_END, { scores: finalScores });
        this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
    }

    private async recordHighScore(name: string, score: number) {
        // We use a simple playerName as identity.
        await this.redis.zadd('high_scores', score, name);
        // Trim to top 20
        await this.redis.zremrangebyrank('high_scores', 0, -21);
    }

    private async sendHighScores(socket: Socket) {
        const scores = await this.redis.zrevrange('high_scores', 0, 19, 'WITHSCORES');
        const formattedScores = [];
        for (let i = 0; i < scores.length; i += 2) {
            formattedScores.push({ name: scores[i], score: parseInt(scores[i + 1]) });
        }
        socket.emit('high_scores_list', { scores: formattedScores });
    }

    async handleDraw(socket: Socket, payload: DrawPayload) {
        const room = await this.getRoom(payload.roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isDrawing) return;

        socket.to(payload.roomId).emit(SocketEvents.DRAW_UPDATE, { stroke: payload.stroke });
    }

    async clearCanvas(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = await this.getRoom(roomId);
        if (!room || !room.players.find(p => p.id === socket.data.playerId)?.isDrawing) return;

        this.io.to(roomId).emit(SocketEvents.CANVAS_CLEARED);
    }

    async handleMessage(socket: Socket, payload: SendMessagePayload) {
        const room = await this.getRoom(payload.roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || player.isDrawing) return;

        const message: Message = {
            id: generateMessageId(),
            playerId: player.id,
            playerName: player.name,
            content: payload.content,
            timestamp: Date.now(),
        };

        if (
            room.gameState === 'drawing' &&
            room.currentWord &&
            payload.content.toLowerCase().trim() === room.currentWord.toLowerCase() &&
            !player.hasGuessed
        ) {
            player.hasGuessed = true;
            message.isCorrectGuess = true;

            const isFirstGuess = room.players.filter((p) => p.hasGuessed).length === 1;
            const points = DEFAULT_GAME_SETTINGS.pointsForCorrectGuess +
                (isFirstGuess ? DEFAULT_GAME_SETTINGS.bonusPointsForFirstGuess : 0);

            player.score += points;

            this.io.to(payload.roomId).emit(SocketEvents.CORRECT_GUESS, {
                playerId: player.id,
                playerName: player.name,
                points,
                isFirstGuess,
            });

            await this.updateRoom(payload.roomId, room);
            const allGuessed = room.players.filter((p) => !p.isDrawing).every((p) => p.hasGuessed);
            if (allGuessed) { this.endRound(payload.roomId); }
        } else {
            // Hint logic
            if (room.gameState === 'drawing' && room.currentWord && !player.hasGuessed) {
                const targetWord = room.currentWord.toLowerCase();
                const guessWord = payload.content.toLowerCase().trim();

                if (!room.revealedLetters[player.id]) room.revealedLetters[player.id] = [];
                const currentRevealed = new Set(room.revealedLetters[player.id]);
                let newReveal = false;

                const maxLength = Math.min(targetWord.length, guessWord.length);
                let remainingHidden = targetWord.length - currentRevealed.size;

                if (remainingHidden > 1) {
                    for (let i = 0; i < maxLength; i++) {
                        if (targetWord[i] === guessWord[i] && !currentRevealed.has(i)) {
                            if (remainingHidden > 1) {
                                currentRevealed.add(i);
                                newReveal = true;
                                remainingHidden--;
                            }
                        }
                    }
                }

                if (newReveal) {
                    room.revealedLetters[player.id] = Array.from(currentRevealed);
                    let hintWord = '';
                    for (let i = 0; i < targetWord.length; i++) {
                        hintWord += (currentRevealed.has(i) || targetWord[i] === ' ' || targetWord[i] === '-') ? room.currentWord[i] : '_';
                    }
                    this.io.to(socket.id).emit(SocketEvents.WORD_HINT_UPDATE, {
                        playerId: player.id,
                        revealedPositions: room.revealedLetters[player.id],
                        hintWord
                    });
                    await this.updateRoom(payload.roomId, room);
                }
            }
        }
        this.io.to(payload.roomId).emit(SocketEvents.NEW_MESSAGE, { message });
    }

    async restartGame(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = await this.getRoom(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Only admin can restart the game' });
            return;
        }

        room.gameState = 'lobby';
        room.currentRound = 0;
        room.currentWord = null;
        room.wordOptions = [];
        room.drawingPlayerId = null;
        room.roundStartTime = null;
        room.players.forEach((p) => {
            p.score = 0;
            p.isDrawing = false;
            p.hasGuessed = false;
            p.isReady = false;
        });

        this.clearRoundTimer(roomId);
        await this.updateRoom(roomId, room);
        this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
        console.log(`Game restarted in room ${roomId}`);
    }

    async setPlayerReady(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = await this.getRoom(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player) return;

        player.isReady = !player.isReady;
        await this.updateRoom(roomId, room);
        this.io.to(roomId).emit(SocketEvents.PLAYER_READY, { playerId: player.id, isReady: player.isReady });
        this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
    }

    async kickPlayer(socket: Socket, payload: { roomId: string; playerId: string }) {
        const room = await this.getRoom(payload.roomId);
        if (!room) return;

        const admin = room.players.find((p) => p.id === socket.data.playerId);
        if (!admin || !admin.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Only admin can kick players' });
            return;
        }

        const targetPlayer = room.players.find((p) => p.id === payload.playerId);
        if (!targetPlayer || targetPlayer.isAdmin) return;

        const targetSocketId = Array.from(this.playerRooms.entries())
            .find(([_, rid]) => rid === payload.roomId &&
                this.io.sockets.sockets.get(_)?.data.playerId === payload.playerId)?.[0];

        if (targetSocketId) {
            const targetSocket = this.io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.emit(SocketEvents.PLAYER_KICKED, { message: 'You have been kicked' });
                await this.leaveRoom(targetSocket);
            }
        }
    }

    handleDisconnect(socket: Socket) {
        this.leaveRoom(socket);
    }
}
