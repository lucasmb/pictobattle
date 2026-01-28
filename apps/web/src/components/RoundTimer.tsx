import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { Clock } from 'lucide-react';

export function RoundTimer() {
    const { room } = useGameStore();
    const [timeLeft, setTimeLeft] = useState(0);

    useEffect(() => {
        if (!room || !room.roundStartTime || room.gameState !== 'drawing') {
            setTimeLeft(0);
            return;
        }

        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - room.roundStartTime!) / 1000);
            const remaining = Math.max(0, room.roundDuration - elapsed);
            setTimeLeft(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [room]);

    if (!room || room.gameState !== 'drawing') return null;

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const isLowTime = timeLeft <= 30;

    return (
        <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg ${isLowTime ? 'bg-error text-error-content animate-pulse' : 'bg-primary text-primary-content'
                }`}
        >
            <Clock size={20} />
            <span>
                {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
        </div>
    );
}
