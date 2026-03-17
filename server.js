const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // Serviremos los archivos web desde la carpeta /public

// Estructura: { "sala123": { votes: { socketId: valor }, visible: false } }
let rooms = {};

io.on('connection', (socket) => {
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { votes: {}, visible: false };
    }
    io.to(roomId).emit('update_state', rooms[roomId]);
  });

  socket.on('cast_vote', ({ roomId, value }) => {
    if (rooms[roomId]) {
      rooms[roomId].votes[socket.id] = value;
      io.to(roomId).emit('update_state', rooms[roomId]);
    }
  });

  socket.on('reveal_votes', (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].visible = true;
      io.to(roomId).emit('update_state', rooms[roomId]);
    }
  });

  socket.on('reset_game', (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId] = { votes: {}, visible: false };
      io.to(roomId).emit('update_state', rooms[roomId]);
    }
  });

  socket.on('disconnecting', () => {
    socket.rooms.forEach(roomId => {
      if (rooms[roomId]) {
        delete rooms[roomId].votes[socket.id];
        io.to(roomId).emit('update_state', rooms[roomId]);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
