import { useGameStore } from '../store/gameStore';
import { Crown, Pencil, Check } from 'lucide-react';

export function PlayerList() {
    const { room, currentPlayerId, kickPlayer } = useGameStore();

    if (!room) return null;

    const currentPlayer = room.players.find((p) => p.id === currentPlayerId);
    const isAdmin = currentPlayer?.isAdmin;
    const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

    return (
        <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4">
                <h3 className="font-semibold mb-3">
                    Players ({room.players.length})
                </h3>

                <div className="space-y-2">
                    {sortedPlayers.map((player) => (
                        <div
                            key={player.id}
                            className={`flex items-center justify-between p-3 rounded-lg ${player.isDrawing
                                ? 'bg-primary text-primary-content'
                                : player.hasGuessed
                                    ? 'bg-success/20'
                                    : 'bg-base-200'
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">{player.avatar}</span>
                                <div>
                                    <div className="flex items-center gap-1">
                                        <span className="font-semibold">{player.name}</span>
                                        {player.isAdmin && (
                                            <Crown size={14} className="text-warning" />
                                        )}
                                        {player.isDrawing && (
                                            <Pencil size={14} className="text-primary-content" />
                                        )}
                                        {room.gameState === 'lobby' && player.isReady && (
                                            <span className="badge badge-success badge-sm gap-1">
                                                <Check size={10} /> Ready
                                            </span>
                                        )}
                                    </div>
                                    {player.hasGuessed && (
                                        <span className="text-xs text-success">Guessed!</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <div className="font-bold text-lg">{player.score}</div>
                                    <div className="text-xs opacity-70">points</div>
                                </div>

                                {isAdmin && !player.isAdmin && (
                                    <button
                                        className="btn btn-ghost btn-xs text-error tooltip tooltip-left"
                                        data-tip="Kick Player"
                                        onClick={() => confirm(`Kick ${player.name}?`) && kickPlayer(player.id)}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
