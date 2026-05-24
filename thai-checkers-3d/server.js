const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to serve index.html for any other request
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Map to track connected players: socketId -> username
const activePlayers = new Map();

// Helper function to get socket ID by username
function getSocketIdByUsername(username) {
  for (const [id, name] of activePlayers.entries()) {
    if (name.toLowerCase() === username.toLowerCase()) {
      return id;
    }
  }
  return null;
}

// Helper to broadcast current online players to all connected sockets
function broadcastOnlinePlayers() {
  const playersList = [];
  activePlayers.forEach((username) => {
    playersList.push({ username });
  });

  // Emitting both event names to ensure client compatibility
  io.emit('online-users', playersList);
  io.emit('updatePlayers', playersList);
  console.log(`[Server] Current online players:`, playersList.map(p => p.username));
}

io.on('connection', (socket) => {
  console.log(`[Server] Socket connected: ${socket.id}`);

  // Register player username
  socket.on('registerPlayer', (username) => {
    if (!username) return;
    
    // Check if username is already in use by another socket
    const existingSocketId = getSocketIdByUsername(username);
    if (existingSocketId && existingSocketId !== socket.id) {
      console.log(`[Server] Username collision: '${username}' already registered. Overwriting with new connection.`);
      activePlayers.delete(existingSocketId);
    }

    activePlayers.set(socket.id, username);
    console.log(`[Server] Registered: '${username}' for socket ${socket.id}`);
    
    // Broadcast updated player list
    broadcastOnlinePlayers();
  });

  // Challenge another player
  socket.on('challengePlayer', (data) => {
    const { target, challenger, challengerColor } = data;
    console.log(`[Server] Challenge: '${challenger}' challenged '${target}' as color: ${challengerColor}`);
    
    const targetSocketId = getSocketIdByUsername(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incomingChallenge', {
        challenger,
        challengerColor
      });
    } else {
      console.log(`[Server] Challenge target '${target}' not found online.`);
      socket.emit('playerOffline', { username: target });
    }
  });

  // Accept a challenge
  socket.on('acceptChallenge', (data) => {
    const { target, responder, responderColor } = data;
    console.log(`[Server] Challenge Accepted: '${responder}' accepted challenge from '${target}' as color: ${responderColor}`);
    
    const targetSocketId = getSocketIdByUsername(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('challengeAccepted', {
        responder,
        responderColor
      });
    }
  });

  // Relay piece moves between opposing players
  socket.on('movePiece', (data) => {
    const { target, sR, sC, eR, eC, result } = data;
    
    const targetSocketId = getSocketIdByUsername(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('pieceMoved', {
        sR,
        sC,
        eR,
        eC,
        result
      });
      console.log(`[Server] Move relayed from ${activePlayers.get(socket.id)} to ${target}: (${sR},${sC}) -> (${eR},${eC})`);
    } else {
      console.log(`[Server] Failed to relay move: Opponent '${target}' is offline.`);
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    const username = activePlayers.get(socket.id);
    if (username) {
      console.log(`[Server] Socket disconnected: ${socket.id} (username: '${username}')`);
      activePlayers.delete(socket.id);
      
      // Notify remaining players about offline status
      io.emit('playerDisconnected', { username });
      broadcastOnlinePlayers();
    } else {
      console.log(`[Server] Unregistered socket disconnected: ${socket.id}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Server] Thai Checkers 3D Server running on http://localhost:${PORT}`);
});
