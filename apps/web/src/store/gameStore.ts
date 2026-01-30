import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type {
    Room,
    Player,
    Message,
    DrawStroke,
    CreateRoomPayload,
    JoinRoomPayload,
    SelectWordPayload,
    DrawPayload,
    SendMessagePayload,
    RoomSummary,
} from '@pictobattle/shared';
import { playSound } from '../utils/SoundManager';

interface GameState {
    // Connection
    socket: Socket | null;
    isConnected: boolean;

    // Room
    roomId: string | null;
    room: Room | null;
    rooms: RoomSummary[];

    // Game
    playerName: string;
    playerAvatar: string;
    currentPlayerId: string | null;
    players: Player[];
    customWords: string[];

    // Chat
    messages: Message[];

    // Canvas
    strokes: DrawStroke[];

    // UI
    error: string | null;
    isLoading: boolean;

    // Actions
    connect: () => void;
    disconnect: () => void;
    setPlayerInfo: (name: string, avatar: string) => void;
    createRoom: (roomName?: string, customWords?: string[]) => void;
    joinRoom: (roomId: string) => void;
    leaveRoom: () => void;
    startGame: () => void;
    selectWord: (word: string) => void;
    sendDraw: (stroke: DrawStroke) => void;
    clearCanvas: () => void;
    sendMessage: (content: string) => void;
    clearError: () => void;
    restartGame: () => void;
    setReady: () => void;
    kickPlayer: (playerId: string) => void;
    getRooms: () => void;
}

