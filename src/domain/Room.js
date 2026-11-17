'use strict';

const { randomUUID } = require('crypto');
const config = require('../config');
const { DEFAULT_DECK, isDeck, normalizeCard, deckValues } = require('./decks');
const { computeStats } = require('./stats');

const ROLES = Object.freeze(['player', 'observer']);

class DomainError extends Error {
    constructor(code, message) {
        super(message || code);
        this.code = code;
    }
}

/**
 * Lógica pura de una sala: no conoce sockets ni timers.
 * Los jugadores se indexan por `clientId` (secreto, persistente en el navegador)
 * y se exponen con `id` público, que es el único que ven los demás.
 */
class Room {
    constructor(id, now = Date.now()) {
        this.id = id;
        this.players = new Map(); // clientId -> player
        this.banned = new Set(); // clientIds expulsados
        this.moderatorClientId = null;
        this.revealed = false;
        this.taskName = 'Tarea 1';
        this.round = 1;
        this.history = [];
        this.lastStats = null;
        this.timer = null; // { endsAt, seconds }
        this.settings = {
            deck: DEFAULT_DECK,
            autoReveal: false,
            moderatorOnly: false,
            emojis: true,
            timerSec: 60,
        };
        this.lastActivity = now;
        this.emptySince = now;
    }

    touch(now = Date.now()) {
        this.lastActivity = now;
    }

    // ── Jugadores ─────────────────────────────────────────────────────────

    get connectedCount() {
        let n = 0;
        for (const p of this.players.values()) if (p.connected) n++;
        return n;
    }

    getPlayer(clientId) {
        return this.players.get(clientId) || null;
    }

    findByPublicId(publicId) {
        for (const [clientId, p] of this.players) if (p.id === publicId) return { clientId, player: p };
        return null;
    }

    uniqueName(name, exceptClientId) {
        const taken = new Set([...this.players].filter(([cid]) => cid !== exceptClientId).map(([, p]) => p.name.toLowerCase()));
        if (!taken.has(name.toLowerCase())) return name;
        let n = 2;
        while (taken.has(`${name} (${n})`.toLowerCase())) n++;
        return `${name} (${n})`;
    }

    /**
     * Entra o vuelve a entrar. Si el clientId ya estaba, conserva asiento, voto y rol.
     * @returns {{ player: object, rejoined: boolean }}
     */
    join({ clientId, name, role = 'player' }, now = Date.now()) {
        let player = this.players.get(clientId);
        const rejoined = Boolean(player);

        if (!player) {
            if (this.banned.has(clientId)) throw new DomainError('KICKED');
            if (this.players.size >= config.MAX_PLAYERS_PER_ROOM) throw new DomainError('ROOM_FULL');
            player = {
                id: randomUUID().slice(0, 8),
                name: this.uniqueName(name, clientId),
                role: ROLES.includes(role) ? role : 'player',
                vote: null,
                connected: true,
                disconnectedAt: null,
                joinedAt: now,
            };
            this.players.set(clientId, player);
        } else {
            player.connected = true;
            player.disconnectedAt = null;
            if (name && name !== player.name) player.name = this.uniqueName(name, clientId);
        }

        if (!this.moderatorClientId || !this.players.has(this.moderatorClientId)) {
            this.moderatorClientId = clientId;
        }
        this.emptySince = null;
        this.touch(now);
        return { player, rejoined };
    }

    disconnect(clientId, now = Date.now()) {
        const p = this.players.get(clientId);
        if (!p) return false;
        p.connected = false;
        p.disconnectedAt = now;
        if (this.connectedCount === 0) this.emptySince = now;
        this.touch(now);
        return true;
    }

    remove(clientId, now = Date.now()) {
        if (!this.players.delete(clientId)) return false;
        if (this.moderatorClientId === clientId) this.moderatorClientId = this.pickNextModerator();
        if (this.connectedCount === 0 && this.emptySince === null) this.emptySince = now;
        this.touch(now);
        return true;
    }

    pickNextModerator() {
        let best = null;
        for (const [cid, p] of this.players) {
            if (!p.connected) continue;
            if (!best || p.joinedAt < best.p.joinedAt) best = { cid, p };
        }
        if (best) return best.cid;
        const first = this.players.keys().next();
        return first.done ? null : first.value;
    }

    /** Elimina a quienes llevan más de `graceMs` desconectados. Devuelve cuántos salieron. */
    pruneDisconnected(now, graceMs = config.PLAYER_GRACE_MS) {
        let removed = 0;
        for (const [cid, p] of [...this.players]) {
            if (!p.connected && now - p.disconnectedAt >= graceMs) {
                this.remove(cid, now);
                removed++;
            }
        }
        return removed;
    }

    isModerator(clientId) {
        return this.moderatorClientId === clientId;
    }

    assertCanControl(clientId) {
        if (!this.players.has(clientId)) throw new DomainError('NOT_IN_ROOM');
        if (this.settings.moderatorOnly && !this.isModerator(clientId)) throw new DomainError('FORBIDDEN');
    }

    assertModerator(clientId) {
        if (!this.isModerator(clientId)) throw new DomainError('FORBIDDEN');
    }

    setRole(clientId, role) {
        const p = this.players.get(clientId);
        if (!p) throw new DomainError('NOT_IN_ROOM');
        if (!ROLES.includes(role)) throw new DomainError('INVALID');
        p.role = role;
        if (role === 'observer') p.vote = null;
        this.touch();
    }

