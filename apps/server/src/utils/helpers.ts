export function generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function selectRandomWord(words: string[]): string {
    return words[Math.floor(Math.random() * words.length)];
}

export function selectRandomPlayer<T>(players: T[]): T {
    return players[Math.floor(Math.random() * players.length)];
}
