const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
            rooms[roomId] = { 
                votes: {}, 
                visible: false, 
                taskName: "Nueva Tarea", 
                timer: null 
            };
        }
        rooms[roomId].votes[socket.id] = { name: username, value: null };
        io.to(roomId).emit('update_state', rooms[roomId]);
    });

    socket.on('update_task', ({ roomId, taskName }) => {
        if (rooms[roomId]) {
            rooms[roomId].taskName = taskName;
            io.to(roomId).emit('update_state', rooms[roomId]);
        }
    });

    socket.on('cast_vote', ({ roomId, value }) => {
        if (rooms[roomId]) {
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
            for (let id in rooms[roomId].votes) rooms[roomId].votes[id].value = null;
            rooms[roomId].visible = false;
            io.to(roomId).emit('update_state', rooms[roomId]);
        }
    });

    socket.on('start_timer', (roomId) => {
        io.to(roomId).emit('timer_triggered', 60); // 60 segundos
    });

    socket.on('disconnect', () => {
        const r = socket.currentRoom;
        if (r && rooms[r]) {
            delete rooms[r].votes[socket.id];
            if (Object.keys(rooms[r].votes).length === 0) delete rooms[r];
            else io.to(r).emit('update_state', rooms[r]);
        }
    });
});

server.listen(process.env.PORT || 3000);
