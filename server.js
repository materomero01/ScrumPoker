const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Un solo estado global para todos los usuarios
let gameState = {
    votes: {},
    visible: false,
    taskName: "Tarea 1",
    history: []
};

io.on('connection', (socket) => {
    // Al conectar, solo pedimos el username y lo metemos al estado global
    socket.on('join_game', ({ username }) => {
        gameState.votes[socket.id] = { name: username, value: null };
        // Emitimos a todos los conectados
        io.emit('update_state', gameState);
    });

    socket.on('cast_vote', ({ value }) => {
        if (gameState.votes[socket.id]) {
            gameState.votes[socket.id].value = value;
            io.emit('update_state', gameState);
        }
    });

    socket.on('reveal_votes', () => {
        gameState.visible = true;
        const roundResults = {};
        Object.values(gameState.votes).forEach(p => { 
            roundResults[p.name] = p.value; 
        });
        gameState.history.push({ task: gameState.taskName, results: roundResults });
        io.emit('update_state', gameState);
    });

    socket.on('reset_game', () => {
        for (let id in gameState.votes) {
            gameState.votes[id].value = null;
        }
        gameState.visible = false;
        io.emit('update_state', gameState);
    });

    socket.on('update_task', ({ taskName }) => {
        gameState.taskName = taskName;
        io.emit('update_state', gameState);
    });

    socket.on('send_emoji', ({ toSocketId, emoji, fromPos }) => {
        io.emit('animate_emoji', { toSocketId, fromPos, emoji });
    });

    socket.on('disconnect', () => {
        if (gameState.votes[socket.id]) {
            delete gameState.votes[socket.id];
            io.emit('update_state', gameState);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
