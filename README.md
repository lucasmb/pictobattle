# PictoParty

A real-time multiplayer Pictionary game built with React 19, Node.js, Socket.io, and Tailwind CSS.

## Features

- 🎨 Real-time drawing with HTML5 Canvas
- 💬 Live chat and guessing
- 🏆 Scoring system with bonus points
- ⏱️ 2-minute rounds
- 👥 Multiplayer support
- 🎭 Avatar selection
- 🎯 5-round game flow
- 📊 Live scoreboard

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Zustand, Tailwind CSS v4, DaisyUI v5
- **Backend**: Node.js, Express, Socket.io, TypeScript
- **Package Manager**: PNPM (monorepo)

## Quick Start

```bash
# Install dependencies
make install

# Start backend server (terminal 1)
make dev-server

# Start frontend (terminal 2)
make dev-web

# Or run both concurrently
make dev
```

Then open `http://localhost:5173` in multiple browser windows to play!

## How to Play

1. Enter your name and choose an avatar
2. Create a room or join with a room code
3. Admin starts the game
4. Players take turns drawing while others guess
5. Earn points for correct guesses (bonus for first guess!)
6. Play 5 rounds and see who wins!

## Project Structure

```
pictoparty/
├── apps/
│   ├── web/          # React frontend
│   └── server/       # Node.js backend
├── packages/
│   └── shared/       # Shared types
├── infra/
│   └── docker-compose.yml
└── Makefile
```

## Available Commands

```bash
make install      # Install dependencies
make dev-web      # Start frontend
make dev-server   # Start backend
make dev          # Start both
make test         # Run tests
make build        # Build for production
make clean        # Clean dependencies
```

## Environment Variables

### Backend (`apps/server/.env`)
```
PORT=3001
CLIENT_URL=http://localhost:5173
```

### Frontend (`apps/web/.env`)
```
VITE_SERVER_URL=http://localhost:3001
```

## License

MIT

