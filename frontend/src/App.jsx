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
export default function Game() {
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [currentTurn, setCurrentTurn] = useState("X");
  const [statusMessage, setStatusMessage] = useState("Connecting to server...");
  const [playerSymbol, setPlayerSymbol] = useState(null);
  const [playersOnline, setPlayersOnline] = useState({
    X: false,
    O: false,
    waiting: 0,
  });
  const [winner, setWinner] = useState(null);
  const [isDraw, setIsDraw] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  // Keep a persistent socket connection alive for the lifetime of the component.
  useEffect(() => {
    const socket = io(import.meta.env.VITE_BACKEND_URL ||"");
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setStatusMessage("Connected to the server. Waiting for the current game state...");
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setPlayerSymbol(null);
      setStatusMessage("Disconnected from server. Reconnect to play or spectate.");
    });

    socket.on("assign symbol", (symbol) => {
      setPlayerSymbol(symbol);
      setStatusMessage(`You are Player "${symbol}".`);
    });

    socket.on("state update", (gameState) => {
      setSquares(gameState.board);
      setCurrentTurn(gameState.currentTurn);
      setWinner(gameState.winner);
      setIsDraw(gameState.isDraw);
      setStatusMessage(gameState.status);
      setPlayersOnline(gameState.players);
    });

    socket.on("waiting", (message) => {
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

  const renderConnectionStatus = () => (connected ? "Live" : "Offline");
  const watchingLabel = playerSymbol ? `Player "${playerSymbol}"` : "Spectating";

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
          <div className="status-card">
            <p className="status-label">{watchingLabel}</p>
            <h2 className="status-message">{statusMessage}</h2>
            <p className="queue">Queue: {playersOnline.waiting} waiting for a slot.</p>
          </div>

          <div className="player-grid">
            <div className={`player-card ${playersOnline.X ? "active" : "idle"}`}>
              <span className="player-symbol">X</span>
              <p>Player X</p>
              <small>{playersOnline.X ? "Ready" : "Waiting"}</small>
            </div>
            <div className={`player-card ${playersOnline.O ? "active" : "idle"}`}>
              <span className="player-symbol">O</span>
              <p>Player O</p>
              <small>{playersOnline.O ? "Ready" : "Waiting"}</small>
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
