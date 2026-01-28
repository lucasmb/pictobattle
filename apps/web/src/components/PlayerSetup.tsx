import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { AVATARS } from '@pictobattle/shared';

interface PlayerSetupProps {
    onComplete: () => void;
}

export function PlayerSetup({ onComplete }: PlayerSetupProps) {
    const [name, setName] = useState('');
    const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
    const { setPlayerInfo } = useGameStore();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            setPlayerInfo(name.trim(), selectedAvatar);
            onComplete();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center p-4">
            <div className="card w-full max-w-md bg-base-100 shadow-2xl">
                <div className="card-body">
                    <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        PictoParty
                    </h1>
                    <p className="text-center text-base-content/70 mb-6">
                        Join the fun! Draw, guess, and win!
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-semibold">Your Name</span>
                            </label>
                            <input
                                type="text"
                                placeholder="Enter your name"
                                className="input input-bordered input-primary w-full"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={20}
                                required
                            />
                        </div>

                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-semibold">Choose Avatar</span>
                            </label>
                            <div className="grid grid-cols-8 gap-2">
                                {AVATARS.map((avatar) => (
                                    <button
                                        key={avatar}
                                        type="button"
                                        className={`btn btn-square text-2xl ${selectedAvatar === avatar ? 'btn-primary' : 'btn-ghost'
                                            }`}
                                        onClick={() => setSelectedAvatar(avatar)}
                                    >
                                        {avatar}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary w-full btn-lg">
                            Let's Play! 🎨
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
