import { useGameStore } from '../store/gameStore';
import { LogOut, Play } from 'lucide-react';

export function GameControls() {
    const { room, startGame, leaveRoom, setReady, currentPlayerId, startGameCountdown } = useGameStore();

    if (!room) return null;

    const currentPlayer = room.players.find((p) => p.id === currentPlayerId);
    const isAdmin = currentPlayer?.isAdmin;
    const isReady = currentPlayer?.isReady;

    // Admin can start if everyone else is ready OR just start (backend handles logic/timeout)
    // For now, let's just show start button if admin.
    const canStartGame = isAdmin && room.gameState === 'lobby' && room.players.length >= 2;

    // Check if waiting for others
    const othersReady = room.players.filter(p => !p.isAdmin).every(p => p.isReady);

    return (
        <div className="card bg-base-100 shadow-xl">
            <div className="card-body p-4">
                <h3 className="font-semibold mb-3">Game Controls</h3>

                <div className="space-y-2">
                    {/* Countdown Display */}
                    {startGameCountdown !== null && startGameCountdown > 0 && (
                        <div className="alert alert-error py-3 shadow-lg border-2 border-error">
                            <div className="flex flex-col items-center w-full">
                                <span className="text-sm font-bold text-error-content uppercase tracking-wider">Starting in</span>
                                <span className="text-5xl font-black text-error-content my-1">{startGameCountdown}</span>
                                <span className="text-xs text-error-content font-semibold">Unready players will be kicked</span>
                            </div>
                        </div>
                    )}

                    {/* Admin Controls */}
                    {canStartGame && (
                        <div className="space-y-2">
                            <button
                                className={`btn w-full ${othersReady ? 'btn-success' : 'btn-warning'}`}
                                onClick={startGame}
                            >
                                <Play size={16} />
                                {othersReady ? 'Start Game' : 'Start (Kick Unready)'}
                            </button>
                            {!othersReady && (
                                <p className="text-xs text-center text-warning">Some players are not ready</p>
                            )}
                        </div>
                    )}

                    {/* Non-Admin Ready Control */}
                    {!isAdmin && room.gameState === 'lobby' && (
                        <button
                            className={`btn w-full ${isReady ? 'btn-success' : 'btn-outline'}`}
                            onClick={setReady}
                        >
                            {isReady ? 'Ready!' : 'Click to Ready Up'}
                        </button>
                    )}

                    {room.gameState === 'lobby' && !canStartGame && !isAdmin && (
                        <div className="alert alert-info py-2">
                            <span className="text-sm">
                                {isReady
                                    ? 'Waiting for admin to start...'
                                    : 'Please ready up!'}
                            </span>
                        </div>
                    )}

                    {room.gameState === 'lobby' && isAdmin && room.players.length < 2 && (
                        <div className="alert alert-info py-2">
                            <span className="text-sm">Waiting for more players...</span>
                        </div>
                    )}

                    <button className="btn btn-error btn-outline w-full" onClick={leaveRoom}>
                        <LogOut size={16} />
                        Leave Room
                    </button>
                </div>

                {/* Game Info */}
                <div className="mt-4 pt-4 border-t border-base-300">
                    <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-base-content/70">Total Rounds:</span>
                            <span className="font-semibold">{room.totalRounds}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-base-content/70">Round Duration:</span>
                            <span className="font-semibold">{room.roundDuration}s</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-base-content/70">Game State:</span>
                            <span className="font-semibold capitalize">
                                {room.gameState.replace('-', ' ')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
