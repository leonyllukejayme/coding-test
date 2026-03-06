import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
function Square({ value, onSquareClick }) {
  // Render one board cell and forward its clicks to the parent board.
  return (
    <button className="square" onClick={onSquareClick}>
      {value}
    </button>
  );
}

function Board({ squares, onSquareClick }) {
  // Display the board as three rows of squares.
  return (
    <>
      <div className="board-row">
        <Square value={squares[0]} onSquareClick={() => onSquareClick(0)} />
        <Square value={squares[1]} onSquareClick={() => onSquareClick(1)} />
        <Square value={squares[2]} onSquareClick={() => onSquareClick(2)} />
      </div>
      <div className="board-row">
        <Square value={squares[3]} onSquareClick={() => onSquareClick(3)} />
        <Square value={squares[4]} onSquareClick={() => onSquareClick(4)} />
        <Square value={squares[5]} onSquareClick={() => onSquareClick(5)} />
      </div>
      <div className="board-row">
        <Square value={squares[6]} onSquareClick={() => onSquareClick(6)} />
        <Square value={squares[7]} onSquareClick={() => onSquareClick(7)} />
        <Square value={squares[8]} onSquareClick={() => onSquareClick(8)} />
      </div>
    </>
  );
}

// Game manages the board state with server events and exposes controls.
const getInitialRoomId = () => {
  if (typeof window === "undefined") {
    return "";
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("room") || "";
};

export default function Game() {
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [currentTurn, setCurrentTurn] = useState("X");
  const [statusMessage, setStatusMessage] = useState("Connecting to server...");
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [playersInfo, setPlayersInfo] = useState({
    X: { ready: false, name: null },
    O: { ready: false, name: null },
  });
  const [winner, setWinner] = useState(null);
  const [isDraw, setIsDraw] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [roomInput, setRoomInput] = useState(getInitialRoomId());
  const [joinedRoomId, setJoinedRoomId] = useState("");
  const [joinFeedback, setJoinFeedback] = useState("Enter a name and room to start.");

  // Keep a persistent socket connection alive for the lifetime of the component.
  useEffect(() => {
    const socket = io(import.meta.env.VITE_BACKEND_URL ||"");
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setStatusMessage("Connected to the server. Enter a room to start playing.");
      setJoinFeedback("Enter your name and room to join a match.");
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setPlayerSymbol(null);
      setStatusMessage("Disconnected from the server.");
      setJoinedRoomId("");
      setPlayersInfo({
        X: { ready: false, name: null },
        O: { ready: false, name: null },
      });
      setJoinFeedback("Disconnected. Reconnect to create or join a room.");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("room");
        window.history.replaceState({}, "", url);
      }
    });

    socket.on("assign symbol", ({ symbol, roomId }) => {
      setPlayerSymbol(symbol);
      setJoinedRoomId(roomId);
      setStatusMessage(`You are Player "${symbol}" in room "${roomId}".`);
      setJoinFeedback(`Joined room "${roomId}".`);
      if (typeof window !== "undefined") {
        setRoomInput(roomId);
        const url = new URL(window.location.href);
        url.searchParams.set("room", roomId);
        window.history.replaceState({}, "", url);
      }
    });

    socket.on("state update", (gameState) => {
      setSquares(gameState.board);
      setCurrentTurn(gameState.currentTurn);
      setWinner(gameState.winner);
      setIsDraw(gameState.isDraw);
      setStatusMessage(gameState.status);
      setPlayersInfo(gameState.players);
      if (gameState.roomId) {
        setJoinedRoomId(gameState.roomId);
      }
    });

    socket.on("room error", (message) => {
      setJoinFeedback(message);
      setStatusMessage(message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Only emit moves when the user is the assigned player, it is their turn, and the game is still ongoing.
  function handleSquareClick(index) {
    if (!playerSymbol || currentTurn !== playerSymbol || winner || isDraw) {
      return;
    }
    if (squares[index]) {
      return;
    }
    socketRef.current?.emit("make move", index);
  }

  // Ask the server to clear the board and restart the round.
  function handleReset() {
    socketRef.current?.emit("reset game");
  }

  function requestRoomAction(eventName) {
    const trimmedName = playerNameInput.trim();
    const trimmedRoom = roomInput.trim();
    if (!trimmedName || !trimmedRoom) {
      setJoinFeedback("Please enter both a player name and a room.");
      return;
    }
    if (!connected) {
      setJoinFeedback("Waiting for a healthy connection to the server...");
      return;
    }
    socketRef.current?.emit(eventName, {
      roomId: trimmedRoom,
      name: trimmedName,
    });
  }

  function handleCreateRoom() {
    requestRoomAction("create room");
  }

  function handleJoinRoom() {
    requestRoomAction("join room");
  }

  const renderConnectionStatus = () => (connected ? "Live" : "Offline");
  const assignedName = playerSymbol ? playersInfo[playerSymbol]?.name : null;
  const watchingLabel = playerSymbol
    ? assignedName
      ? `Player "${playerSymbol}" • ${assignedName}`
      : `Player "${playerSymbol}"`
    : "Waiting to join a room";

  return (
    <div className="app-stage">
      <header className="app-header">
        <div>
          <h1>Tic Tac Toe Arena</h1>
          <p>Fast-paced matches streamed from the server. Claim a corner and control the grid.</p>
        </div>
        <div className="meta-pulse">
          <span>{renderConnectionStatus()}</span>
          <small>Connection</small>
        </div>
      </header>

      <main className="game-layout">
        <section className="board-panel">
          <div className="board-shell">
            <Board squares={squares} onSquareClick={handleSquareClick} />
          </div>
          <div className="board-footer">
            <div className="chip">
              <span>Turn</span>
              <strong>{currentTurn || "�"}</strong>
            </div>
            <div className="chip">
              <span>Status</span>
              <strong>{winner ? `${winner} wins` : isDraw ? "Draw" : statusMessage}</strong>
            </div>
          </div>
        </section>

        <section className="info-panel">
          <div className="room-form">
            <label htmlFor="player-name">Player name</label>
            <input
              id="player-name"
              type="text"
              placeholder="e.g. Mila, Captain X"
              value={playerNameInput}
              onChange={(event) => setPlayerNameInput(event.target.value)}
            />
            <label htmlFor="room-id">Room ID</label>
            <input
              id="room-id"
              type="text"
              placeholder="Room name (letters + numbers only)"
              value={roomInput}
              onChange={(event) => setRoomInput(event.target.value)}
            />
            <div className="room-actions">
              <button type="button" onClick={handleCreateRoom} disabled={!connected}>
                Create room
              </button>
              <button type="button" onClick={handleJoinRoom} disabled={!connected}>
                Join room
              </button>
            </div>
            {joinFeedback && <p className="form-note">{joinFeedback}</p>}
          </div>

          <div className="status-card">
            <p className="status-label">{watchingLabel}</p>
            <h2 className="status-message">{statusMessage}</h2>
            <p className="queue">Room: {joinedRoomId || "Not joined"}</p>
          </div>

          <div className="player-grid">
            <div className={`player-card ${playersInfo.X.ready ? "active" : "idle"}`}>
              <span className="player-symbol">X</span>
              <div className="player-details">
                <p>{playersInfo.X.name || "Player X slot"}</p>
                <small>{playersInfo.X.ready ? "Connected" : "Waiting for someone"}</small>
              </div>
            </div>
            <div className={`player-card ${playersInfo.O.ready ? "active" : "idle"}`}>
              <span className="player-symbol">O</span>
              <div className="player-details">
                <p>{playersInfo.O.name || "Player O slot"}</p>
                <small>{playersInfo.O.ready ? "Connected" : "Waiting for someone"}</small>
              </div>
            </div>
          </div>

          <button className="reset-button" type="button" onClick={handleReset} disabled={!connected}>
            Reset board
          </button>
        </section>
      </main>
    </div>
  );
}
