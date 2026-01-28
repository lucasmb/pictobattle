import { useGameStore } from '../store/gameStore';
import { Trophy, Medal } from 'lucide-react';

export function Scoreboard() {
    const { room, currentPlayerId, restartGame } = useGameStore();

    if (!room || room.gameState !== 'game-end') return null;

    const currentPlayer = room.players.find((p) => p.id === currentPlayerId);
    const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="card bg-base-100 shadow-2xl max-w-2xl w-full">
                <div className="card-body">
                    <h2 className="text-3xl font-bold text-center mb-6">
                        🎉 Game Over! 🎉
                    </h2>

                    <div className="space-y-3">
                        {sortedPlayers.map((player, index) => (
                            <div
                                key={player.id}
                                className={`flex items-center justify-between p-4 rounded-lg ${index === 0
                                    ? 'bg-warning text-warning-content'
                                    : index === 1
                                        ? 'bg-info text-info-content'
                                        : index === 2
                                            ? 'bg-accent text-accent-content'
                                            : 'bg-base-200'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="text-2xl font-bold w-8">#{index + 1}</div>
                                    {index === 0 && <Trophy size={24} />}
                                    {index === 1 && <Medal size={24} />}
                                    {index === 2 && <Medal size={24} />}
                                    <span className="text-3xl">{player.avatar}</span>
                                    <span className="text-xl font-semibold">{player.name}</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-bold">{player.score}</div>
                                    <div className="text-sm opacity-70">points</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Show restart button for admin, waiting message for others */}
                    {currentPlayer?.isAdmin ? (
                        <div className="mt-8 flex justify-center">
                            <button
                                className="btn btn-primary btn-lg gap-2"
                                onClick={restartGame}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74-2.74L3 12" /><path d="M3 3v9h9" /></svg>
                                Restart Game
                            </button>
                        </div>
                    ) : (
                        <div className="alert alert-info mt-6">
                            <span>Waiting for admin to restart the game...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
