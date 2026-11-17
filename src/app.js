'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const log = require('./logger');
const { RoomStore } = require('./domain/RoomStore');
const { createApiRouter } = require('./http/routes');
const { securityHeaders } = require('./http/securityHeaders');
const { registerSocketHandlers } = require('./socket/handlers');

/** Crea la app sin escuchar en ningún puerto (útil para tests). */
function createApp({ store = new RoomStore() } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(securityHeaders);
    app.use(express.json({ limit: '2kb' }));

    app.get('/healthz', (req, res) => res.json({ ok: true, rooms: store.size }));
    const api = createApiRouter(store);
    app.use('/api', api);
    app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        log.error('http.error', { err: err.message, path: req.path });
        res.status(500).json({ error: 'INTERNAL' });
    });

    const server = http.createServer(app);
    const io = new Server(server, {
        pingTimeout: 20000,
        pingInterval: 10000,
        maxHttpBufferSize: config.MAX_HTTP_BUFFER,
        serveClient: true,
    });
    const sockets = registerSocketHandlers(io, store);

    async function close() {
        sockets.close();
        api.stop();
        await new Promise(resolve => io.close(() => resolve()));
    }

    return { app, server, io, store, close };
}

module.exports = { createApp };
