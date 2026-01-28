import { useGameStore } from '../store/gameStore';
import { Canvas } from './Canvas';
import { Chat } from './Chat';
import { PlayerList } from './PlayerList';
import { GameControls } from './GameControls';
import { WordSelection } from './WordSelection';
import { RoundTimer } from './RoundTimer';
import { Scoreboard } from './Scoreboard';

export function GameRoom() {
    const { room } = useGameStore();

    if (!room) return null;

    const showWordSelection = room.gameState === 'word-selection';
    const showScoreboard = room.gameState === 'game-end';
    const isPlaying = room.gameState === 'drawing';

    return (
        <div className="min-h-screen bg-base-200">
            <div className="container mx-auto p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-3xl font-bold">{room.name}</h1>
                        <p className="text-sm text-base-content/70">
                            Room Code: <span className="font-mono font-bold">{room.id}</span>
                        </p>
                    </div>
                    {isPlaying && <RoundTimer />}
                    <div className="text-right">
                        <p className="text-sm text-base-content/70">
                            Round {room.currentRound} / {room.totalRounds}
                        </p>
                    </div>
                </div>

                {/* Word Selection Modal */}
                {showWordSelection && <WordSelection />}

                {/* Scoreboard Modal */}
                {showScoreboard && <Scoreboard />}

                {/* Main Game Area */}
                <div className="grid lg:grid-cols-[1fr_300px] gap-4">
                    {/* Left Column: Canvas and Chat */}
                    <div className="space-y-4">
                        <Canvas />
                        <Chat />
                    </div>

                    {/* Right Column: Players and Controls */}
                    <div className="space-y-4">
                        <PlayerList />
                        <GameControls />
                    </div>
                </div>
            </div>
        </div>
    );
}
