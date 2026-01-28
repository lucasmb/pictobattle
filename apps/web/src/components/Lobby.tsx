import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Copy, Check } from 'lucide-react';

export function Lobby() {
    const [roomIdInput, setRoomIdInput] = useState('');
    const [customWords, setCustomWords] = useState('');
    const [showCustomWords, setShowCustomWords] = useState(false);
    const [copied, setCopied] = useState(false);
    const { createRoom, joinRoom, roomId, error, clearError, isLoading } = useGameStore();

    const handleCreateRoom = () => {
        const words = customWords
            .split(',')
            .map((w) => w.trim())
            .filter((w) => w.length > 0);
        createRoom(undefined, words.length > 0 ? words : undefined);
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
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-mono">{roomId}</span>
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            onClick={handleCopyRoomId}
                                        >
                                            {copied ? <Check size={16} /> : <Copy size={16} />}
                                        </button>
                                    </div>
                                    <span className="text-sm">Share this code with your friends!</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-xl font-semibold text-center">Create Room</h3>

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

                            <div className="space-y-4">
                                <h3 className="text-xl font-semibold text-center">Join Room</h3>

                                <RoomList />

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
