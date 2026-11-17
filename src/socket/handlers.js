'use strict';

const config = require('../config');
const log = require('../logger');
const { DomainError } = require('../domain/Room');
const { TokenBucket } = require('../rateLimit');
const { publicDecks } = require('../domain/decks');
const v = require('./validate');

/**
 * Registra los eventos de Socket.IO. Cada handler:
 *  1. valida el payload,
 *  2. delega en el dominio (Room),
 *  3. emite el nuevo estado.
 * Toda excepción se captura: un payload malformado nunca tumba el proceso.
 */
function registerSocketHandlers(io, store) {
    const sessions = new Map(); // `${roomId}:${clientId}` -> socket
    const graceTimers = new Map(); // `${roomId}:${clientId}` -> timeout
    const roomTimers = new Map(); // roomId -> timeout

    const key = (roomId, clientId) => `${roomId}:${clientId}`;

    const snapshot = room => ({ ...room.toPublic(), serverTime: Date.now() });

    function broadcast(room) {
        io.to(room.id).emit('state', snapshot(room));
    }

    function reveal(room, byClientId) {
        if (room.reveal(byClientId)) {
            clearRoomTimer(room.id);
            broadcast(room);
        }
    }

    function clearRoomTimer(roomId) {
        clearTimeout(roomTimers.get(roomId));
        roomTimers.delete(roomId);
    }

    function scheduleRoomTimer(room) {
        clearRoomTimer(room.id);
        if (!room.timer) return;
        const { endsAt } = room.timer;
        const t = setTimeout(() => {
            roomTimers.delete(room.id);
            if (store.get(room.id) !== room || !room.timer || room.timer.endsAt !== endsAt) return;
            room.timer = null;
            io.to(room.id).emit('timer_done');
            if (room.settings.autoReveal) reveal(room);
            else broadcast(room);
        }, Math.max(0, endsAt - Date.now()));
        t.unref();
        roomTimers.set(room.id, t);
    }

    function scheduleGrace(room, clientId) {
        const k = key(room.id, clientId);
        clearTimeout(graceTimers.get(k));
        const t = setTimeout(() => {
            graceTimers.delete(k);
            if (store.get(room.id) !== room) return;
            if (room.pruneDisconnected(Date.now()) > 0) {
                if (room.settings.autoReveal && !room.revealed && room.allVoted()) reveal(room);
                else broadcast(room);
            }
        }, config.PLAYER_GRACE_MS + 50);
        t.unref();
        graceTimers.set(k, t);
    }

    // Barrido periódico de salas vacías/inactivas
    const sweeper = setInterval(() => {
        for (const id of store.sweep(Date.now())) {
            clearRoomTimer(id);
            log.info('room.deleted', { roomId: id });
        }
    }, config.SWEEP_INTERVAL_MS);
    sweeper.unref();

    io.on('connection', socket => {
        const ctx = { roomId: null, clientId: null };
        const eventBucket = new TokenBucket(config.EVENT_BUCKET);
        const emojiBucket = new TokenBucket(config.EMOJI_BUCKET);

        const currentRoom = () => {
            const room = ctx.roomId ? store.get(ctx.roomId) : null;
            if (!room || !room.getPlayer(ctx.clientId)) throw new DomainError('NOT_IN_ROOM');
            return room;
        };

        /** Envuelve un handler con rate limit, try/catch y ack opcional. */
        function on(event, handler) {
            socket.on(event, (payload, ack) => {
                if (typeof payload === 'function') { ack = payload; payload = undefined; }
                const reply = typeof ack === 'function' ? ack : () => {};
                if (!eventBucket.take()) return reply({ ok: false, error: 'RATE_LIMITED' });
                try {
                    const result = handler(v.obj(payload));
                    reply({ ok: true, ...(result || {}) });
                } catch (err) {
                    if (err instanceof DomainError) return reply({ ok: false, error: err.code });
                    log.error('socket.handler_failed', { event, err: err.message });
                    reply({ ok: false, error: 'INTERNAL' });
                }
            });
        }

        function leave() {
            if (!ctx.roomId) return;
            const room = store.get(ctx.roomId);
            const k = key(ctx.roomId, ctx.clientId);
            if (sessions.get(k) === socket) {
                sessions.delete(k);
                if (room && room.disconnect(ctx.clientId)) {
                    scheduleGrace(room, ctx.clientId);
                    if (room.settings.autoReveal && !room.revealed && room.allVoted()) reveal(room);
                    else broadcast(room);
                }
            }
            socket.leave(ctx.roomId);
            ctx.roomId = null;
            ctx.clientId = null;
        }

        on('join', p => {
            const roomId = v.text(p.roomId, config.ROOM_ID_LENGTH + 2)?.toLowerCase();
            const clientId = v.clientId(p.clientId);
            const name = v.text(p.name, config.NAME_MAX);
            if (!clientId) throw new DomainError('INVALID');
            if (!name) throw new DomainError('NAME_REQUIRED');

            const room = store.get(roomId);
            if (!room) throw new DomainError('ROOM_NOT_FOUND');

            if (ctx.roomId && (ctx.roomId !== room.id || ctx.clientId !== clientId)) leave();

            // Misma identidad abierta en otra pestaña: la nueva conexión toma el asiento
            const k = key(room.id, clientId);
            const previous = sessions.get(k);
            if (previous && previous !== socket) {
                previous.emit('session_replaced');
                previous.leave(room.id);
                previous.data.replaced = true;
            }
            clearTimeout(graceTimers.get(k));
            graceTimers.delete(k);

            const role = p.role === 'observer' ? 'observer' : 'player';
            const { player, rejoined } = room.join({ clientId, name, role });
            sessions.set(k, socket);
            ctx.roomId = room.id;
            ctx.clientId = clientId;
            socket.data.replaced = false;
            socket.join(room.id);

            log.info('room.join', { roomId: room.id, rejoined });
            broadcast(room);
            return {
                rejoined,
                you: { id: player.id, name: player.name, role: player.role, vote: player.vote },
                state: snapshot(room),
                decks: publicDecks(),
            };
        });

        on('leave', () => {
            const room = currentRoom();
            const clientId = ctx.clientId;
            const k = key(room.id, clientId);
            sessions.delete(k);
            socket.leave(room.id);
            ctx.roomId = null;
            ctx.clientId = null;
            room.remove(clientId);
            broadcast(room);
        });

        on('vote', p => {
            const room = currentRoom();
            const value = v.cardValue(p.value);
            if (value === undefined) throw new DomainError('INVALID_CARD');
            const shouldReveal = room.vote(ctx.clientId, value);
            if (shouldReveal) reveal(room);
            else broadcast(room);
        });

        on('reveal', () => {
            const room = currentRoom();
            reveal(room, ctx.clientId);
        });

        on('next_round', p => {
            const room = currentRoom();
            room.nextRound(ctx.clientId, v.text(p.taskName, config.TASK_MAX));
            clearRoomTimer(room.id);
            broadcast(room);
        });

        on('update_task', p => {
            const room = currentRoom();
            const taskName = v.text(p.taskName, config.TASK_MAX);
            if (taskName === undefined) throw new DomainError('INVALID');
            room.setTask(ctx.clientId, taskName);
            broadcast(room);
        });

        on('update_settings', p => {
            const room = currentRoom();
            const shouldReveal = room.updateSettings(ctx.clientId, v.obj(p.settings));
            if (shouldReveal) reveal(room);
            else broadcast(room);
        });

        on('set_role', p => {
            const room = currentRoom();
            room.setRole(ctx.clientId, p.role);
            if (room.settings.autoReveal && !room.revealed && room.allVoted()) reveal(room);
            else broadcast(room);
        });

        on('timer_start', p => {
            const room = currentRoom();
            room.startTimer(ctx.clientId, p.seconds);
            scheduleRoomTimer(room);
            broadcast(room);
        });

        on('timer_stop', () => {
            const room = currentRoom();
            room.stopTimer(ctx.clientId);
            clearRoomTimer(room.id);
            broadcast(room);
        });

        on('kick', p => {
            const room = currentRoom();
            const targetClientId = room.kick(ctx.clientId, v.text(p.playerId, 16));
            const k = key(room.id, targetClientId);
            const target = sessions.get(k);
            sessions.delete(k);
            if (target) {
                target.emit('kicked');
                target.leave(room.id);
            }
            broadcast(room);
        });

        on('make_moderator', p => {
            const room = currentRoom();
            room.transferModerator(ctx.clientId, v.text(p.playerId, 16));
            broadcast(room);
        });

        on('get_history', () => {
            const room = currentRoom();
            return { history: room.history };
        });

        socket.on('emoji', payload => {
            try {
                if (!emojiBucket.take()) return;
                const room = currentRoom();
                if (!room.settings.emojis) return;
                const p = v.obj(payload);
                const emoji = v.emoji(p.emoji, config.EMOJI_MAX);
                const to = room.findByPublicId(v.text(p.to, 16));
                const from = room.getPlayer(ctx.clientId);
                if (!emoji || !to) return;
                io.to(room.id).emit('emoji', { from: from.id, to: to.player.id, emoji });
            } catch {
                // emojis: best effort, sin respuesta
            }
        });

        socket.on('disconnect', () => {
            if (socket.data.replaced) return;
            leave();
        });
    });

    return {
        close() {
            clearInterval(sweeper);
            for (const t of graceTimers.values()) clearTimeout(t);
            for (const t of roomTimers.values()) clearTimeout(t);
        },
    };
}

module.exports = { registerSocketHandlers };
