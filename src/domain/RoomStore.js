'use strict';

const { randomBytes } = require('crypto');
const config = require('../config');
const { Room, DomainError } = require('./Room');

const ROOM_ID_RE = new RegExp(`^[${config.ROOM_ID_ALPHABET}]{${config.ROOM_ID_LENGTH}}$`);

function isValidRoomId(id) {
    return typeof id === 'string' && ROOM_ID_RE.test(id);
}

/**
 * Almacén en memoria. Mantiene una interfaz chica (create/get/delete/sweep)
 * para poder cambiarlo por Redis u otro backend sin tocar los handlers.
 */
class RoomStore {
    constructor({ maxRooms = config.MAX_ROOMS } = {}) {
        this.rooms = new Map();
        this.maxRooms = maxRooms;
    }

    get size() {
        return this.rooms.size;
    }

    generateId() {
        const { ROOM_ID_ALPHABET: chars, ROOM_ID_LENGTH: len } = config;
        let id;
        do {
            id = Array.from(randomBytes(len), b => chars[b % chars.length]).join('');
        } while (this.rooms.has(id));
        return id;
    }

    create(now = Date.now()) {
        if (this.rooms.size >= this.maxRooms) throw new DomainError('TOO_MANY_ROOMS');
        const room = new Room(this.generateId(), now);
        this.rooms.set(room.id, room);
        return room;
    }

    get(id) {
        return isValidRoomId(id) ? this.rooms.get(id) || null : null;
    }

    delete(id) {
        return this.rooms.delete(id);
    }

    /**
     * Borra salas vacías hace más de EMPTY_ROOM_TTL_MS o inactivas más de ROOM_IDLE_TTL_MS.
     * @returns {string[]} ids borrados
     */
    sweep(now = Date.now()) {
        const deleted = [];
        for (const [id, room] of this.rooms) {
            const emptyTooLong = room.emptySince !== null && now - room.emptySince >= config.EMPTY_ROOM_TTL_MS;
            const idleTooLong = now - room.lastActivity >= config.ROOM_IDLE_TTL_MS;
            if (emptyTooLong || idleTooLong) {
                this.rooms.delete(id);
                deleted.push(id);
            }
        }
        return deleted;
    }
}

module.exports = { RoomStore, isValidRoomId };
