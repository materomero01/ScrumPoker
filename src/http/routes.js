'use strict';

const express = require('express');
const config = require('../config');
const { DomainError } = require('../domain/Room');
const { ipRateLimit } = require('../rateLimit');

function createApiRouter(store) {
    const router = express.Router();
    const createLimit = ipRateLimit(config.CREATE_ROOM_LIMIT);
    const lookupLimit = ipRateLimit(config.LOOKUP_ROOM_LIMIT);

    router.post('/rooms', createLimit, (req, res) => {
        try {
            const room = store.create();
            res.status(201).json({ roomId: room.id });
        } catch (err) {
            if (err instanceof DomainError && err.code === 'TOO_MANY_ROOMS') {
                return res.status(503).json({ error: err.code });
            }
            throw err;
        }
    });

    router.get('/rooms/:roomId', lookupLimit, (req, res) => {
        const room = store.get(String(req.params.roomId).toLowerCase());
        if (!room) return res.status(404).json({ error: 'ROOM_NOT_FOUND' });
        res.json({ roomId: room.id, players: room.connectedCount, taskName: room.taskName });
    });

    if (config.EXPOSE_DEBUG) {
        router.get('/debug/rooms', (req, res) => {
            res.json([...store.rooms.values()].map(r => ({ id: r.id, players: r.players.size, task: r.taskName })));
        });
    }

    router.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

    router.stop = () => {
        createLimit.stop();
        lookupLimit.stop();
    };
    return router;
}

module.exports = { createApiRouter };
