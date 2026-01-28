
export const playSound = (type: 'round-start' | 'correct-guess' | 'timer-tick') => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;

        switch (type) {
            case 'round-start':
                // Rising chime
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, now); // A4
                oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.5); // A5
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                oscillator.start(now);
                oscillator.stop(now + 0.5);
                break;

            case 'correct-guess':
                // Happy major third
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(523.25, now); // C5
                oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
                break;

            case 'timer-tick':
                // Short tick
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(800, now);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                oscillator.start(now);
                oscillator.stop(now + 0.05);
                break;
        }
    } catch (e) {
        console.error('Audio playback failed', e);
    }
};
