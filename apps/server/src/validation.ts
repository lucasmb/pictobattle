import { z } from 'zod';
import { MAX_ROUNDS, MIN_ROUNDS } from '@pictobattle/shared';

export const createRoomSchema = z.object({
    playerName: z.string().trim().min(1, 'Player name is required').max(30, 'Player name is too long'),
    playerAvatar: z.string().min(1).max(16, 'Avatar is invalid'),
    clientId: z.string().min(1).max(64, 'Client id is invalid'),
    roomName: z.string().trim().min(1).max(30, 'Room name is too long').optional(),
    customWords: z
        .array(z.string().trim().min(1).max(30, 'Custom word is too long'))
        .max(50, 'Too many custom words')
        .optional(),
    totalRounds: z.number().int().min(MIN_ROUNDS).max(MAX_ROUNDS).optional(),
    isPublic: z.boolean().optional(),
});

export const joinRoomSchema = z.object({
    roomId: z.string().trim().min(1).max(20, 'Room id is invalid'),
    playerName: z.string().trim().min(1, 'Player name is required').max(30, 'Player name is too long'),
    playerAvatar: z.string().min(1).max(16, 'Avatar is invalid'),
    clientId: z.string().min(1).max(64, 'Client id is invalid'),
});

export const selectWordSchema = z.object({
    roomId: z.string().trim().min(1).max(20, 'Room id is invalid'),
    word: z.string().trim().min(1).max(50, 'Word is invalid'),
});

export const drawPointSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    color: z.string().max(16),
    size: z.number().finite(),
    isEraser: z.boolean().optional(),
});

export const drawStrokeSchema = z.object({
    points: z.array(drawPointSchema).max(2000),
    timestamp: z.number().finite(),
});

export const drawPayloadSchema = z.object({
    roomId: z.string().trim().min(1).max(20, 'Room id is invalid'),
    stroke: drawStrokeSchema,
});

export const sendMessageSchema = z.object({
    roomId: z.string().trim().min(1).max(20, 'Room id is invalid'),
    content: z.string().trim().min(1, 'Message is empty').max(200, 'Message is too long'),
});

export const kickPlayerSchema = z.object({
    roomId: z.string().trim().min(1).max(20, 'Room id is invalid'),
    playerId: z.string().trim().min(1).max(64, 'Player id is invalid'),
});