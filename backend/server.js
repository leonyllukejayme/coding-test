const express = require("express");
const { Server } = require("socket.io");
const { createServer } = require("node:http");
const { join } = require("node:path");
const cors = require("cors");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
const port = 3000;

app.use(cors());

const rooms = new Map();
const socketAssignments = new Map();

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// Reset board data while keeping the current player assignments intact.
function resetRoomState(room) {
  room.board = Array(9).fill(null);
  room.currentTurn = "X";
  room.winner = null;
}

// Check the classic win lines for a winning symbol.
function calculateWinner(squares) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const [a, b, c] = lines[i];
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return squares[a];
    }
  }
  return null;
}

// Build the status copy that will be shown on every client.
function createStatus(room, isDraw) {
  if (!room) {
    return "No room yet.";
  }
  const playersFilled = Object.values(room.players).filter(Boolean).length;
  if (room.winner) {
    const winnerName = room.players[room.winner]?.name;
    return winnerName ? `Winner: ${room.winner} (${winnerName})` : `Winner: ${room.winner}`;
  }
  if (playersFilled < 2) {
    const remaining = 2 - playersFilled;
    return `Waiting for ${remaining} more player${remaining > 1 ? "s" : ""}.`;
  }
  if (isDraw) {
    return "Draw!";
  }
  const currentPlayerName = room.players[room.currentTurn]?.name;
  return currentPlayerName
    ? `Next player: ${room.currentTurn} (${currentPlayerName}).`
    : `Next player: ${room.currentTurn}.`;
}

// Package the board snapshot that each client needs.
function buildState(room) {
  if (!room) {
    return null;
  }
  const isDraw = !room.winner && room.board.every(Boolean);
  const status = createStatus(room, isDraw);
  return {
    roomId: room.id,
    board: [...room.board],
    currentTurn: room.currentTurn,
    winner: room.winner,
    isDraw,
    status,
    players: {
      X: room.players.X
        ? { ready: true, name: room.players.X.name }
        : { ready: false, name: null },
      O: room.players.O
        ? { ready: true, name: room.players.O.name }
        : { ready: false, name: null },
    },
  };
}

// Broadcast the latest board snapshot to all clients.
function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  const state = buildState(room);
  if (!state) {
    return;
  }
  io.to(roomId).emit("state update", state);
}

function prepareRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }
  const newRoom = {
    id: roomId,
    board: Array(9).fill(null),
    currentTurn: "X",
    winner: null,
    players: {
      X: null,
      O: null,
    },
  };
  rooms.set(roomId, newRoom);
  return newRoom;
}

function assignRoomSymbol(room, socketId, name) {
  if (room.players.X && room.players.O) {
    return null;
  }
  const symbol = room.players.X ? "O" : "X";
  room.players[symbol] = { socketId, name };
  return symbol;
}

function detachFromRoom(socket) {
  const assignment = socketAssignments.get(socket.id);
  if (!assignment) {
    return;
  }
  const room = rooms.get(assignment.roomId);
  if (room && room.players[assignment.symbol]) {
    if (room.players[assignment.symbol].socketId === socket.id) {
      room.players[assignment.symbol] = null;
    }
    if (!room.players.X && !room.players.O) {
      rooms.delete(room.id);
    } else {
      broadcastRoom(room.id);
    }
  }
  socket.leave(assignment.roomId);
  socketAssignments.delete(socket.id);
}

// Validate a move request, update the board, then re-broadcast.
function applyMove(socket, index) {
  const assignment = socketAssignments.get(socket.id);
  if (!assignment) {
    return;
  }
  const room = rooms.get(assignment.roomId);
  if (
    !room ||
    room.winner ||
    room.currentTurn !== assignment.symbol ||
    room.board[index]
  ) {
    return;
  }
  room.board[index] = assignment.symbol;
  room.winner = calculateWinner(room.board);
  if (!room.winner) {
    room.currentTurn = assignment.symbol === "X" ? "O" : "X";
  }
  broadcastRoom(room.id);
}

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on("make move", (index) => {
    applyMove(socket, index);
  });

  socket.on("reset game", () => {
    const assignment = socketAssignments.get(socket.id);
    if (!assignment) {
      return;
    }
    const room = rooms.get(assignment.roomId);
    if (!room) {
      return;
    }
    resetRoomState(room);
    broadcastRoom(room.id);
  });

  socket.on("disconnect", () => {
    detachFromRoom(socket);
  });

  socket.on("create room", ({ roomId, name }) => {
    const normalizedRoom = roomId?.trim();
    const normalizedName = name?.trim();
    if (!normalizedRoom || !normalizedName) {
      socket.emit("room error", "Provide both a room name and your player name.");
      return;
    }
    if (rooms.has(normalizedRoom)) {
      socket.emit("room error", `Room "${normalizedRoom}" already exists.`);
      return;
    }
    const room = prepareRoom(normalizedRoom);
    detachFromRoom(socket);
    const symbol = assignRoomSymbol(room, socket.id, normalizedName);
    if (!symbol) {
      socket.emit("room error", "Room is already full.");
      return;
    }
    socketAssignments.set(socket.id, { roomId: normalizedRoom, symbol, name: normalizedName });
    socket.join(normalizedRoom);
    socket.emit("assign symbol", { symbol, roomId: normalizedRoom });
    broadcastRoom(normalizedRoom);
  });

  socket.on("join room", ({ roomId, name }) => {
    const normalizedRoom = roomId?.trim();
    const normalizedName = name?.trim();
    if (!normalizedRoom || !normalizedName) {
      socket.emit("room error", "Provide both a room name and your player name.");
      return;
    }
    const room = rooms.get(normalizedRoom);
    if (!room) {
      socket.emit("room error", `Room "${normalizedRoom}" not found.`);
      return;
    }
    if (room.players.X && room.players.O) {
      socket.emit("room error", `Room "${normalizedRoom}" is full.`);
      return;
    }
    detachFromRoom(socket);
    const symbol = assignRoomSymbol(room, socket.id, normalizedName);
    if (!symbol) {
      socket.emit("room error", "Unable to join this room.");
      return;
    }
    socketAssignments.set(socket.id, { roomId: normalizedRoom, symbol, name: normalizedName });
    socket.join(normalizedRoom);
    socket.emit("assign symbol", { symbol, roomId: normalizedRoom });
    broadcastRoom(normalizedRoom);
  });
});

server.listen(port, () => {
  console.log(`Listening to port ${port}`);
});
