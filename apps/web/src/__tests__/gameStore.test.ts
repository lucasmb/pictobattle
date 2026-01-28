import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';

// We need to mock socket.io-client to avoid actual connections
vi.mock('socket.io-client', () => ({
    io: vi.fn(() => ({
        on: vi.fn(),
        emit: vi.fn(),
        off: vi.fn(),
    })),
}));

describe('gameStore', () => {
    beforeEach(() => {
        // Reset store before each test if possible
    });

    it('should have initial state', () => {
        const state = useGameStore.getState();
        expect(state.room).toBeNull();
        expect(state.playerName).toBe('');
        expect(state.players).toEqual([]);
    });

    it('should set current player', () => {
        const { setPlayerInfo } = useGameStore.getState();
        setPlayerInfo('Alice', '😀');

        const state = useGameStore.getState();
        expect(state.playerName).toBe('Alice');
        expect(state.playerAvatar).toBe('😀');
    });
});
