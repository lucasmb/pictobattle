import { Server, Socket } from "socket.io";
import { Redis } from "ioredis";
import { z } from "zod";
import {
  SocketEvents,
  DEFAULT_GAME_SETTINGS,
  DEFAULT_WORDS,
  KICK_COUNTDOWN_DURATION,
  RECONNECT_WINDOW_DURATION,
  MAX_PLAYERS,
  MAX_STORED_STROKES,
  WORD_SELECTION_DURATION,
} from "@pictobattle/shared";
import type {
  Room,
  Player,
  CreateRoomPayload,
  JoinRoomPayload,
  SelectWordPayload,
  DrawPayload,
  DrawStroke,
  SendMessagePayload,
  KickPlayerPayload,
  Message,
} from "@pictobattle/shared";
import {
  generateRoomId,
  generatePlayerId,
  generateMessageId,
  selectRandomWord,
  getLevenshteinDistance,
} from "../utils/helpers.ts";
import { getRedisOptions } from "../config/redis.ts";
import {
  createRoomSchema,
  joinRoomSchema,
  selectWordSchema,
  drawPayloadSchema,
  sendMessageSchema,
  kickPlayerSchema,
} from "../validation.ts";

export class GameManager {
  private redis: Redis;
  private playerRooms: Map<string, string> = new Map(); // socketId -> roomId
  private roundTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> word-pick, round or between-round timer
  private startGameTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> countdown timer
  private emptyRoomTimers: Map<string, NodeJS.Timeout> = new Map(); // roomId -> cleanup timer for empty rooms

  constructor(private io: Server) {
    this.redis = new Redis(getRedisOptions());

    this.redis.on("error", (err: Error) => {
      console.error("Redis Error:", err);
    });

    // Single instance: timers and sockets die with the process, so rooms left from a previous run can't be resumed
    this.redis.del("rooms");

    this.io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);

      socket.on(SocketEvents.CREATE_ROOM, (payload) =>
        this.validateAndRun(socket, createRoomSchema, payload, (p) =>
          this.createRoom(socket, p),
        ),
      );
      socket.on(SocketEvents.JOIN_ROOM, (payload) =>
        this.validateAndRun(socket, joinRoomSchema, payload, (p) =>
          this.joinRoom(socket, p),
        ),
      );
      socket.on(SocketEvents.LEAVE_ROOM, () => this.leaveRoom(socket));
      socket.on(SocketEvents.START_GAME, () => this.startGame(socket));
      socket.on(SocketEvents.SELECT_WORD, (payload) =>
        this.validateAndRun(socket, selectWordSchema, payload, (p) =>
          this.selectWord(socket, p),
        ),
      );
      socket.on(SocketEvents.DRAW_SEGMENT, (payload) =>
        this.validateAndRun(socket, drawPayloadSchema, payload, (p) =>
          this.handleDrawSegment(socket, p),
        ),
      );
      socket.on(SocketEvents.CLEAR_CANVAS, () => this.clearCanvas(socket));
      socket.on(SocketEvents.SEND_MESSAGE, (payload) =>
        this.validateAndRun(socket, sendMessageSchema, payload, (p) =>
          this.handleMessage(socket, p),
        ),
      );
      socket.on(SocketEvents.RESTART_GAME, () => this.restartGame(socket));
      socket.on(SocketEvents.PLAYER_READY, () => this.setPlayerReady(socket));
      socket.on(SocketEvents.KICK_PLAYER, (payload) =>
        this.validateAndRun(socket, kickPlayerSchema, payload, (p) =>
          this.kickPlayer(socket, p),
        ),
      );
      socket.on(SocketEvents.FORCE_START_GAME, () =>
        this.forceStartGame(socket),
      );
      socket.on(SocketEvents.GET_ROOMS, () => this.sendRoomList(socket));
      socket.on("get_high_scores", () => this.sendHighScores(socket));

