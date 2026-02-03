import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Copy, Check } from 'lucide-react';

export function Lobby() {
    const [roomIdInput, setRoomIdInput] = useState('');
    const [customWords, setCustomWords] = useState('');
    const [showCustomWords, setShowCustomWords] = useState(false);
    const [isPublic, setIsPublic] = useState(true);
    const [totalRounds, setTotalRounds] = useState(5);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<'rooms' | 'highscores'>('rooms');
    const { createRoom, joinRoom, roomId, error, clearError, isLoading } = useGameStore();

    const handleCreateRoom = () => {
        const words = customWords
            .split(',')
            .map((w) => w.trim())
            .filter((w) => w.length > 0);
        createRoom(undefined, words.length > 0 ? words : undefined, isPublic, totalRounds);
    };

    const handleJoinRoom = () => {
        if (roomIdInput.trim()) {
            joinRoom(roomIdInput.trim().toUpperCase());
        }
    };

    const handleCopyRoomId = () => {
        if (roomId) {
            navigator.clipboard.writeText(roomId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center p-4">
            <div className="card w-full max-w-2xl bg-base-100 shadow-2xl">
                <div className="card-body">
                    <h2 className="text-3xl font-bold text-center mb-6">Game Lobby</h2>

                    {error && (
                        <div className="alert alert-error mb-4">
                            <span>{error}</span>
                            <button className="btn btn-sm btn-ghost" onClick={clearError}>
                                ✕
                            </button>
                        </div>
                    )}

                    {roomId ? (
                        <div className="space-y-4">
                            <div className="alert alert-success">
                                <div className="flex flex-col w-full gap-2">
                                    <span className="font-semibold">Room Created!</span>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl font-mono">{roomId}</span>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={handleCopyRoomId}
                                                title="Copy Room Code"
                                            >
                                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                            </button>
                                        </div>
                                        <button
                                            className="btn btn-sm btn-outline btn-success w-full"
                                            onClick={() => {
                                                const url = `${window.location.origin}?code=${roomId}`;
                                                navigator.clipboard.writeText(url);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }}
                                        >
                                            {copied ? <Check size={16} /> : <Copy size={16} />} Copy Full Link
                                        </button>
                                    </div>
                                    <span className="text-sm">Share this code with your friends!</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 space-y-4">
                                <h3 className="text-xl font-semibold text-center">Create Room</h3>

                                <div className="form-control">
                                    <label className="label cursor-pointer">
                                        <span className="label-text">Public room (visible in lobby)</span>
                                        <input
                                            type="checkbox"
                                            className="toggle toggle-primary"
                                            checked={isPublic}
                                            onChange={(e) => setIsPublic(e.target.checked)}
                                        />
                                    </label>
                                </div>

                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Rounds: {totalRounds}</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="3"
                                        max="10"
                                        value={totalRounds}
                                        onChange={(e) => setTotalRounds(parseInt(e.target.value))}
                                        className="range range-primary range-xs"
                                        step="1"
                                    />
                                    <div className="w-full flex justify-between text-xs px-2 mt-1">
                                        <span>3</span>
                                        <span>5</span>
                                        <span>7</span>
                                        <span>10</span>
                                    </div>
                                </div>

                                <div className="form-control">
                                    <label className="label cursor-pointer">
                                        <span className="label-text">Use custom words</span>
                                        <input
                                            type="checkbox"
                                            className="toggle toggle-primary"
                                            checked={showCustomWords}
                                            onChange={(e) => setShowCustomWords(e.target.checked)}
                                        />
                                    </label>
                                </div>

                                {showCustomWords && (
                                    <div className="form-control">
                                        <label className="label">
                                            <span className="label-text">Custom Words (comma-separated)</span>
                                        </label>
                                        <textarea
                                            className="textarea textarea-bordered h-24"
                                            placeholder="cat, dog, house, tree..."
                                            value={customWords}
                                            onChange={(e) => setCustomWords(e.target.value)}
                                        />
                                    </div>
                                )}

                                <button
                                    className="btn btn-primary w-full"
                                    onClick={handleCreateRoom}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <span className="loading loading-spinner"></span>
                                    ) : (
                                        'Create Room'
                                    )}
                                </button>
                            </div>

                            <div className="divider md:divider-horizontal">OR</div>

                            <div className="flex-1 space-y-4">
                                <h3 className="text-xl font-semibold text-center">Join Room</h3>

                                <div className="tabs tabs-boxed justify-center mb-4">
                                    <a className={`tab ${activeTab === 'rooms' ? 'tab-active' : ''}`} onClick={() => setActiveTab('rooms')}>Active Rooms</a>
                                    <a className={`tab ${activeTab === 'highscores' ? 'tab-active' : ''}`} onClick={() => setActiveTab('highscores')}>High Scores</a>
                                </div>

                                {activeTab === 'rooms' ? <RoomList /> : <HighScoresList />}

                                <div className="divider text-xs">OR ENTER CODE</div>

                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Room Code</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Enter room code"
                                        className="input input-bordered input-primary w-full uppercase"
                                        value={roomIdInput}
                                        onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                                        maxLength={6}
                                    />
                                </div>
                                <button
                                    className="btn btn-secondary w-full"
                                    onClick={handleJoinRoom}
                                    disabled={isLoading || !roomIdInput.trim()}
                                >
                                    {isLoading ? (
                                        <span className="loading loading-spinner"></span>
                                    ) : (
                                        'Join Room'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function RoomList() {
    const { rooms, joinRoom } = useGameStore();

    if (!rooms || rooms.length === 0) {
        return (
            <div className="text-center py-4 bg-base-200 rounded-lg">
                <p className="text-sm opacity-50">No active rooms found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 max-h-48 overflow-y-auto">
            {rooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                    <div className="overflow-hidden">
                        <div className="font-bold truncate">{room.name}</div>
                        <div className="text-xs opacity-70">
                            {room.players}/{room.maxPlayers} Players • {room.gameState}
                        </div>
                    </div>
                    <button
                        className="btn btn-sm btn-accent"
                        onClick={() => joinRoom(room.id)}
                        disabled={room.players >= room.maxPlayers}
                    >
                        Join
                    </button>
                </div>
            ))}
        </div>
    );
}

function HighScoresList() {
    const { socket } = useGameStore();
    const [scores, setScores] = useState<{ name: string; score: number }[]>([]);

    useEffect(() => {
        if (!socket) return;

        socket.emit('get_high_scores');

        const handleScores = ({ scores }: { scores: { name: string; score: number }[] }) => {
            setScores(scores);
        };

        socket.on('high_scores_list' as any, handleScores);

        return () => {
            socket.off('high_scores_list' as any, handleScores);
        };
    }, [socket]);

    return (
        <div className="bg-base-200 rounded-lg p-4 space-y-2 max-h-48 overflow-y-auto">
            <h4 className="font-bold text-center mb-2">🏆 Hall of Fame</h4>
            {scores.length === 0 ? (
                <p className="text-center text-sm opacity-50">No scores yet. Be the first!</p>
            ) : (
                scores.map((s, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                        <span>
                            <span className="font-mono font-bold w-6 inline-block">#{i + 1}</span>
                            {s.name}
                        </span>
                        <span className="font-bold text-primary">{s.score}</span>
                    </div>
                ))
            )}
        </div>
    );
}
