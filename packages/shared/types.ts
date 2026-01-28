export interface Player {
    id: string;
    name: string;
    avatar: string;
    score: number;
    isAdmin: boolean;
    isDrawing: boolean;
    hasGuessed: boolean;
    isReady: boolean;
}

export interface DrawPoint {
    x: number;
    y: number;
    color: string;
    size: number;
    isEraser?: boolean;
}

export interface DrawStroke {
    points: DrawPoint[];
    timestamp: number;
}

export interface Message {
    id: string;
    playerId: string;
    playerName: string;
    content: string;
    timestamp: number;
    isCorrectGuess?: boolean;
}

export interface Room {
    id: string;
    name: string;
    players: Player[];
    currentRound: number;
    totalRounds: number;
    currentWord: string | null;
    wordOptions: string[];
    drawingPlayerId: string | null;
    roundStartTime: number | null;
    roundDuration: number; // in seconds
    gameState: 'lobby' | 'word-selection' | 'drawing' | 'round-end' | 'game-end';
    customWords: string[];
    revealedLetters: Record<string, number[]>; // playerId -> array of revealed indices
}

export interface RoomSummary {
    id: string;
    name: string;
    players: number;
    maxPlayers: number;
    gameState: 'lobby' | 'word-selection' | 'drawing' | 'round-end' | 'game-end';
}

export interface GameSettings {
    totalRounds: number;
    roundDuration: number;
    pointsForCorrectGuess: number;
    bonusPointsForFirstGuess: number;
}

// Socket Event Types
export enum SocketEvents {
    // Connection
    CONNECT = 'connect',
    DISCONNECT = 'disconnect',

    // Room Management
    CREATE_ROOM = 'create_room',
    JOIN_ROOM = 'join_room',
    LEAVE_ROOM = 'leave_room',
    ROOM_CREATED = 'room_created',
    ROOM_JOINED = 'room_joined',
    ROOM_UPDATED = 'room_updated',
    PLAYER_JOINED = 'player_joined',
    PLAYER_LEFT = 'player_left',
    GET_ROOMS = 'get_rooms',
    ROOMS_LIST = 'rooms_list',

    // Game Flow
    START_GAME = 'start_game',
    GAME_STARTED = 'game_started',
    RESTART_GAME = 'restart_game',
    SELECT_WORD = 'select_word',
    WORD_SELECTED = 'word_selected',
    ROUND_START = 'round_start',
    ROUND_END = 'round_end',
    GAME_END = 'game_end',
    PLAYER_READY = 'player_ready',
    KICK_PLAYER = 'kick_player',
    PLAYER_KICKED = 'player_kicked',
    WORD_HINT_UPDATE = 'word_hint_update',

    // Drawing
    DRAW = 'draw',
    DRAW_UPDATE = 'draw_update',
    CLEAR_CANVAS = 'clear_canvas',
    CANVAS_CLEARED = 'canvas_cleared',

    // Chat & Guessing
    SEND_MESSAGE = 'send_message',
    NEW_MESSAGE = 'new_message',
    CORRECT_GUESS = 'correct_guess',

    // Errors
    ERROR = 'error',
}

// Socket Event Payloads
export interface CreateRoomPayload {
    playerName: string;
    playerAvatar: string;
    roomName?: string;
    customWords?: string[];
}

export interface JoinRoomPayload {
    roomId: string;
    playerName: string;
    playerAvatar: string;
}

export interface SelectWordPayload {
    roomId: string;
    word: string;
}

export interface DrawPayload {
    roomId: string;
    stroke: DrawStroke;
}

export interface SendMessagePayload {
    roomId: string;
    content: string;
}

export interface KickPlayerPayload {
    roomId: string;
    playerId: string;
}

export interface WordHintPayload {
    playerId: string;
    revealedPositions: number[];
    hintWord: string;
}

export interface ErrorPayload {
    message: string;
    code?: string;
}
