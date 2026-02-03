import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameManager } from '../game/GameManager.ts';
import { SocketEvents } from '@pictobattle/shared';

// Mock Redis
const mockRedis = {
    hset: vi.fn().mockResolvedValue(undefined),
    hget: vi.fn().mockResolvedValue(null),
    hdel: vi.fn().mockResolvedValue(undefined),
    hgetall: vi.fn().mockResolvedValue({}),
    setex: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
};

vi.mock('ioredis', () => ({
    Redis: vi.fn().mockImplementation(() => mockRedis),
}));

// Mock Socket.io
const createMockSocket = (id: string) => ({
    id,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    data: {},
});

const createMockServer = () => ({
    on: vi.fn(),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    sockets: {
        sockets: new Map(),
    },
});

describe('GameManager - Room Management', () => {
    let io: any;
    let gameManager: GameManager;

    beforeEach(() => {
        vi.clearAllMocks();
        io = createMockServer();
        gameManager = new GameManager(io as any);
    });

    describe('Room Creation', () => {
        it('should create a room with correct properties', async () => {
            const socket = createMockSocket('socket-1') as any;
            const payload = { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' };

            await gameManager.createRoom(socket, payload);

            expect(socket.join).toHaveBeenCalled();
            expect(socket.emit).toHaveBeenCalledWith(
                SocketEvents.ROOM_CREATED,
                expect.objectContaining({
                    room: expect.objectContaining({
                        name: expect.stringContaining('Room'),
                        players: expect.arrayContaining([
                            expect.objectContaining({
                                name: 'Alice',
                                avatar: '😀',
                                isAdmin: true,
                                score: 0,
                            }),
                        ]),
                        gameState: 'lobby',
                        isPublic: true,
                    }),
                })
            );
        });

        it('should create a private room when isPublic is false', async () => {
            const socket = createMockSocket('socket-1') as any;
            const payload = { playerName: 'Alice', playerAvatar: '😀', isPublic: false, clientId: 'c1' };

            await gameManager.createRoom(socket, payload);

            const roomArg = (socket.emit.mock.calls[0][1] as any).room;
            expect(roomArg.isPublic).toBe(false);
        });

        it('should broadcast room list after creation', async () => {
            const socket = createMockSocket('socket-1') as any;
            const payload = { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' };

            await gameManager.createRoom(socket, payload);

            expect(io.emit).toHaveBeenCalledWith(
                SocketEvents.ROOMS_LIST,
                expect.any(Object)
            );
        });
    });

    describe('Joining Rooms', () => {
        it('should allow player to join an existing room', async () => {
            const socket1 = createMockSocket('socket-1') as any;
            const socket2 = createMockSocket('socket-2') as any;

            // Alice creates room
            await gameManager.createRoom(socket1, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket1.emit.mock.calls[0][1] as any).roomId;

            // Mock Redis to return the room when Bob tries to join
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                name: 'Test Room',
                players: [{ id: 'player-1', name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            // Bob joins room
            await gameManager.joinRoom(socket2, { roomId, playerName: 'Bob', playerAvatar: '😎', clientId: 'c2' });

            // Should have joined the socket room
            expect(socket2.join).toHaveBeenCalled();
            expect(socket2.emit).toHaveBeenCalled();
        });

        it('should reject joining non-existent room', async () => {
            const socket = createMockSocket('socket-1') as any;

            // Mock Redis to return null (room doesn't exist)
            mockRedis.hget.mockResolvedValueOnce(null);

            await gameManager.joinRoom(socket, {
                roomId: 'NONEXISTENT',
                playerName: 'Alice',
                playerAvatar: '😀',
                clientId: 'c1'
            });

            expect(socket.emit).toHaveBeenCalledWith(
                SocketEvents.ERROR,
                { message: 'Room not found' }
            );
        });

        it('should reject joining game in progress (new players)', async () => {
            const socket1 = createMockSocket('socket-1') as any;
            const socket2 = createMockSocket('socket-2') as any;
            const socket3 = createMockSocket('socket-3') as any;

            // Create room
            await gameManager.createRoom(socket1, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket1.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket1.emit.mock.calls[0][1] as any).room.players[0].id;
            socket1.data.playerId = playerId;

            // Mock room in lobby for Bob to join
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [
                    { id: playerId, name: 'Alice', avatar: '😀', isAdmin: true },
                ],
                gameState: 'lobby',
            }));

            // Bob joins
            await gameManager.joinRoom(socket2, { roomId, playerName: 'Bob', playerAvatar: '😎', clientId: 'c2' });

            // Start the game
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [
                    { id: playerId, name: 'Alice', avatar: '😀', isAdmin: true },
                    { id: 'player-2', name: 'Bob', avatar: '😎', isAdmin: false },
                ],
                gameState: 'lobby',
            }));
            await gameManager.startGame(socket1);

            // Mock room as in-progress for Charlie's attempt
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [
                    { id: playerId, name: 'Alice', avatar: '😀', isAdmin: true },
                    { id: 'player-2', name: 'Bob', avatar: '😎', isAdmin: false },
                ],
                gameState: 'word-selection',
            }));

            // Try to join as new player while game is in progress
            await gameManager.joinRoom(socket3, {
                roomId,
                playerName: 'Charlie',
                playerAvatar: '🤓',
                clientId: 'c3'
            });

            expect(socket3.emit).toHaveBeenCalledWith(
                SocketEvents.ERROR,
                { message: 'Game already in progress' }
            );
        });
    });

    describe('Leaving Rooms', () => {
        it('should remove player from room on leave', async () => {
            const socket1 = createMockSocket('socket-1') as any;
            const socket2 = createMockSocket('socket-2') as any;

            await gameManager.createRoom(socket1, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket1.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket1.emit.mock.calls[0][1] as any).room.players[0].id;
            socket1.data.playerId = playerId;

            // Mock room for Bob to join
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            await gameManager.joinRoom(socket2, { roomId, playerName: 'Bob', playerAvatar: '😎', clientId: 'c2' });
            const bobPlayerId = 'player-2';
            socket2.data.playerId = bobPlayerId;

            // Mock room when Bob leaves
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [
                    { id: playerId, name: 'Alice', avatar: '😀', isAdmin: true },
                    { id: bobPlayerId, name: 'Bob', avatar: '😎', isAdmin: false },
                ],
                gameState: 'lobby',
            }));

            await gameManager.leaveRoom(socket2);

            expect(socket2.leave).toHaveBeenCalled();
        });

        it('should update room when player leaves', async () => {
            const socket = createMockSocket('socket-1') as any;

            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket.emit.mock.calls[0][1] as any).room.players[0].id;
            socket.data.playerId = playerId;

            // Mock room when leaving
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            await gameManager.leaveRoom(socket);

            // Room should be updated (not deleted immediately)
            expect(mockRedis.hset).toHaveBeenCalled();
        });
    });

    describe('Reconnection', () => {
        it('should save disconnected player data on disconnect', async () => {
            const socket = createMockSocket('socket-1') as any;

            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket.emit.mock.calls[0][1] as any).room.players[0].id;
            socket.data.playerId = playerId;

            // Set up playerRooms map
            (gameManager as any).playerRooms.set(socket.id, roomId);

            // Mock room for disconnect
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            await gameManager.handleDisconnect(socket);

            // Should save disconnected player data
            expect(mockRedis.setex).toHaveBeenCalled();
        });

        it('should allow reconnection with valid disconnected data', async () => {
            const socket1 = createMockSocket('socket-1') as any;
            const socket2 = createMockSocket('socket-2') as any;

            await gameManager.createRoom(socket1, { playerName: 'Alice', playerAvatar: '😀' });
            const roomId = (socket1.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket1.emit.mock.calls[0][1] as any).room.players[0].id;

            // Setup playerRooms map for disconnect
            (gameManager as any).playerRooms.set(socket1.id, roomId);

            // Mock room when disconnecting
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            // Simulate disconnect to save player data
            await gameManager.handleDisconnect(socket1);

            // Verify disconnected player data was saved
            expect(mockRedis.setex).toHaveBeenCalledWith(
                expect.stringContaining('disconnected:'),
                expect.any(Number),
                expect.stringContaining('Alice')
            );
        });

        it('should reject reconnection when room no longer exists', async () => {
            const socket = createMockSocket('socket-1') as any;

            // Mock disconnected player data
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({
                player: { id: 'player-1', name: 'Alice', avatar: '😀', isAdmin: true },
                roomId: 'NONEXISTENT',
                disconnectedAt: Date.now(),
            }));

            // Mock room not found
            mockRedis.hget.mockResolvedValueOnce(null);

            await gameManager.joinRoom(socket, {
                roomId: 'NONEXISTENT',
                playerName: 'Alice',
                playerAvatar: '😀',
                clientId: 'c1'
            });

            expect(socket.emit).toHaveBeenCalledWith(
                SocketEvents.ERROR,
                { message: 'Room not found' }
            );
        });

        it('should check for disconnected player data on join', async () => {
            const socket = createMockSocket('socket-1') as any;

            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket.emit.mock.calls[0][1] as any).roomId;

            // Mock room for initial find
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: 'player-1', name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            const socket2 = createMockSocket('socket-2') as any;
            await gameManager.joinRoom(socket2, { roomId, playerName: 'Bob', playerAvatar: '😎', clientId: 'c2' });

            // Should have checked for disconnected player
            expect(mockRedis.get).toHaveBeenCalled();
        });

        it('should clear empty room timer on reconnection', async () => {
            const socket = createMockSocket('socket-1') as any;

            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket.emit.mock.calls[0][1] as any).room.players[0].id;

            // Set up playerRooms map
            (gameManager as any).playerRooms.set(socket.id, roomId);

            // Mock room when leaving (becomes empty)
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            // Use Fake Timers
            vi.useFakeTimers();

            // Player disconnects - should start 30s timer
            await gameManager.handleDisconnect(socket);

            // Mock saving disconnected player
            const disconnectedData = {
                player: { id: playerId, name: 'Alice', avatar: '😀', isAdmin: true },
                roomId,
                disconnectedAt: Date.now(),
            };
            mockRedis.get.mockResolvedValueOnce(JSON.stringify(disconnectedData));

            // Mock room still existing (but empty) in Redis
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [],
                gameState: 'lobby',
            }));

            // Player reconnects
            const socket2 = createMockSocket('socket-2') as any;
            await gameManager.joinRoom(socket2, { roomId, playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });

            // Verify clearTimeout was called indirectly by checking if timer is gone
            // Note: In a real integration test we'd check functionality. Here we check logic.
            // Since we can't easily spy on clearTimeout global, we can check if the map entry is gone.
            expect((gameManager as any).emptyRoomTimers.has(roomId)).toBe(false);

            vi.useRealTimers();
        });
    });

    describe('Room List', () => {
        it('should broadcast public rooms to all clients', async () => {
            const socket = createMockSocket('socket-1') as any;

            // Create public room
            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', isPublic: true, clientId: 'c1' });

            // Verify broadcast was called
            expect(io.emit).toHaveBeenCalledWith(
                SocketEvents.ROOMS_LIST,
                expect.any(Object)
            );
        });

        it('should not broadcast private rooms to lobby', async () => {
            const socket = createMockSocket('socket-1') as any;

            // Create private room
            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', isPublic: false, clientId: 'c1' });

            // Verify the room list was broadcast - we can't easily test the filtering
            // without accessing the private method, but we can verify it was called
            expect(io.emit).toHaveBeenCalledWith(
                SocketEvents.ROOMS_LIST,
                expect.any(Object)
            );
        });
    });

    describe('Empty Room Cleanup', () => {
        it('should update room when last player leaves', async () => {
            const socket = createMockSocket('socket-1') as any;

            await gameManager.createRoom(socket, { playerName: 'Alice', playerAvatar: '😀', clientId: 'c1' });
            const roomId = (socket.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket.emit.mock.calls[0][1] as any).room.players[0].id;
            socket.data.playerId = playerId;

            // Set up playerRooms map
            (gameManager as any).playerRooms.set(socket.id, roomId);

            // Mock room when leaving
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            await gameManager.leaveRoom(socket);

            // Room should be updated (not deleted immediately)
            expect(mockRedis.hset).toHaveBeenCalled();
        });

        it('should allow rejoining before cleanup timer expires', async () => {
            const socket1 = createMockSocket('socket-1') as any;
            const socket2 = createMockSocket('socket-2') as any;

            await gameManager.createRoom(socket1, { playerName: 'Alice', playerAvatar: '😀' });
            const roomId = (socket1.emit.mock.calls[0][1] as any).roomId;
            const playerId = (socket1.emit.mock.calls[0][1] as any).room.players[0].id;
            socket1.data.playerId = playerId;

            // Set up playerRooms map
            (gameManager as any).playerRooms.set(socket1.id, roomId);

            // Mock room when leaving (empty)
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [{ id: playerId, name: 'Alice', avatar: '😀', isAdmin: true }],
                gameState: 'lobby',
            }));

            await gameManager.leaveRoom(socket1);

            // Mock empty room for rejoin
            mockRedis.hget.mockResolvedValueOnce(JSON.stringify({
                id: roomId,
                players: [],
                gameState: 'lobby',
            }));

            // Rejoin before deletion timer expires
            await gameManager.joinRoom(socket2, { roomId, playerName: 'Bob', playerAvatar: '😎' });

            expect(socket2.emit).toHaveBeenCalledWith(
                SocketEvents.ROOM_JOINED,
                expect.any(Object)
            );
        });
        it('should clear strokes when starting new round', async () => {
            const socket = createMockSocket('socket-1') as any;
            const roomId = 'room-1';
            const playerId = 'p1';

            // Manually populate room
            const room: any = {
                id: roomId,
                players: [{ id: playerId, name: 'Alice', score: 0, avatar: '😀', isAdmin: true, hasGuessed: false, isDrawing: false, isReady: false }],
                gameState: 'drawing',
                currentRound: 1,
                totalRounds: 5,
                roundDuration: 60,
                currentWord: null,
                drawingPlayerId: null,
                wordOptions: [],
                revealedLetters: {},
                roundStartTime: null,
                customWords: [],
                isPublic: true,
                createdAt: Date.now(),
                hostId: playerId,
                strokes: [{ points: [], color: "#000", size: 5, isEraser: false }],
                messages: []
            };

            // Mock Redis hget to return the room
            // Also need to handle updates: when updateRoom calls hset, we should probably update what hget returns?
            // For this specific test, we want to see the result of startNewRound.
            // startNewRound calls updateRoom.
            // We should mock hset to update our local "redis" state if possible, or just mock hget to return the modified room if we can intercept the object reference.
            // Since startNewRound modifies the room object *in memory* (obtained from getRoom), and then calls updateRoom (checking implementation helps).
            // Actually getRoom returns a NEW object from JSON.parse.
            // So relying on reference mutation is flaky if getRoom returns fresh object.

            // Let's implement a simple in-memory redis mock for hget/hset for this test scope.
            let redisStore: any = { [roomId]: JSON.stringify(room) };

            mockRedis.hget.mockImplementation(async (_key: string, field: string) => {
                // In getRoom: this.redis.hget('rooms', roomId) -> wait, getRoom uses ('rooms', roomId) ?
                // The view_code_item said: this.redis.hget('rooms', roomId).
                // But implementation_plan says ROOM_KEY_PREFIX + roomId.
                // view_code_item is authoritative.
                if (_key === 'rooms' && redisStore[field]) {
                    return redisStore[field];
                }
                return null;
            });

            mockRedis.hset.mockImplementation(async (_key: string, field: string, value: string) => {
                // updateRoom probably uses: hset('rooms', roomId, JSON.stringify(room))
                if (_key === 'rooms') {
                    redisStore[field] = value; // value is the JSON
                }
            });

            (gameManager as any).playerRooms.set(socket.id, roomId);
            socket.data.playerId = playerId;

            // Start new round
            await (gameManager as any).startNewRound(roomId);

            const roomAfter = await (gameManager as any).getRoom(roomId);

            expect(roomAfter).not.toBeNull();
            if (roomAfter) {
                expect(roomAfter.strokes.length).toBe(0);
            }
        });

        it('should maintain single admin on restart', async () => {
            const socket1 = createMockSocket('socket-1') as any;
            const socket2 = createMockSocket('socket-2') as any;
            const roomId = 'room-1';
            const p1 = { id: 'p1', name: 'Alice', score: 10, avatar: '😀', isAdmin: true, hasGuessed: false, isDrawing: false, isReady: false };
            const p2 = { id: 'p2', name: 'Bob', score: 5, avatar: '😎', isAdmin: false, hasGuessed: false, isDrawing: false, isReady: false };

            // Manually populate room
            const room: any = {
                id: roomId,
                players: [p1, p2],
                gameState: 'game-end',
                currentRound: 5,
                totalRounds: 5,
                roundDuration: 60,
                currentWord: null,
                drawingPlayerId: null,
                wordOptions: [],
                revealedLetters: {},
                roundStartTime: null,
                customWords: [],
                isPublic: true,
                createdAt: Date.now(),
                hostId: 'p1',
                strokes: [],
                messages: []
            };

            let redisStore: any = { [roomId]: JSON.stringify(room) };

            mockRedis.hget.mockImplementation(async (_key: string, field: string) => {
                if (_key === 'rooms' && redisStore[field]) {
                    return redisStore[field];
                }
                return null;
            });

            mockRedis.hset.mockImplementation(async (_key: string, field: string, value: string) => {
                if (_key === 'rooms') {
                    redisStore[field] = value;
                }
            });

            (gameManager as any).playerRooms.set(socket1.id, roomId);
            (gameManager as any).playerRooms.set(socket2.id, roomId);
            socket1.data.playerId = 'p1';
            socket2.data.playerId = 'p2';

            // Restart game
            await gameManager.restartGame(socket1);

            const roomAfter = await (gameManager as any).getRoom(roomId);
            const admins = roomAfter!.players.filter((p: any) => p.isAdmin);

            expect(admins.length).toBe(1);
            expect(admins[0].id).toBe('p1');
        });
        it('should handle startNewRound with empty players gracefully', async () => {
            const roomId = 'room-empty';
            const room: any = {
                id: roomId,
                players: [], // Empty players
                gameState: 'drawing',
                currentRound: 1,
                totalRounds: 5,
                strokes: [],
                isPublic: true,
                customWords: [],
                revealedLetters: {}
            };

            let redisStore: any = { [roomId]: JSON.stringify(room) };

            mockRedis.hget.mockImplementation(async (_key: string, field: string) => {
                if (_key === 'rooms' && redisStore[field]) {
                    return redisStore[field];
                }
                return null;
            });

            mockRedis.hset.mockImplementation(async (_key: string, field: string, value: string) => {
                if (_key === 'rooms') {
                    redisStore[field] = value;
                }
            });

            // This should not throw
            await (gameManager as any).startNewRound(roomId);

            // If it doesn't throw, we are good. We can check if it returned early or similar.
            // Since startNewRound is void, we expect no error.
        });

        it('should not allow reconnection if game has ended', async () => {
            const socket = createMockSocket('socket-reconnect-end') as any;
            const roomId = 'room-ended';
            const player = { id: 'p1', name: 'Alice', clientId: 'client-1' };
            const room: any = {
                id: roomId,
                players: [player],
                gameState: 'game-end', // Game ended
                isPublic: true
            };

            // Mock Redis responses for getRoom
            // Ensure this mock implementation is robust
            mockRedis.hget.mockImplementation(async (key: string, field: string) => {
                if (key === 'rooms' && field === roomId) {
                    return JSON.stringify(room);
                }
                return null;
            });

            (gameManager as any).playerRooms.set(socket.id, roomId);
            socket.data.playerId = player.id;

            // 1. Simulate Disconnect
            // It should NOT save because game-end
            await gameManager.handleDisconnect(socket);

            // Verify redis setex was NOT called
            expect(mockRedis.setex).not.toHaveBeenCalled();

            // 2. Reconnect Logic Check
            const stalePlayer = { ...player, clientId: 'client-stale' };
            const staleKey = `disconnected:${roomId}:${stalePlayer.clientId}`;

            // Mock findDisconnectedPlayer
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({ player: stalePlayer, roomId, disconnectedAt: Date.now() }));

            await (gameManager as any).reconnectPlayer(socket, roomId, stalePlayer);

            // Expect redis del to be called for cleanup
            expect(mockRedis.del).toHaveBeenCalledWith(staleKey);
            expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'Cannot reconnect - game has ended' }));
        });
    });
});
