import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Send } from 'lucide-react';

export function Chat() {
    const [message, setMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { messages, sendMessage, room } = useGameStore();
    const currentPlayerId = useGameStore((state) => state.currentPlayerId);

    // Check if the CURRENT user is the drawer
    const currentPlayer = room?.players.find((p) => p.id === currentPlayerId);
    const isDrawing = room?.gameState === 'drawing' && currentPlayer?.isDrawing;

    // Allow chat if:
    // 1. Not in drawing state (lobby, round-end, game-end)
    // 2. In drawing state, but NOT the drawer
    const canSendMessage = (room?.gameState !== 'drawing') || (!isDrawing);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim() && canSendMessage) {
            sendMessage(message.trim());
            setMessage('');
        }
    };

    return (
        <div className="card bg-base-100 shadow-xl h-full">
            <div className="card-body p-4 flex flex-col h-full">
                <h3 className="font-semibold mb-2">Chat & Guesses</h3>

                {/* Messages */}
                <div className="bg-base-200 rounded-lg p-3 flex-1 overflow-y-auto mb-3 min-h-0">
                    {messages.length === 0 ? (
                        <p className="text-center text-base-content/50 text-sm">
                            No messages yet...
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`text-sm ${msg.isCorrectGuess
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 p-2 rounded font-bold'
                                        : msg.isCloseGuess
                                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-2 rounded font-bold italic'
                                            : msg.playerId === 'system'
                                                ? 'text-info italic'
                                                : ''
                                        }`}
                                >
                                    {msg.playerId !== 'system' && (
                                        <span className="font-semibold">{msg.playerName}: </span>
                                    )}
                                    <span>{msg.content}</span>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input */}
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        placeholder={
                            canSendMessage
                                ? 'Type your guess...'
                                : currentPlayer
                                    ? "You're drawing!"
                                    : 'Wait for the round to start...'
                        }
                        className="input input-bordered input-sm flex-1"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        disabled={!canSendMessage}
                        maxLength={100}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={!canSendMessage || !message.trim()}
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
}
