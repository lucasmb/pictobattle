import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { PlayerSetup } from './components/PlayerSetup';

function App() {
  const { connect, disconnect, room, playerName } = useGameStore();
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    // Check if user has already set up their profile
    if (!playerName) {
      setShowSetup(true);
    }
  }, [playerName]);

  const handlePlayerSetup = () => {
    setShowSetup(false);
  };

  if (showSetup || !playerName) {
    return <PlayerSetup onComplete={handlePlayerSetup} />;
  }

  if (!room) {
    return <Lobby />;
  }

  return <GameRoom />;
}

export default App;
