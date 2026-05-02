const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let gameState = {
    votes: {},
    visible: false,
    taskName: "Tarea 1",
    history: []
};

function broadcastState() {
    io.emit('update_state', gameState);
}

io.on('connection', (socket) => {

    // Send current state immediately on connect so late joiners are in sync
    socket.emit('update_state', gameState);

    socket.on('join_game', ({ username }) => {
        // Deduplicate names: append (2), (3), etc.
        let name = username.trim() || 'Anónimo';
        const existingNames = Object.values(gameState.votes).map(p => p.name);
        if (existingNames.includes(name)) {
            let suffix = 2;
            while (existingNames.includes(`${name} (${suffix})`)) suffix++;
            name = `${name} (${suffix})`;
        }
        gameState.votes[socket.id] = { name, value: null };
        // Send back the resolved name so client knows what it got
        socket.emit('joined', { resolvedName: name });
        broadcastState();
    });

    socket.on('cast_vote', ({ value }) => {
        if (gameState.votes[socket.id]) {
            gameState.votes[socket.id].value = value;
            broadcastState();
        }
    });

    socket.on('reveal_votes', () => {
        // Idempotent: ignore if already visible
        if (gameState.visible) return;
        gameState.visible = true;
        const roundResults = {};
        Object.values(gameState.votes).forEach(p => {
            roundResults[p.name] = p.value;
        });
        gameState.history.push({ task: gameState.taskName, results: roundResults });
        broadcastState();
    });

    // Atomic: advance task name + reset votes in a single server-side operation
    socket.on('next_round', ({ taskName }) => {
        // Only process if currently visible (prevents duplicate triggers)
        if (!gameState.visible) return;
        gameState.taskName = taskName;
        for (let id in gameState.votes) {
            gameState.votes[id].value = null;
        }
        gameState.visible = false;
        broadcastState();
    });

    socket.on('update_task', ({ taskName }) => {
        gameState.taskName = taskName;
        broadcastState();
    });

    socket.on('send_emoji', ({ toSocketId, emoji, fromPos }) => {
        io.emit('animate_emoji', { toSocketId, fromPos, emoji });
    });

    socket.on('disconnect', () => {
        if (gameState.votes[socket.id]) {
            delete gameState.votes[socket.id];
            broadcastState();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