      socket.on("disconnect", () => this.handleDisconnect(socket));
    });
  }

  private validateAndRun<T>(
    socket: Socket,
    schema: z.ZodType<T>,
    data: unknown,
    run: (value: T) => void,
  ) {
    const result = schema.safeParse(data);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid payload";
      socket.emit(SocketEvents.ERROR, { message });
      return;
    }
    run(result.data);
  }

  private async updateRoom(roomId: string, room: Room) {
    await this.redis.hset("rooms", roomId, JSON.stringify(room));
  }

  // Strokes live in their own list so drawing never rewrites (and races with) the room record
  private strokesKey(roomId: string) {
    return `strokes:${roomId}`;
  }

  private async getStrokes(roomId: string): Promise<DrawStroke[]> {
    const items = await this.redis.lrange(this.strokesKey(roomId), 0, -1);
    return items.map((s) => JSON.parse(s) as DrawStroke);
  }

  // What everyone except the drawer sees: no secret word, options or word list
  private hideWord(room: Room): Room {
    return {
      ...room,
      currentWord: room.currentWord?.replace(/[^ -]/g, "_") ?? null,
      wordOptions: [],
      customWords: [],
    };
  }

  // Each socket also joins a room named after its playerId, so the drawer can be addressed directly
  private emitRoom(roomId: string, room: Room, event: string, extra: object = {}) {
    const drawerId = room.drawingPlayerId;
    const others = drawerId ? this.io.to(roomId).except(drawerId) : this.io.to(roomId);
    others.emit(event, { ...extra, room: this.hideWord(room) });
    if (drawerId) this.io.to(drawerId).emit(event, { ...extra, room });
  }

  private async getRoom(roomId: string): Promise<Room | null> {
    const data = await this.redis.hget("rooms", roomId);
    if (!data) return null;
    try {
      return JSON.parse(data) as Room;
    } catch (err) {
      console.error(`Corrupt room data for ${roomId}:`, err);
      return null;
    }
  }

  private async deleteRoom(roomId: string) {
    await this.redis.hdel("rooms", roomId);
    await this.redis.del(this.strokesKey(roomId));
  }

  private async roomList() {
    const roomsData = await this.redis.hgetall("rooms");
    return Object.values(roomsData)
      .map((data) => JSON.parse(data) as Room)
      .filter((r) => r.gameState === "lobby" && r.isPublic)
      .map((r) => ({
        id: r.id,
        name: r.name,
        players: r.players.length,
        maxPlayers: MAX_PLAYERS,
        gameState: r.gameState,
        isPublic: r.isPublic,
      }));
  }

  private async sendRoomList(socket: Socket) {
    socket.emit(SocketEvents.ROOMS_LIST, { rooms: await this.roomList() });
  }

  private async broadcastRoomList() {
    this.io.emit(SocketEvents.ROOMS_LIST, { rooms: await this.roomList() });
  }

  async createRoom(socket: Socket, payload: CreateRoomPayload) {
    const roomId = generateRoomId();
    const playerId = generatePlayerId();

    const player: Player = {
      id: playerId,
      name: payload.playerName,
      avatar: payload.playerAvatar,
      clientId: payload.clientId,
      score: 0,
      isAdmin: true,
      isDrawing: false,
      hasGuessed: false,
      isReady: false,
    };

    // Range already enforced by createRoomSchema
    const totalRounds = payload.totalRounds || DEFAULT_GAME_SETTINGS.totalRounds;

    const room: Room = {
      id: roomId,
      name: payload.roomName || `Room ${roomId}`,
      players: [player],
      currentRound: 0,
      totalRounds: totalRounds,
      currentWord: null,
      wordOptions: [],
      drawingPlayerId: null,
      roundStartTime: null,
      roundDuration: DEFAULT_GAME_SETTINGS.roundDuration,
      gameState: "lobby",
      customWords: payload.customWords || [],
      revealedLetters: {},
      isPublic: payload.isPublic ?? true,
      strokes: [],
    };

    await this.updateRoom(roomId, room);
    this.playerRooms.set(socket.id, roomId);
    socket.data.playerId = playerId;

    socket.join(roomId);
    socket.join(playerId);
    socket.emit(SocketEvents.ROOM_CREATED, { roomId, room });

    await this.broadcastRoomList();
    console.log(`Room created: ${roomId} by ${player.name}`);
  }

  async joinRoom(socket: Socket, payload: JoinRoomPayload) {
    const room = await this.getRoom(payload.roomId);

    if (!room) {
      socket.emit(SocketEvents.ERROR, { message: "Room not found" });
      return;
    }

    // Clear empty room timer if someone is joining
    const emptyRoomTimer = this.emptyRoomTimers.get(payload.roomId);
    if (emptyRoomTimer) {
      clearTimeout(emptyRoomTimer);
      this.emptyRoomTimers.delete(payload.roomId);
      console.log(
        `Cleared empty room timer for room ${payload.roomId} - new player joining`,
      );
    }

    // Check for reconnection - allow reconnecting to active games if player was previously in the room
    // Check for disconnected player record first
    const disconnectedPlayer = await this.findDisconnectedPlayer(
      payload.roomId,
      payload.clientId,
    );

    if (disconnectedPlayer) {
      // Reconnect the player to the game (even if room is empty or game is in progress)
      await this.reconnectPlayer(socket, payload.roomId, disconnectedPlayer);
      return;
    }

    // If game is not in lobby, reject new players
    // (Reconnection is handled above)
    if (room.gameState !== "lobby") {
      socket.emit(SocketEvents.ERROR, { message: "Game already in progress" });
      return;
    }

    // Enforce max players
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit(SocketEvents.ERROR, {
        message: `Room is full (max ${MAX_PLAYERS} players)`,
      });
      return;
    }

    const playerId = generatePlayerId();
    // If room is empty (all players left), the new player becomes admin
    const isFirstPlayer = room.players.length === 0;
    const player: Player = {
      id: playerId,
      name: payload.playerName,
      avatar: payload.playerAvatar,
      clientId: payload.clientId,
      score: 0,
      isAdmin: isFirstPlayer, // Make admin if room was empty
      isDrawing: false,
      hasGuessed: false,
      isReady: false,
    };

    room.players.push(player);
    await this.updateRoom(payload.roomId, room);

    console.log(
      `${player.name} joined room ${payload.roomId}${isFirstPlayer ? " as admin (room was empty)" : ""}`,
    );

    this.playerRooms.set(socket.id, payload.roomId);
    socket.join(payload.roomId);
    socket.join(playerId);
    socket.data.playerId = playerId;

    socket.emit(SocketEvents.ROOM_JOINED, {
      room: { ...this.hideWord(room), strokes: await this.getStrokes(payload.roomId) },
    });
    this.io.to(payload.roomId).emit(SocketEvents.PLAYER_JOINED, { player });
    await this.broadcastRoomList();
    this.emitRoom(payload.roomId, room, SocketEvents.ROOM_UPDATED);
  }

  async leaveRoom(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (!room) return;

    const playerId = socket.data.playerId;
    const player = room.players.find((p) => p.id === playerId);
    room.players = room.players.filter((p) => p.id !== playerId);

    // Note: We don't clear disconnected player data here because:
    // 1. It may have been saved by handleDisconnect for reconnection
    // 2. It naturally expires after RECONNECT_WINDOW_DURATION (5 minutes)
    // 3. It's deleted on successful reconnection anyway

    // Leave the socket room immediately so they don't receive the update events
    socket.leave(roomId);
    if (playerId) socket.leave(playerId);
    this.playerRooms.delete(socket.id);

    if (room.players.length === 0) {
      // Clear existing empty room timer if any
      const existingTimer = this.emptyRoomTimers.get(roomId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule room deletion after 30 seconds (shorter than reconnection window for active games)
      console.log(
        `Room ${roomId} is now empty, scheduling deletion in 30 seconds`,
      );
      const timer = setTimeout(async () => {
        // Double check room is still empty before deleting
        const currentRoom = await this.getRoom(roomId);
        if (currentRoom && currentRoom.players.length === 0) {
          await this.deleteRoom(roomId);
          this.clearRoundTimer(roomId);
          console.log(`Room ${roomId} deleted (empty for 30 seconds)`);
          await this.broadcastRoomList();
        }
        this.emptyRoomTimers.delete(roomId);
      }, 30000);

      this.emptyRoomTimers.set(roomId, timer);
      await this.updateRoom(roomId, room);
    } else {
      if (room.players.every((p) => !p.isAdmin)) {
        room.players[0]!.isAdmin = true;
      }

      await this.updateRoom(roomId, room);
      this.io.to(roomId).emit(SocketEvents.PLAYER_LEFT, { playerId });
      this.emitRoom(roomId, room, SocketEvents.ROOM_UPDATED);
    }
  }

  async startGame(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || !player.isAdmin) {
      socket.emit(SocketEvents.ERROR, {
        message: "Only admin can start the game",
      });
      return;
    }

    // Check if there's already a countdown in progress
    if (this.startGameTimers.has(roomId)) {
      socket.emit(SocketEvents.ERROR, {
        message: "Game start countdown already in progress",
      });
      return;
    }

    const unreadyPlayers = room.players.filter((p) => !p.isAdmin && !p.isReady);

    // If all non-admin players are ready, start immediately
    if (unreadyPlayers.length === 0) {
      await this.doStartGame(roomId);
      return;
    }

    // Start the 60-second countdown before kicking unready players
    this.io.to(roomId).emit(SocketEvents.GAME_START_COUNTDOWN, {
      secondsRemaining: KICK_COUNTDOWN_DURATION,
      unreadyPlayerCount: unreadyPlayers.length,
    });

    // Send countdown updates every second
    let secondsRemaining = KICK_COUNTDOWN_DURATION;
    const countdownInterval = setInterval(async () => {
      secondsRemaining--;

      // Check if everyone is ready now (they can ready up during countdown)
      const currentRoom = await this.getRoom(roomId);
      if (!currentRoom) {
        clearInterval(countdownInterval);
        this.startGameTimers.delete(roomId);
        return;
      }

      const stillUnready = currentRoom.players.filter(
        (p) => !p.isAdmin && !p.isReady,
      );

      if (stillUnready.length === 0) {
        // Everyone is ready, start immediately
        clearInterval(countdownInterval);
        this.startGameTimers.delete(roomId);
        await this.doStartGame(roomId);
        return;
      }

      if (secondsRemaining > 0) {
        this.io.to(roomId).emit(SocketEvents.GAME_START_COUNTDOWN, {
          secondsRemaining,
          unreadyPlayerCount: stillUnready.length,
        });
      } else {
        // Countdown finished, kick unready players and start
        clearInterval(countdownInterval);
        this.startGameTimers.delete(roomId);
        await this.kickUnreadyAndStart(roomId);
      }
    }, 1000);

    this.startGameTimers.set(roomId, countdownInterval);
  }

  async forceStartGame(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || !player.isAdmin) {
      socket.emit(SocketEvents.ERROR, {
        message: "Only admin can force start the game",
      });
      return;
    }

    // Cancel any existing countdown
    const existingTimer = this.startGameTimers.get(roomId);
    if (existingTimer) {
      clearInterval(existingTimer);
      this.startGameTimers.delete(roomId);
    }

    // Kick unready players and start immediately
    await this.kickUnreadyAndStart(roomId);
  }

  private async kickUnreadyAndStart(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return;

    const unreadyPlayers = room.players.filter((p) => !p.isAdmin && !p.isReady);

    // Kick all unready players
    for (const p of unreadyPlayers) {
      const targetSocketId = Array.from(this.playerRooms.entries()).find(
        ([_, rid]) =>
          rid === roomId &&
          this.io.sockets.sockets.get(_)?.data.playerId === p.id,
      )?.[0];

      if (targetSocketId) {
        const targetSocket = this.io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit(SocketEvents.PLAYER_KICKED, {
            message: "You were kicked for not being ready",
          });
          await this.leaveRoom(targetSocket);
        }
      }
    }

    const refreshedRoom = await this.getRoom(roomId);
    if (!refreshedRoom || refreshedRoom.players.length < 2) {
      const adminSocketId = Array.from(this.playerRooms.entries()).find(
        ([_, rid]) => rid === roomId,
      )?.[0];
      if (adminSocketId) {
        const adminSocket = this.io.sockets.sockets.get(adminSocketId);
        if (adminSocket) {
          adminSocket.emit(SocketEvents.ERROR, {
            message: "Not enough ready players to start (minimum 2)",
          });
        }
      }
      return;
    }

    await this.doStartGame(roomId);
  }

  private async doStartGame(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return;

    room.gameState = "word-selection";
    room.currentRound = 1;
    room.players.forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
      p.isDrawing = false;
    });

    await this.updateRoom(roomId, room);
    this.emitRoom(roomId, room, SocketEvents.GAME_STARTED);
    await this.startNewRound(roomId);
  }

  private async startNewRound(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return;

    room.players.forEach((p) => {
      p.isDrawing = false;
    });
    await this.redis.del(this.strokesKey(roomId)); // Clear canvas history for new round
    this.io.to(roomId).emit(SocketEvents.CANVAS_CLEARED);

    if (room.players.length === 0) return;

    const drawerIndex = (room.currentRound - 1) % room.players.length;
    const drawer = room.players[drawerIndex];

    if (!drawer) {
      console.error(
        `Drawer not found for room ${roomId} round ${room.currentRound}`,
      );
      return;
    }

    room.drawingPlayerId = drawer.id;
    drawer.isDrawing = true;

    room.players.forEach((p) => {
      p.hasGuessed = false;
    });
    room.revealedLetters = {};

    const wordList =
      room.customWords.length > 0 ? room.customWords : DEFAULT_WORDS;
    room.wordOptions = [
      selectRandomWord(wordList),
      selectRandomWord(wordList),
      selectRandomWord(wordList),
    ];

    room.gameState = "word-selection";
    await this.updateRoom(roomId, room);
    this.emitRoom(roomId, room, SocketEvents.ROUND_START);

    // A drawer who never picks (idle or gone) would freeze the room; pick for them
    this.setRoomTimer(roomId, WORD_SELECTION_DURATION * 1000, async () => {
      const current = await this.getRoom(roomId);
      const word = current?.wordOptions[0];
      if (current?.gameState === "word-selection" && word) {
        await this.applyWord(roomId, current, word);
      }
    });
  }

  async selectWord(socket: Socket, payload: SelectWordPayload) {
    const room = await this.getRoom(payload.roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || !player.isDrawing) {
      socket.emit(SocketEvents.ERROR, {
        message: "Only the drawer can select a word",
      });
      return;
    }

    if (
      room.gameState !== "word-selection" ||
      !room.wordOptions.includes(payload.word)
    ) {
      socket.emit(SocketEvents.ERROR, { message: "Invalid word choice" });
      return;
    }

    await this.applyWord(payload.roomId, room, payload.word);
  }

  private async applyWord(roomId: string, room: Room, word: string) {
    room.currentWord = word;
    room.gameState = "drawing";
    room.roundStartTime = Date.now();

    await this.updateRoom(roomId, room);

    if (room.drawingPlayerId) {
      this.io.to(room.drawingPlayerId).emit(SocketEvents.WORD_SELECTED, { word });
      this.io.to(roomId).except(room.drawingPlayerId).emit(SocketEvents.WORD_SELECTED, {
        word: word.replace(/./g, "_"),
        wordLength: word.length,
      });
    }

    this.emitRoom(roomId, room, SocketEvents.ROOM_UPDATED);
    this.setRoomTimer(roomId, room.roundDuration * 1000, () => this.endRound(roomId));
  }

  // One timer per room (word pick, round, or pause between rounds); restart/cleanup cancel it via clearRoundTimer
  private setRoomTimer(roomId: string, ms: number, run: () => unknown) {
    this.clearRoundTimer(roomId);
    this.roundTimers.set(roomId, setTimeout(run, ms));
  }

  private clearRoundTimer(roomId: string) {
    const timer = this.roundTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roundTimers.delete(roomId);
    }
  }

  private async endRound(roomId: string) {
    const room = await this.getRoom(roomId);
    // Guard: the round timer and the last correct guess can both end the round
    if (!room || room.gameState !== "drawing") return;

    this.clearRoundTimer(roomId);
    room.gameState = "round-end";
    await this.updateRoom(roomId, room);

    this.io.to(roomId).emit(SocketEvents.ROUND_END, {
      word: room.currentWord,
      scores: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      })),
    });

    if (room.currentRound >= room.totalRounds) {
      this.setRoomTimer(roomId, 5000, () => this.endGame(roomId));
    } else {
      this.setRoomTimer(roomId, 5000, async () => {
        const updatedRoom = await this.getRoom(roomId);
        if (!updatedRoom) return;
        updatedRoom.currentRound++;
        await this.updateRoom(roomId, updatedRoom);
        await this.startNewRound(roomId);
      });
    }
  }

  private async endGame(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return;

    room.gameState = "game-end";
    const finalScores = room.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
      }))
      .sort((a, b) => b.score - a.score);

    // Record high scores
    for (const p of room.players) {
      if (p.score > 0) {
        await this.recordHighScore(p.name, p.score);
      }
    }

    await this.updateRoom(roomId, room);
    this.io.to(roomId).emit(SocketEvents.GAME_END, { scores: finalScores });
    this.emitRoom(roomId, room, SocketEvents.ROOM_UPDATED);
  }

  private async recordHighScore(name: string, score: number) {
    // We use a simple playerName as identity; GT keeps a player's best score
    await this.redis.zadd("high_scores", "GT", score, name);
    // Trim to top 20
    await this.redis.zremrangebyrank("high_scores", 0, -21);
  }

  async sendHighScores(socket: Socket) {
    const scores = await this.redis.zrevrange(
      "high_scores",
      0,
      19,
      "WITHSCORES",
    );
    const formattedScores = [];
    for (let i = 0; i < scores.length; i += 2) {
      const name = scores[i];
      const score = scores[i + 1];
      if (name === undefined || score === undefined) break;
      formattedScores.push({ name, score: parseInt(score) });
    }
    socket.emit("high_scores_list", { scores: formattedScores });
  }

  async handleDrawSegment(socket: Socket, payload: DrawPayload) {
    const room = await this.getRoom(payload.roomId);
    if (!room || room.gameState !== "drawing") return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || !player.isDrawing) return;

    // Stored for players who join or reconnect mid-round; expire covers rooms that vanish uncleanly
    const key = this.strokesKey(payload.roomId);
    await this.redis
      .multi()
      .rpush(key, JSON.stringify(payload.stroke))
      .ltrim(key, -MAX_STORED_STROKES, -1)
      .expire(key, 3600)
      .exec();

    // Broadcast to other players
    socket
      .to(payload.roomId)
      .emit(SocketEvents.DRAW_UPDATE, { stroke: payload.stroke });
  }

  async clearCanvas(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (
      !room ||
      !room.players.find((p) => p.id === socket.data.playerId)?.isDrawing
    )
      return;

    await this.redis.del(this.strokesKey(roomId));
    this.io.to(roomId).emit(SocketEvents.CANVAS_CLEARED);
  }

  async handleMessage(socket: Socket, payload: SendMessagePayload) {
    const room = await this.getRoom(payload.roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || player.isDrawing) return;

    const message: Message = {
      id: generateMessageId(),
      playerId: player.id,
      playerName: player.name,
      content: payload.content,
      timestamp: Date.now(),
    };

    if (
      room.gameState === "drawing" &&
      room.currentWord &&
      payload.content.toLowerCase().trim() === room.currentWord.toLowerCase() &&
      !player.hasGuessed
    ) {
      player.hasGuessed = true;
      message.isCorrectGuess = true;

      const isFirstGuess =
        room.players.filter((p) => p.hasGuessed).length === 1;
      const points =
        DEFAULT_GAME_SETTINGS.pointsForCorrectGuess +
        (isFirstGuess ? DEFAULT_GAME_SETTINGS.bonusPointsForFirstGuess : 0);

      player.score += points;

      this.io.to(payload.roomId).emit(SocketEvents.CORRECT_GUESS, {
        playerId: player.id,
        playerName: player.name,
        points,
        isFirstGuess,
      });

      await this.updateRoom(payload.roomId, room);
      const allGuessed = room.players
        .filter((p) => !p.isDrawing)
        .every((p) => p.hasGuessed);
      if (allGuessed) {
        this.endRound(payload.roomId);
      }
    } else {
      // Hint logic
      if (
        room.gameState === "drawing" &&
        room.currentWord &&
        !player.hasGuessed
      ) {
        const targetWord = room.currentWord.toLowerCase();
        const guessWord = payload.content.toLowerCase().trim();

        if (!room.revealedLetters[player.id])
          room.revealedLetters[player.id] = [];
        const currentRevealed = new Set(room.revealedLetters[player.id]);
        let newReveal = false;

        const distance = getLevenshteinDistance(targetWord, guessWord);
        const isClose = distance >= 1 && distance <= 2;

        if (isClose) {
          console.log(
            `Close guess from ${player.name}: ${guessWord} (target: ${targetWord})`,
          );
          this.io
            .to(socket.id)
            .emit(SocketEvents.CLOSE_GUESS, { message: "You are very close!" });
        }

        const maxLength = Math.min(targetWord.length, guessWord.length);
        let remainingHidden = targetWord.length - currentRevealed.size;

        for (let i = 0; i < maxLength; i++) {
          if (targetWord[i] === guessWord[i] && !currentRevealed.has(i)) {
            // Reveal letter if it matches and we have more than 1 hidden (don't reveal last letter)
            if (remainingHidden > 1) {
              currentRevealed.add(i);
              newReveal = true;
              remainingHidden--;
            }
          }
        }

        if (newReveal || isClose) {
          room.revealedLetters[player.id] = Array.from(currentRevealed);
          let hintWord = "";
          for (let i = 0; i < targetWord.length; i++) {
            hintWord +=
              currentRevealed.has(i) ||
              targetWord[i] === " " ||
              targetWord[i] === "-"
                ? room.currentWord[i]
                : "_";
          }
          console.log(`Sending hint update to ${player.name}: ${hintWord}`);
          this.io.to(socket.id).emit(SocketEvents.WORD_HINT_UPDATE, {
            playerId: player.id,
            revealedPositions: room.revealedLetters[player.id],
            hintWord,
          });
          await this.updateRoom(payload.roomId, room);
        }
      }
    }
    this.io.to(payload.roomId).emit(SocketEvents.NEW_MESSAGE, { message });
  }

  async restartGame(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player || !player.isAdmin) {
      socket.emit(SocketEvents.ERROR, {
        message: "Only admin can restart the game",
      });
      return;
    }

    room.gameState = "lobby";
    room.currentRound = 0;
    room.currentWord = null;
    room.wordOptions = [];
    room.drawingPlayerId = null;
    room.roundStartTime = null;
    await this.redis.del(this.strokesKey(roomId)); // Clear canvas history

    // Ensure only one admin exists (the current one or the first player)
    let adminFound = false;
    room.players.forEach((p) => {
      p.score = 0;
      p.isDrawing = false;
      p.hasGuessed = false;
      p.isReady = false;

      // If this player was already admin, keep them as admin (but only the first one found)
      if (p.isAdmin && !adminFound) {
        adminFound = true;
      } else {
        p.isAdmin = false;
      }
    });

    // If no admin found (shouldn't happen, but safety), make first player admin
    if (!adminFound && room.players.length > 0) {
      room.players[0]!.isAdmin = true;
    }

    this.clearRoundTimer(roomId);
    await this.updateRoom(roomId, room);
    this.emitRoom(roomId, room, SocketEvents.ROOM_UPDATED);
    console.log(`Game restarted in room ${roomId}`);
  }

  async setPlayerReady(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.data.playerId);
    if (!player) return;

    player.isReady = !player.isReady;
    await this.updateRoom(roomId, room);
    this.io.to(roomId).emit(SocketEvents.PLAYER_READY, {
      playerId: player.id,
      isReady: player.isReady,
    });
    this.emitRoom(roomId, room, SocketEvents.ROOM_UPDATED);
  }

  async kickPlayer(socket: Socket, payload: KickPlayerPayload) {
    const room = await this.getRoom(payload.roomId);
    if (!room) return;

    const admin = room.players.find((p) => p.id === socket.data.playerId);
    if (!admin || !admin.isAdmin) {
      socket.emit(SocketEvents.ERROR, {
        message: "Only admin can kick players",
      });
      return;
    }

    const targetPlayer = room.players.find((p) => p.id === payload.playerId);
    if (!targetPlayer || targetPlayer.isAdmin) return;

    const targetSocketId = Array.from(this.playerRooms.entries()).find(
      ([_, rid]) =>
        rid === payload.roomId &&
        this.io.sockets.sockets.get(_)?.data.playerId === payload.playerId,
    )?.[0];

    if (targetSocketId) {
      const targetSocket = this.io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit(SocketEvents.PLAYER_KICKED, {
          message: "You have been kicked",
        });
        await this.leaveRoom(targetSocket);
      }
    }
  }

  async handleDisconnect(socket: Socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = await this.getRoom(roomId);
    if (!room) return;

    const playerId = socket.data.playerId;
    const player = room.players.find((p) => p.id === playerId);

    // Save disconnected player for reconnection (works for both lobby and in-progress games)
    // BUT do not save if the game has ended - let them just leave
    if (player && room.gameState !== "game-end") {
      await this.saveDisconnectedPlayer(player, roomId);
    }

    await this.leaveRoom(socket);
  }

  private async saveDisconnectedPlayer(player: Player, roomId: string) {
    const disconnectedData = {
      player,
      roomId,
      disconnectedAt: Date.now(),
    };

    // Store in Redis with 5-minute expiration using clientId as unique identifier
    const key = `disconnected:${roomId}:${player.clientId}`;
    await this.redis.setex(
      key,
      RECONNECT_WINDOW_DURATION,
      JSON.stringify(disconnectedData),
    );
    console.log(`Saved disconnected player ${player.name} for room ${roomId}`);
  }

  private async findDisconnectedPlayer(
    roomId: string,
    clientId: string,
  ): Promise<Player | null> {
    const key = `disconnected:${roomId}:${clientId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    // SETEX expires the record after RECONNECT_WINDOW_DURATION
    return JSON.parse(data).player;
  }

  private async reconnectPlayer(
    socket: Socket,
    roomId: string,
    player: Player,
  ) {
    const room = await this.getRoom(roomId);
    if (!room) {
      socket.emit(SocketEvents.ERROR, { message: "Room no longer exists" });
      return;
    }

    // Clear empty room timer if it exists (CRITICAL FIX)
    const emptyRoomTimer = this.emptyRoomTimers.get(roomId);
    if (emptyRoomTimer) {
      clearTimeout(emptyRoomTimer);
      this.emptyRoomTimers.delete(roomId);
      console.log(
        `Cleared empty room timer for room ${roomId} - player reconnecting`,
      );
    }

    // Check if game state allows reconnection
    // Allow reconnection to lobby (for page refresh during room creation)
    // and to active games (for disconnect during gameplay)
    if (room.gameState === "game-end") {
      // Optimization: If game ended while they were gone, clear their record so they don't get stuck in a loop
      // trying to reconnect to a finished game.
      const key = `disconnected:${roomId}:${player.clientId}`;
      await this.redis.del(key);

      socket.emit(SocketEvents.ERROR, {
        message: "Cannot reconnect - game has ended",
      });
      return;
    }

    // Check if player is already in the room (shouldn't happen, but safety check)
    const existingPlayer = room.players.find((p) => p.id === player.id);
    if (existingPlayer) {
      socket.emit(SocketEvents.ERROR, {
        message: "You are already in this room",
      });
      return;
    }

    // Remove the disconnected record from Redis using clientId
    const key = `disconnected:${roomId}:${player.clientId}`;
    await this.redis.del(key);

    // The snapshot's flags are stale: admin may have moved on, and the drawer may have changed
    player.isAdmin =
      room.players.length === 0 ||
      (player.isAdmin && !room.players.some((p) => p.isAdmin));
    player.isDrawing = room.drawingPlayerId === player.id;

    // Add player back to room
    room.players.push(player);
    await this.updateRoom(roomId, room);

    this.playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    socket.join(player.id);
    socket.data.playerId = player.id;

    // Notify everyone
    const view = player.isDrawing ? room : this.hideWord(room);
    socket.emit(SocketEvents.ROOM_JOINED, {
      room: { ...view, strokes: await this.getStrokes(roomId) },
      reconnected: true,
    });
    this.io.to(roomId).emit(SocketEvents.PLAYER_RECONNECTED, { player });
    this.emitRoom(roomId, room, SocketEvents.ROOM_UPDATED);

    console.log(`${player.name} reconnected to room ${roomId}`);
  }
}
