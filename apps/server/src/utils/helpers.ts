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
    if (words.length === 0) {
        throw new Error('Cannot select a word from an empty list');
    }
    return words[Math.floor(Math.random() * words.length)]!;
}

export function selectRandomPlayer<T>(players: T[]): T {
    if (players.length === 0) {
        throw new Error('Cannot select a player from an empty list');
    }
    return players[Math.floor(Math.random() * players.length)]!;
}

export function getLevenshteinDistance(a: string, b: string): number {
    const rows = b.length + 1;
    const cols = a.length + 1;
    const matrix: number[][] = Array.from({ length: rows }, (_, i) =>
        Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );

    for (let i = 1; i < rows; i++) {
        const row = matrix[i]!;
        for (let j = 1; j < cols; j++) {
            const cost = b[i - 1] === a[j - 1] ? 0 : 1;
            row[j] = Math.min(
                matrix[i - 1]![j]! + 1,
                row[j - 1]! + 1,
                matrix[i - 1]![j - 1]! + cost,
            );
        }
    }

    return matrix[b.length]![a.length]!;
}