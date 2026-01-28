import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { PlayerSetup } from './components/PlayerSetup';

function App() {
  const { connect, disconnect, room, playerName } = useGameStore();
  const [showSetup, setShowSetup] = useState(true);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

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
