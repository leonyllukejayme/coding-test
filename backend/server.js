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

const SYMBOLS = ["X", "O"];
const game = {
  board: Array(9).fill(null),
  currentTurn: "X",
  winner: null,
  players: {},
};
const waitingPlayers = [];

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// Reset board data while keeping the current player assignments intact.
function resetGameState() {
  game.board = Array(9).fill(null);
  game.currentTurn = "X";
  game.winner = null;
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

// Capture which symbols are currently assigned and how many spectators are waiting.
function getPlayersStatus() {
  const assignedSymbols = Object.values(game.players);
  const waiting = waitingPlayers.filter((socket) => socket.connected).length;
  return {
    X: assignedSymbols.includes("X"),
    O: assignedSymbols.includes("O"),
    waiting,
  };
}

// Build the status copy that will be shown on every client.
function createStatus(isDraw, playersStatus) {
  if (game.winner) {
    return `Winner: ${game.winner}`;
  }
  if (!playersStatus.X || !playersStatus.O) {
    return "Waiting for two players to join.";
  }
  if (isDraw) {
    return "Draw!";
  }
  return `Next player: ${game.currentTurn}`;
}

// Package the board snapshot that each client needs.
function buildState() {
  const isDraw = !game.winner && game.board.every(Boolean);
  const playersStatus = getPlayersStatus();
  return {
    board: [...game.board],
    currentTurn: game.currentTurn,
    winner: game.winner,
    isDraw,
    status: createStatus(isDraw, playersStatus),
    players: playersStatus,
  };
}

// Broadcast the latest board snapshot to all clients.
function broadcastState() {
  io.emit("state update", buildState());
}

// Assign the next available symbol or queue the socket for the next slot.
function assignPlayerSymbol(socket) {
  const assignedSymbols = Object.values(game.players);
  const availableSymbol = SYMBOLS.find((symbol) => !assignedSymbols.includes(symbol));
  if (availableSymbol) {
    game.players[socket.id] = availableSymbol;
    return availableSymbol;
  }
  waitingPlayers.push(socket);
  return null;
}

// Drop a socket from the waiting queue when it disconnects.
function removeFromWaitingQueue(socket) {
  const index = waitingPlayers.findIndex((candidate) => candidate.id === socket.id);
  if (index > -1) {
    waitingPlayers.splice(index, 1);
  }
}

// Give the next queued spectator the freed symbol slot.
function promoteWaitingPlayer(symbol) {
  while (waitingPlayers.length) {
    const nextSocket = waitingPlayers.shift();
    if (!nextSocket.connected) {
      continue;
    }
    game.players[nextSocket.id] = symbol;
    nextSocket.emit("assign symbol", symbol);
    return;
  }
}

// Cleanup a disconnect so the symbol can be reused.
function cleanupSocket(socket) {
  removeFromWaitingQueue(socket);
  const symbol = game.players[socket.id];
  delete game.players[socket.id];
  if (symbol) {
    promoteWaitingPlayer(symbol);
  }
}

// Validate a move request, update the board, then re-broadcast.
function applyMove(socket, index) {
  const symbol = game.players[socket.id];
  if (!symbol || game.winner || game.currentTurn !== symbol || game.board[index]) {
    return;
  }
  game.board[index] = symbol;
  game.winner = calculateWinner(game.board);
  if (!game.winner) {
    game.currentTurn = symbol === "X" ? "O" : "X";
  }
  broadcastState();
}

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);
  const symbol = assignPlayerSymbol(socket);
  if (symbol) {
    socket.emit("assign symbol", symbol);
  } else {
    socket.emit("waiting", "You are queued for the next available slot.");
  }

  socket.on("make move", (index) => {
    applyMove(socket, index);
  });

  socket.on("reset game", () => {
    resetGameState();
    broadcastState();
  });

  socket.on("disconnect", () => {
    cleanupSocket(socket);
    broadcastState();
  });

  broadcastState();
});

server.listen(port, () => {
  console.log(`Listening to port ${port}`);
});
