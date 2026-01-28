import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameManager } from '../game/GameManager.ts';
import { SocketEvents } from '@pictobattle/shared';

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

describe('GameManager', () => {
    let io: any;
    let gameManager: GameManager;

    beforeEach(() => {
        io = createMockServer();
        gameManager = new GameManager(io as any);
    });

    it('should create a room', () => {
        const socket = createMockSocket('socket-1') as any;
        const payload = { playerName: 'Alice', playerAvatar: '😀' };

        gameManager.createRoom(socket, payload);

        expect(socket.join).toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith(SocketEvents.ROOM_CREATED, expect.objectContaining({
            room: expect.objectContaining({
                players: expect.arrayContaining([
                    expect.objectContaining({ name: 'Alice' })
                ])
            })
        }));
    });

    it('should join an existing room', () => {
        const socket1 = createMockSocket('socket-1') as any;
        const socket2 = createMockSocket('socket-2') as any;

        // Alice creates room
        gameManager.createRoom(socket1, { playerName: 'Alice', playerAvatar: '😀' });
        const roomId = (socket1.emit.mock.calls[0][1] as any).roomId;

        // Bob joins room
        gameManager.joinRoom(socket2, { roomId, playerName: 'Bob', playerAvatar: '😎' });

        expect(socket2.join).toHaveBeenCalledWith(roomId);
        expect(socket2.emit).toHaveBeenCalledWith(SocketEvents.ROOM_JOINED, expect.any(Object));
    });
});
