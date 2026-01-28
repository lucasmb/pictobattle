import { useGameStore } from '../store/gameStore';

export function WordSelection() {
    const { room, selectWord } = useGameStore();
    const currentPlayerId = useGameStore((state) => state.currentPlayerId);

    if (!room || room.gameState !== 'word-selection') return null;

    const currentPlayer = room.players.find((p) => p.id === currentPlayerId);
    const drawerPlayer = room.players.find((p) => p.isDrawing);
    const isDrawer = currentPlayer?.isDrawing;

    if (!isDrawer) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="card bg-base-100 shadow-2xl max-w-md">
                    <div className="card-body text-center">
                        <h2 className="text-2xl font-bold mb-4">
                            {drawerPlayer?.name} is choosing a word...
                        </h2>
                        <div className="loading loading-spinner loading-lg text-primary"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="card bg-base-100 shadow-2xl max-w-md">
                <div className="card-body">
                    <h2 className="text-2xl font-bold text-center mb-6">
                        Choose a word to draw!
                    </h2>

                    <div className="space-y-3">
                        {room.wordOptions.map((word, index) => (
                            <button
                                key={index}
                                className="btn btn-lg btn-outline btn-primary w-full text-xl"
                                onClick={() => selectWord(word)}
                            >
                                {word}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
