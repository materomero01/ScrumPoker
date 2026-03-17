const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', ({ roomId, username }) => {
        socket.join(roomId);
        socket.currentRoom = roomId;
        
        if (!rooms[roomId]) {
            rooms[roomId] = { votes: {}, visible: false };
        }
        
        // Registrar al usuario
        rooms[roomId].votes[socket.id] = { name: username, value: null };
        
        io.to(roomId).emit('update_state', rooms[roomId]);
    });

    socket.on('cast_vote', ({ roomId, value }) => {
        if (rooms[roomId] && rooms[roomId].votes[socket.id]) {
            rooms[roomId].votes[socket.id].value = value;
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
            for (let id in rooms[roomId].votes) {
                rooms[roomId].votes[id].value = null;
            }
            rooms[roomId].visible = false;
            io.to(roomId).emit('update_state', rooms[roomId]);
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.currentRoom;
        if (roomId && rooms[roomId]) {
            delete rooms[roomId].votes[socket.id];
            // Si la sala queda vacía, la borramos para ahorrar memoria
            if (Object.keys(rooms[roomId].votes).length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('update_state', rooms[roomId]);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