// const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export const useGameStore = create<GameState>((set, get) => ({
    socket: null,
    isConnected: false,

    roomId: null,
    room: null,
    rooms: [],

    currentPlayerId: null,
    playerName: '',
    playerAvatar: '',
    players: [],
    customWords: [],

    messages: [],
    strokes: [],

    error: null,
    isLoading: false,

    // Connect to server
    connect: () => {
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
        console.log('Connecting to server at:', serverUrl);

        const socket = io(serverUrl, {
            transports: ['websocket'],
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            set({ isConnected: true, socket });
            // Request room list on connect
            socket.emit('get_rooms' as any);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected');
            set({ isConnected: false, socket: null });
        });

        // Room List Listener
        socket.on('rooms_list' as any, ({ rooms }: { rooms: RoomSummary[] }) => {
            set({ rooms });
        });

        // Sound Listeners
        socket.on('round_start' as any, () => {
            playSound('round-start');
        });

        socket.on('correct_guess' as any, () => {
            // Play sound only if it's correct guess
            playSound('correct-guess');
        });

        // Room events
        socket.on('room_created' as any, ({ roomId, room }: { roomId: string; room: Room }) => {
            // Find the current player (should be the admin/first player)
            const currentPlayer = room.players.find((p) => p.isAdmin);
            set({ roomId, room, currentPlayerId: currentPlayer?.id || null, isLoading: false });
        });

        socket.on('room_joined' as any, ({ room }: { room: Room }) => {
            // Find the current player (should be the last one added)
            const currentPlayer = room.players[room.players.length - 1];
            set({ room, currentPlayerId: currentPlayer?.id || null, isLoading: false });
        });

        socket.on('room_updated' as any, ({ room }: { room: Room }) => {
            set({ room });
        });

        socket.on('player_joined' as any, ({ player }: { player: Player }) => {
            console.log(`${player.name} joined the room`);
        });

        socket.on('player_left' as any, ({ playerId }: { playerId: string }) => {
            console.log(`Player ${playerId} left the room`);
        });

        // Game events
        socket.on('game_started' as any, ({ room }: { room: Room }) => {
            set({ room, messages: [], strokes: [] });
        });

        socket.on('round_start' as any, ({ room }: { room: Room }) => {
            set({ room, strokes: [], messages: [] });
        });

        socket.on('word_selected' as any, ({ word }: { word: string }) => {
            console.log('Word selected:', word);
        });

        socket.on('round_end' as any, ({ word }: { word: string; scores: any[] }) => {
            console.log('Round ended. Word was:', word);
            set((state) => ({
                messages: [
                    ...state.messages,
                    {
                        id: `system_${Date.now()}`,
                        playerId: 'system',
                        playerName: 'System',
                        content: `Round ended! The word was: ${word}`,
                        timestamp: Date.now(),
                    },
                ],
            }));
        });

        socket.on('game_end' as any, ({ scores }: { scores: any[] }) => {
            console.log('Game ended. Final scores:', scores);
        });

        // Drawing events
        socket.on('draw_update' as any, ({ stroke }: { stroke: DrawStroke }) => {
            set((state) => ({ strokes: [...state.strokes, stroke] }));
        });

        socket.on('canvas_cleared' as any, () => {
            set({ strokes: [] });
        });

        // Chat events
        socket.on('new_message' as any, ({ message }: { message: Message }) => {
            set((state) => ({ messages: [...state.messages, message] }));
        });

        socket.on('correct_guess' as any, ({ playerName, points, isFirstGuess }: any) => {
            set((state) => ({
                messages: [
                    ...state.messages,
                    {
                        id: `system_${Date.now()}`,
                        playerId: 'system',
                        playerName: 'System',
                        content: `${playerName} guessed correctly! +${points} points${isFirstGuess ? ' (First guess bonus!)' : ''}`,
                        timestamp: Date.now(),
                        isCorrectGuess: true,
                    },
                ],
            }));
        });

        // Error events
        socket.on('error' as any, ({ message }: { message: string }) => {
            set({ error: message, isLoading: false });
        });

        // New feature events
        socket.on('player_kicked' as any, ({ message }: { message: string }) => {
            set({ error: message, room: null, roomId: null });
            // Ideally redirect or show modal, error state will be picked up by UI
        });

        socket.on('restart_game' as any, () => {
            // Reset local ephemeral state
            set({ messages: [], strokes: [] });
        });

        socket.on('player_ready' as any, () => {
            // Handled via room_updated usually, but good for specific notifications if needed
        });

        // All destructured elements were unused, cleaned up.
        set({ socket });
    },

    // Disconnect from server
    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false, room: null, roomId: null });
        }
    },

    // Set player info
    setPlayerInfo: (name: string, avatar: string) => {
        set({ playerName: name, playerAvatar: avatar });
    },

    // Create room
    createRoom: (roomName?: string, customWords?: string[]) => {
        const { socket, playerName, playerAvatar } = get();
        if (!socket || !playerName) return;

        set({ isLoading: true, error: null });
        const payload: CreateRoomPayload = {
            playerName,
            playerAvatar,
            roomName,
            customWords,
        };
        socket.emit('create_room' as any, payload);
    },

    // Join room
    joinRoom: (roomId: string) => {
        const { socket, playerName, playerAvatar } = get();
        if (!socket || !playerName) return;

        set({ isLoading: true, error: null, roomId });
        const payload: JoinRoomPayload = {
            roomId,
            playerName,
            playerAvatar,
        };
        socket.emit('join_room' as any, payload);
    },

    // Leave room
    leaveRoom: () => {
        const { socket } = get();
        if (!socket) return;

        socket.emit('leave_room' as any);
        set({ room: null, roomId: null, messages: [], strokes: [] });
    },

    // Start game
    startGame: () => {
        const { socket } = get();
        if (!socket) return;

        socket.emit('start_game' as any);
    },

    // Select word
    selectWord: (word: string) => {
        const { socket, roomId } = get();
        if (!socket || !roomId) return;

        const payload: SelectWordPayload = { roomId, word };
        socket.emit('select_word' as any, payload);
    },

    // Send draw
    sendDraw: (stroke: DrawStroke) => {
        const { socket, roomId } = get();
        if (!socket || !roomId) return;

        set((state) => ({ strokes: [...state.strokes, stroke] }));
        const payload: DrawPayload = { roomId, stroke };
        socket.emit('draw' as any, payload);
    },

    // Clear canvas
    clearCanvas: () => {
        const { socket } = get();
        if (!socket) return;

        set({ strokes: [] });
        socket.emit('clear_canvas' as any);
    },

    // Send message
    sendMessage: (content: string) => {
        const { socket, roomId } = get();
        if (!socket || !roomId) return;

        const payload: SendMessagePayload = { roomId, content };
        socket.emit('send_message' as any, payload);
    },

    // Restart game
    restartGame: () => {
        const { socket } = get();
        if (!socket) return;
        socket.emit('restart_game' as any);
    },

    // Set ready
    setReady: () => {
        const { socket } = get();
        if (!socket) return;
        socket.emit('player_ready' as any);
    },

    // Kick player
    kickPlayer: (playerId: string) => {
        const { socket, roomId } = get();
        if (!socket || !roomId) return;

        const payload: ReturnType<any> = { roomId, playerId }; // explicit typing workaround
        socket.emit('kick_player' as any, payload);
    },

    getRooms: () => {
        const { socket } = get();
        if (!socket) return;
        socket.emit('get_rooms' as any);
    },

    // Clear error
    clearError: () => {
        set({ error: null });
    },
}));
