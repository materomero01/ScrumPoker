'use strict';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

function intFromEnv(name, fallback) {
    const raw = process.env[name];
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

module.exports = Object.freeze({
    PORT: intFromEnv('PORT', 3000),
    EXPOSE_DEBUG: process.env.NODE_ENV === 'development',

    // Rooms
    ROOM_ID_LENGTH: 5,
    ROOM_ID_ALPHABET: 'abcdefghjkmnpqrstuvwxyz23456789', // sin caracteres ambiguos
    ROOM_IDLE_TTL_MS: 4 * HOUR,
    EMPTY_ROOM_TTL_MS: 10 * MINUTE,
    SWEEP_INTERVAL_MS: MINUTE,
    MAX_ROOMS: intFromEnv('MAX_ROOMS', 2000),
    MAX_PLAYERS_PER_ROOM: 40,
    MAX_HISTORY: 200,

    // Players
    PLAYER_GRACE_MS: 30 * SECOND, // tiempo para reconectar sin perder el asiento ni el voto
    NAME_MAX: 24,
    TASK_MAX: 80,
    EMOJI_MAX: 16,

    // Timer
    TIMER_MIN_SEC: 10,
    TIMER_MAX_SEC: 60 * 60,

    // Abuse protection
    MAX_HTTP_BUFFER: 16 * 1024,
    EMOJI_BUCKET: { capacity: 10, refillPerSec: 4 },
    EVENT_BUCKET: { capacity: 40, refillPerSec: 15 },
    CREATE_ROOM_LIMIT: { windowMs: MINUTE, max: 20 },
    LOOKUP_ROOM_LIMIT: { windowMs: MINUTE, max: 60 },
});
