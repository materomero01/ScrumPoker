const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomBytes } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    pingTimeout: 20000,
    pingInterval: 10000,
});

app.use(express.static('public'));

// ── ROOM STORE ──────────────────────────────────────────────────────────────
const rooms = new Map();
const ROOM_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours idle

function generateRoomId() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars
    let id;
    do {
        id = Array.from(randomBytes(5)).map(b => chars[b % chars.length]).join('');
    } while (rooms.has(id));
    return id;
}

function createRoom(roomId) {
    const state = {
        id: roomId,
        votes: {},
        visible: false,
        taskName: 'Tarea 1',
        history: [],
        lastActivity: Date.now(),
    };
    rooms.set(roomId, state);
    return state;
}

function getRoom(roomId) {
    return rooms.get(roomId) || null;
}

function touchRoom(room) {
    room.lastActivity = Date.now();
}

function broadcastRoom(room) {
    touchRoom(room);
    const { lastActivity, ...payload } = room;
    io.to(room.id).emit('update_state', payload);
}

// Clean idle rooms every 30 min
setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms) {
        if (now - room.lastActivity > ROOM_TTL_MS) {
            rooms.delete(id);
            console.log(`[rooms] Cleaned idle room: ${id}`);
        }
    }
}, 30 * 60 * 1000);

// ── REST ─────────────────────────────────────────────────────────────────────
app.post('/api/create-room', (req, res) => {
    const roomId = generateRoomId();
    createRoom(roomId);
    res.json({ roomId });
});

app.get('/api/room/:roomId', (req, res) => {
    const room = getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ exists: true, players: Object.keys(room.votes).length });
});

// ── SOCKET ───────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    let currentRoomId = null;

    function leaveCurrentRoom() {
        if (!currentRoomId) return;
        const room = getRoom(currentRoomId);
        if (room && room.votes[socket.id]) {
            delete room.votes[socket.id];
            socket.leave(currentRoomId);
            if (Object.keys(room.votes).length === 0) {
                // Keep room alive 10 min in case everyone refreshes
                setTimeout(() => {
                    const r = getRoom(currentRoomId);
                    if (r && Object.keys(r.votes).length === 0) {
                        rooms.delete(currentRoomId);
                        console.log(`[rooms] Deleted empty room: ${currentRoomId}`);
                    }
                }, 10 * 60 * 1000);
            } else {
                broadcastRoom(room);
            }
        }
        currentRoomId = null;
    }

    function doJoin(username, roomId, isRejoin) {
        const room = getRoom(roomId);
        if (!room) {
            socket.emit('room_error', { code: 'NOT_FOUND', roomId });
            return;
        }

        if (currentRoomId && currentRoomId !== roomId) leaveCurrentRoom();

        currentRoomId = roomId;
        socket.join(roomId);

        // On rejoin keep existing entry if still present (same socketId = fresh connect)
        if (isRejoin && room.votes[socket.id]) {
            socket.emit('joined', { resolvedName: room.votes[socket.id].name, roomId });
            broadcastRoom(room);
            return;
        }

        // Deduplicate name
        let name = (username || '').trim().slice(0, 24) || 'Anónimo';
        const existing = Object.values(room.votes).map(p => p.name);
        if (existing.includes(name)) {
            let s = 2;
            while (existing.includes(`${name} (${s})`)) s++;
            name = `${name} (${s})`;
        }

        room.votes[socket.id] = { name, value: null };
        socket.emit('joined', { resolvedName: name, roomId });
        broadcastRoom(room);
    }

    socket.on('join_game',   ({ username, roomId }) => doJoin(username, roomId, false));
    socket.on('rejoin_game', ({ username, roomId }) => doJoin(username, roomId, true));

    socket.on('cast_vote', ({ value }) => {
        const room = getRoom(currentRoomId);
        if (!room || !room.votes[socket.id]) return;
        room.votes[socket.id].value = value;
        broadcastRoom(room);
    });

    socket.on('reveal_votes', () => {
        const room = getRoom(currentRoomId);
        if (!room || room.visible) return;
        room.visible = true;
        const results = {};
        Object.values(room.votes).forEach(p => { results[p.name] = p.value; });
        room.history.push({ task: room.taskName, results });
        broadcastRoom(room);
    });

    socket.on('next_round', ({ taskName }) => {
        const room = getRoom(currentRoomId);
        if (!room || !room.visible) return;
        room.taskName = taskName;
        for (const id in room.votes) room.votes[id].value = null;
        room.visible = false;
        broadcastRoom(room);
    });

    socket.on('update_task', ({ taskName }) => {
        const room = getRoom(currentRoomId);
        if (!room) return;
        room.taskName = taskName;
        broadcastRoom(room);
    });

    socket.on('send_emoji', ({ toSocketId, emoji, fromPos }) => {
        const room = getRoom(currentRoomId);
        if (!room) return;
        io.to(room.id).emit('animate_emoji', { toSocketId, fromPos, emoji });
    });

    socket.on('disconnect', () => leaveCurrentRoom());
});

// Debug endpoint (optional, disable in prod)
app.get('/api/rooms-debug', (req, res) => {
    const data = [];
    for (const [id, room] of rooms) {
        data.push({ id, players: Object.keys(room.votes).length, task: room.taskName });
    }
    res.json(data);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Scrum Poker en puerto ${PORT}`));