    kick(byClientId, targetPublicId) {
        this.assertModerator(byClientId);
        const target = this.findByPublicId(targetPublicId);
        if (!target) throw new DomainError('NOT_FOUND');
        if (target.clientId === byClientId) throw new DomainError('INVALID');
        this.remove(target.clientId);
        this.banned.add(target.clientId);
        return target.clientId;
    }

    transferModerator(byClientId, targetPublicId) {
        this.assertModerator(byClientId);
        const target = this.findByPublicId(targetPublicId);
        if (!target) throw new DomainError('NOT_FOUND');
        this.moderatorClientId = target.clientId;
        this.touch();
    }

    // ── Ronda ─────────────────────────────────────────────────────────────

    get voters() {
        return [...this.players.values()].filter(p => p.role === 'player' && p.connected);
    }

    allVoted() {
        const v = this.voters;
        return v.length > 0 && v.every(p => p.vote !== null);
    }

    /**
     * Registra (o retira, con null) un voto. Devuelve true si corresponde auto-revelar.
     */
    vote(clientId, value) {
        const p = this.players.get(clientId);
        if (!p) throw new DomainError('NOT_IN_ROOM');
        if (p.role !== 'player') throw new DomainError('OBSERVER');
        if (this.revealed) throw new DomainError('ALREADY_REVEALED');
        if (value === null) {
            p.vote = null;
        } else {
            const card = normalizeCard(this.settings.deck, value);
            if (card === undefined) throw new DomainError('INVALID_CARD');
            p.vote = card;
        }
        this.touch();
        return this.settings.autoReveal && this.allVoted();
    }

    reveal(clientId, now = Date.now()) {
        if (clientId !== undefined) this.assertCanControl(clientId);
        if (this.revealed) return false;
        const results = [...this.players.values()]
            .filter(p => p.role === 'player' && p.vote !== null)
            .map(p => ({ name: p.name, vote: p.vote }));
        this.revealed = true;
        this.timer = null;
        this.lastStats = computeStats(results, this.settings.deck);
        if (results.length) {
            this.history.push({
                round: this.round,
                task: this.taskName,
                deck: this.settings.deck,
                at: now,
                results,
                stats: this.lastStats,
            });
            if (this.history.length > config.MAX_HISTORY) this.history.shift();
        }
        this.touch(now);
        return true;
    }

    nextRound(clientId, taskName) {
        this.assertCanControl(clientId);
        for (const p of this.players.values()) p.vote = null;
        this.revealed = false;
        this.lastStats = null;
        this.timer = null;
        this.round++;
        this.taskName = taskName || nextTaskName(this.taskName);
        this.touch();
    }

    setTask(clientId, taskName) {
        this.assertCanControl(clientId);
        this.taskName = taskName;
        this.touch();
    }

    updateSettings(clientId, patch) {
        this.assertModerator(clientId);
        const s = this.settings;
        if (patch.deck !== undefined) {
            if (!isDeck(patch.deck)) throw new DomainError('INVALID');
            if (patch.deck !== s.deck) {
                s.deck = patch.deck;
                for (const p of this.players.values()) p.vote = null;
                this.revealed = false;
                this.lastStats = null;
            }
        }
        for (const key of ['autoReveal', 'moderatorOnly', 'emojis']) {
            if (patch[key] !== undefined) s[key] = Boolean(patch[key]);
        }
        if (patch.timerSec !== undefined) {
            const n = Number(patch.timerSec);
            if (!Number.isInteger(n) || n < config.TIMER_MIN_SEC || n > config.TIMER_MAX_SEC) throw new DomainError('INVALID');
            s.timerSec = n;
        }
        this.touch();
        return s.autoReveal && !this.revealed && this.allVoted();
    }

    startTimer(clientId, seconds, now = Date.now()) {
        this.assertCanControl(clientId);
        if (this.revealed) throw new DomainError('ALREADY_REVEALED');
        const sec = seconds === undefined ? this.settings.timerSec : Number(seconds);
        if (!Number.isInteger(sec) || sec < config.TIMER_MIN_SEC || sec > config.TIMER_MAX_SEC) throw new DomainError('INVALID');
        this.timer = { seconds: sec, endsAt: now + sec * 1000 };
        this.touch(now);
        return this.timer;
    }

    stopTimer(clientId) {
        this.assertCanControl(clientId);
        this.timer = null;
        this.touch();
    }

    // ── Serialización ─────────────────────────────────────────────────────

    /** Estado público. Los votos solo viajan cuando la ronda está revelada. */
    toPublic() {
        const moderator = this.players.get(this.moderatorClientId);
        return {
            id: this.id,
            taskName: this.taskName,
            round: this.round,
            revealed: this.revealed,
            settings: { ...this.settings },
            deck: deckValues(this.settings.deck),
            timer: this.timer,
            moderatorId: moderator ? moderator.id : null,
            players: [...this.players.values()]
                .sort((a, b) => a.joinedAt - b.joinedAt)
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    connected: p.connected,
                    voted: p.vote !== null,
                    vote: this.revealed ? p.vote : null,
                })),
            stats: this.revealed ? this.lastStats : null,
            historyCount: this.history.length,
        };
    }
}

function nextTaskName(current) {
    const t = (current || 'Tarea').trim();
    if (/\d+$/.test(t)) return t.replace(/\d+$/, n => String(Number(n) + 1));
    return `${t} 2`;
}

module.exports = { Room, DomainError, ROLES, nextTaskName };
