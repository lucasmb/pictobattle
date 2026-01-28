import { Server, Socket } from 'socket.io';
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
    private rooms: Map<string, Room> = new Map();
    private playerRooms: Map<string, string> = new Map(); // socketId -> roomId
    private roundTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(private io: Server) {
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

            socket.on('disconnect', () => this.handleDisconnect(socket));
        });
    }

    private sendRoomList(socket: Socket) {
        const roomsList = Array.from(this.rooms.values())
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

    private broadcastRoomList() {
        const roomsList = Array.from(this.rooms.values())
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

    createRoom(socket: Socket, payload: CreateRoomPayload) {
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

        this.rooms.set(roomId, room);
        this.playerRooms.set(socket.id, roomId);

        // Store player ID in socket data
        socket.data.playerId = playerId;

        socket.join(roomId);
        socket.emit(SocketEvents.ROOM_CREATED, { roomId, room });

        this.broadcastRoomList(); // Broadcast update

        console.log(`Room created: ${roomId} by ${player.name}`);
    }

    joinRoom(socket: Socket, payload: JoinRoomPayload) {
        const room = this.rooms.get(payload.roomId);

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
        this.playerRooms.set(socket.id, payload.roomId);
        socket.join(payload.roomId);
        socket.data.playerId = playerId;

        socket.emit(SocketEvents.ROOM_JOINED, { room });
        this.io.to(payload.roomId).emit(SocketEvents.PLAYER_JOINED, { player });

        this.broadcastRoomList(); // Broadcast update

        this.io.to(payload.roomId).emit(SocketEvents.ROOM_UPDATED, { room });

        console.log(`${player.name} joined room ${payload.roomId}`);
    }

    leaveRoom(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (!room) return;

        const playerId = socket.data.playerId;
        room.players = room.players.filter((p) => p.id !== playerId);

        if (room.players.length === 0) {
            // Delete room if empty
            this.rooms.delete(roomId);
            this.clearRoundTimer(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        } else {
            // Assign new admin if needed
            if (room.players.every((p) => !p.isAdmin)) {
                room.players[0].isAdmin = true;
            }

            this.io.to(roomId).emit(SocketEvents.PLAYER_LEFT, { playerId });
            this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
        }

        socket.leave(roomId);
        this.playerRooms.delete(socket.id);
    }

    startGame(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Only admin can start the game' });
            return;
        }

        // Check for readiness and kick unready players (except admin)
        const unreadyPlayers = room.players.filter(p => !p.isAdmin && !p.isReady);

        if (unreadyPlayers.length > 0) {
            console.log(`Kicking ${unreadyPlayers.length} unready players before starting game`);

            unreadyPlayers.forEach(p => {
                // Find socket for player
                const targetSocketId = Array.from(this.playerRooms.entries())
                    .find(([_, rid]) => rid === roomId &&
                        this.io.sockets.sockets.get(_)?.data.playerId === p.id)?.[0];

                if (targetSocketId) {
                    const targetSocket = this.io.sockets.sockets.get(targetSocketId);
                    if (targetSocket) {
                        targetSocket.emit(SocketEvents.PLAYER_KICKED, { message: 'You were kicked for not being ready' });
                        this.leaveRoom(targetSocket);
                    }
                }
            });

            // Refresh room after kicks
            // room object is reference, so players array inside it is mutated by leaveRoom? 
            // leaveRoom implementation:
            // const room = this.rooms.get(roomId);
            // room.players = room.players.filter((p) => p.id !== player.id);
            // Yes, it mutates.
        }

        // Re-check player count after kicks
        if (room.players.length < 2) {
            socket.emit(SocketEvents.ERROR, { message: 'Not enough ready players to start (minimum 2)' });
            return;
        }

        room.gameState = 'word-selection';
        room.currentRound = 1;

        // Reset all players
        room.players.forEach((p) => {
            p.score = 0;
            p.hasGuessed = false;
            p.isDrawing = false;
        });

        this.io.to(roomId).emit(SocketEvents.GAME_STARTED, { room });
        this.startNewRound(roomId);
    }

    private startNewRound(roomId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // Reset previous drawer
        room.players.forEach((p) => {
            p.isDrawing = false;
        });

        // Select drawer using round-robin (rotate through players)
        const drawerIndex = (room.currentRound - 1) % room.players.length;
        const drawer = room.players[drawerIndex];
        room.drawingPlayerId = drawer.id;
        drawer.isDrawing = true;

        // Reset guessed status
        room.players.forEach((p) => {
            p.hasGuessed = false;
        });

        // Reset revealed letters
        room.revealedLetters = {};

        // Generate word options
        const wordList = room.customWords.length > 0 ? room.customWords : DEFAULT_WORDS;
        room.wordOptions = [
            selectRandomWord(wordList),
            selectRandomWord(wordList),
            selectRandomWord(wordList),
        ];

        room.gameState = 'word-selection';
        this.io.to(roomId).emit(SocketEvents.ROUND_START, { room });
    }

    selectWord(socket: Socket, payload: SelectWordPayload) {
        const room = this.rooms.get(payload.roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isDrawing) {
            socket.emit(SocketEvents.ERROR, { message: 'Only the drawer can select a word' });
            return;
        }

        room.currentWord = payload.word;
        room.gameState = 'drawing';
        room.roundStartTime = Date.now();

        // Notify drawer with the word
        socket.emit(SocketEvents.WORD_SELECTED, { word: payload.word });

        // Notify others without the word
        socket.to(payload.roomId).emit(SocketEvents.WORD_SELECTED, {
            word: payload.word.replace(/./g, '_'),
            wordLength: payload.word.length,
        });

        this.io.to(payload.roomId).emit(SocketEvents.ROOM_UPDATED, { room });

        // Start round timer
        this.startRoundTimer(payload.roomId);
    }

    private startRoundTimer(roomId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        this.clearRoundTimer(roomId);

        const timer = setTimeout(() => {
            this.endRound(roomId);
        }, room.roundDuration * 1000);

        this.roundTimers.set(roomId, timer);
    }

    private clearRoundTimer(roomId: string) {
        const timer = this.roundTimers.get(roomId);
        if (timer) {
            clearTimeout(timer);
            this.roundTimers.delete(roomId);
        }
    }

    private endRound(roomId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        this.clearRoundTimer(roomId);
        room.gameState = 'round-end';

        this.io.to(roomId).emit(SocketEvents.ROUND_END, {
            word: room.currentWord,
            scores: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
        });

        // Check if game should end
        if (room.currentRound >= room.totalRounds) {
            setTimeout(() => this.endGame(roomId), 5000);
        } else {
            setTimeout(() => {
                room.currentRound++;
                this.startNewRound(roomId);
            }, 5000);
        }
    }

    private endGame(roomId: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.gameState = 'game-end';

        const finalScores = room.players
            .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score }))
            .sort((a, b) => b.score - a.score);

        this.io.to(roomId).emit(SocketEvents.GAME_END, { scores: finalScores });
        this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });

        // Removed automatic reset to lobby to allow admin to deciding when to restart
        // The restartGame method (implemented earlier) handles the reset.
    }

    handleDraw(socket: Socket, payload: DrawPayload) {
        const room = this.rooms.get(payload.roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isDrawing) return;

        socket.to(payload.roomId).emit(SocketEvents.DRAW_UPDATE, { stroke: payload.stroke });
    }

    clearCanvas(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isDrawing) return;

        this.io.to(roomId).emit(SocketEvents.CANVAS_CLEARED);
    }

    handleMessage(socket: Socket, payload: SendMessagePayload) {
        const room = this.rooms.get(payload.roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player) return;

        // Don't allow drawer to guess
        if (player.isDrawing) return;

        const message: Message = {
            id: generateMessageId(),
            playerId: player.id,
            playerName: player.name,
            content: payload.content,
            timestamp: Date.now(),
        };

        // Check if guess is correct
        if (
            room.gameState === 'drawing' &&
            room.currentWord &&
            payload.content.toLowerCase().trim() === room.currentWord.toLowerCase() &&
            !player.hasGuessed
        ) {
            player.hasGuessed = true;
            message.isCorrectGuess = true;

            // Calculate points
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

            this.io.to(payload.roomId).emit(SocketEvents.ROOM_UPDATED, { room });

            // Check if all players have guessed
            const allGuessed = room.players.filter((p) => !p.isDrawing).every((p) => p.hasGuessed);
            if (allGuessed) {
                this.endRound(payload.roomId);
            }
        } else {
            // Check for partial matches to reveal letters
            if (
                room.gameState === 'drawing' &&
                room.currentWord &&
                !player.hasGuessed
            ) {
                const targetWord = room.currentWord.toLowerCase();
                const guessWord = payload.content.toLowerCase().trim();

                // Only process if guess is same length (common heuristic) or close enough
                // For simplicity, let's just check if letters exist in the word

                // Initialize revealed letters for player if not exists
                if (!room.revealedLetters[player.id]) {
                    room.revealedLetters[player.id] = [];
                }

                const currentRevealed = new Set(room.revealedLetters[player.id]);
                let newReveal = false;

                // Simple mechanism: reveal letters that are in the correct position if guess is close?
                // OR: simple heuristic - if they type a word that shares letters, reveal those letters?
                // Requirement: "correct words letter in the correct places on word from messages from users that did not guess the entire word"

                // Let's implement: If a letter in the guess matches the letter in the target word at the SAME position, reveal it.
                // BUT: Do not reveal ALL letters (never complete the word).

                const maxLength = Math.min(targetWord.length, guessWord.length);
                const unrevealedIndices = [];

                for (let i = 0; i < targetWord.length; i++) {
                    if (!currentRevealed.has(i)) {
                        unrevealedIndices.push(i);
                    }
                }

                // If only 1 or 0 letters left hidden, don't reveal more to prevent auto-solving
                if (unrevealedIndices.length > 1) {
                    for (let i = 0; i < maxLength; i++) {
                        if (targetWord[i] === guessWord[i] && !currentRevealed.has(i)) {
                            // Check again to ensure we don't reveal the LAST hidden letter
                            // We re-calculate unrevealed count considering this potential reveal
                            if (unrevealedIndices.length - (newReveal ? 1 : 0) > 1) {
                                currentRevealed.add(i);
                                newReveal = true;

                                // Update unrevealed list for next iteration check involves complexity, 
                                // simplified: just add it, but strictly we should track.
                                // Actually, let's be safe: stop revealing if we are about to reveal the whole word.
                                // Re-check unrevealed count
                                let remaining = 0;
                                for (let k = 0; k < targetWord.length; k++) if (!currentRevealed.has(k)) remaining++;
                                if (remaining < 1) {
                                    currentRevealed.delete(i); // Oops, don't reveal this one
                                    newReveal = false;
                                    break;
                                }
                            }
                        }
                    }
                }

                if (newReveal) {
                    room.revealedLetters[player.id] = Array.from(currentRevealed);

                    // Send update to player
                    // Construct hint word: replace unrevealed with underscores
                    let hintWord = '';
                    for (let i = 0; i < targetWord.length; i++) {
                        if (currentRevealed.has(i) || targetWord[i] === ' ' || targetWord[i] === '-') {
                            hintWord += room.currentWord[i]; // Use original case
                        } else {
                            hintWord += '_';
                        }
                    }

                    // Send private update to the guesser
                    this.io.to(socket.id).emit(SocketEvents.WORD_HINT_UPDATE, {
                        playerId: player.id,
                        revealedPositions: Array.from(currentRevealed),
                        hintWord
                    });

                    // Also update room state (though we might not want to broadcast everyone's hints to everyone logic-wise unless we want to, 
                    // but typically hints are personal? Or global?
                    // "Add correct words letter in the correct places on word from messages from users that did not guess the entire word"
                    // Usually in Pictionary, hints are often global (time based) or personal (partial guess). 
                    // Let's assume personal based on the flow.
                    // However, we updated the Room object, so we should allow syncing.
                    // Note: sending ROOM_UPDATED reveals it to everyone if we include it in the room object sent to everyone.
                    // Strategy: The Room object has `revealedLetters` map. Everyone receives it.
                    // Frontend will choose to render `revealedLetters[myId]`.
                    this.io.to(payload.roomId).emit(SocketEvents.ROOM_UPDATED, { room });
                }
            }

            this.io.to(payload.roomId).emit(SocketEvents.NEW_MESSAGE, { message });
        }
    }

    restartGame(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player || !player.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Only admin can restart the game' });
            return;
        }

        // Reset game state but keep players and admin
        room.gameState = 'lobby';
        room.currentRound = 0;
        room.currentWord = null;
        room.wordOptions = [];
        room.drawingPlayerId = null;
        room.roundStartTime = null;

        // Reset player states but preserve admin
        room.players.forEach((p) => {
            p.score = 0;
            p.isDrawing = false;
            p.hasGuessed = false;
            p.isReady = false;
        });

        this.clearRoundTimer(roomId);
        this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
        console.log(`Game restarted in room ${roomId}`);
    }

    setPlayerReady(socket: Socket) {
        const roomId = this.playerRooms.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (!room) return;

        const player = room.players.find((p) => p.id === socket.data.playerId);
        if (!player) return;

        player.isReady = !player.isReady;
        this.io.to(roomId).emit(SocketEvents.PLAYER_READY, { playerId: player.id, isReady: player.isReady });
        this.io.to(roomId).emit(SocketEvents.ROOM_UPDATED, { room });
    }

    kickPlayer(socket: Socket, payload: { roomId: string; playerId: string }) {
        const room = this.rooms.get(payload.roomId);
        if (!room) return;

        const admin = room.players.find((p) => p.id === socket.data.playerId);
        if (!admin || !admin.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Only admin can kick players' });
            return;
        }

        const targetPlayer = room.players.find((p) => p.id === payload.playerId);
        if (!targetPlayer) return;

        if (targetPlayer.isAdmin) {
            socket.emit(SocketEvents.ERROR, { message: 'Cannot kick the admin' });
            return;
        }

        // Find the socket of the player to kick
        const targetSocketId = Array.from(this.playerRooms.entries())
            .find(([_, rid]) => rid === payload.roomId &&
                this.io.sockets.sockets.get(_)?.data.playerId === payload.playerId)?.[0];

        if (targetSocketId) {
            const targetSocket = this.io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.emit(SocketEvents.PLAYER_KICKED, { message: 'You have been kicked from the room' });
                this.leaveRoom(targetSocket);
            }
        }

        console.log(`Player ${targetPlayer.name} kicked from room ${payload.roomId}`);
    }

    handleDisconnect(socket: Socket) {
        this.leaveRoom(socket);
    }
}
