'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, nextTaskName } = require('../src/domain/Room');
const { RoomStore, isValidRoomId } = require('../src/domain/RoomStore');
const config = require('../src/config');

const A = 'client-aaaaaaaaaaaaaaaa';
const B = 'client-bbbbbbbbbbbbbbbb';
const C = 'client-cccccccccccccccc';

function roomWith(...ids) {
    const room = new Room('abcde', 0);
    ids.forEach((id, i) => room.join({ clientId: id, name: `P${i}` }, i));
    return room;
}

test('el primero en entrar es moderador y se transfiere al salir', () => {
    const room = roomWith(A, B);
    assert.ok(room.isModerator(A));
    room.remove(A);
    assert.ok(room.isModerator(B));
});

test('nombres duplicados se desambiguan sin distinguir mayúsculas', () => {
    const room = new Room('abcde');
    room.join({ clientId: A, name: 'Ana' });
    const { player } = room.join({ clientId: B, name: 'ana' });
    assert.equal(player.name, 'ana (2)');
});

test('rejoin con el mismo clientId conserva voto y asiento', () => {
    const room = roomWith(A, B);
    room.vote(A, 5);
    room.disconnect(A, 100);
    const { player, rejoined } = room.join({ clientId: A, name: 'P0' }, 200);
    assert.equal(rejoined, true);
    assert.equal(player.vote, 5);
    assert.equal(room.players.size, 2);
});

test('los desconectados no bloquean "todos votaron" y se purgan tras la gracia', () => {
    const room = roomWith(A, B);
    room.vote(A, 3);
    room.disconnect(B, 1000);
    assert.equal(room.allVoted(), true);
    assert.equal(room.pruneDisconnected(1000 + config.PLAYER_GRACE_MS - 1), 0);
    assert.equal(room.pruneDisconnected(1000 + config.PLAYER_GRACE_MS), 1);
    assert.equal(room.players.size, 1);
});

test('votos ocultos hasta revelar', () => {
    const room = roomWith(A, B);
    room.vote(A, 8);
    const before = room.toPublic();
    assert.equal(before.players[0].voted, true);
    assert.equal(before.players[0].vote, null);
    room.reveal(A);
    assert.equal(room.toPublic().players[0].vote, 8);
});

test('rechaza cartas fuera del mazo y normaliza strings numéricos', () => {
    const room = roomWith(A);
    assert.throws(() => room.vote(A, 4), { code: 'INVALID_CARD' });
    assert.throws(() => room.vote(A, '<img>'), { code: 'INVALID_CARD' });
    room.vote(A, '13');
    assert.equal(room.getPlayer(A).vote, 13);
});

test('observadores no votan ni cuentan', () => {
    const room = roomWith(A, B);
    room.setRole(B, 'observer');
    assert.throws(() => room.vote(B, 3), { code: 'OBSERVER' });
    room.vote(A, 3);
    assert.equal(room.allVoted(), true);
});

test('auto-reveal se activa con el último voto', () => {
    const room = roomWith(A, B);
    room.updateSettings(A, { autoReveal: true });
    assert.equal(room.vote(A, 1), false);
    assert.equal(room.vote(B, 2), true);
});

test('modo solo-moderador bloquea revelar a los demás', () => {
    const room = roomWith(A, B);
    room.updateSettings(A, { moderatorOnly: true });
    assert.throws(() => room.reveal(B), { code: 'FORBIDDEN' });
    assert.throws(() => room.updateSettings(B, { emojis: false }), { code: 'FORBIDDEN' });
    assert.equal(room.reveal(A), true);
});

test('revelar guarda historial con estadísticas y se puede revelar sin todos los votos', () => {
    const room = roomWith(A, B, C);
    room.vote(A, 5);
    room.reveal(B);
    assert.equal(room.history.length, 1);
    assert.equal(room.history[0].stats.votes, 1);
    assert.equal(room.reveal(B), false, 'no revela dos veces');
});

test('revelar sin votos no ensucia el historial', () => {
    const room = roomWith(A);
    room.reveal(A);
    assert.equal(room.history.length, 0);
});

test('siguiente ronda limpia votos e incrementa la tarea', () => {
    const room = roomWith(A);
    room.vote(A, 5);
    room.reveal(A);
    room.nextRound(A);
    assert.equal(room.taskName, 'Tarea 2');
    assert.equal(room.round, 2);
    assert.equal(room.getPlayer(A).vote, null);
    assert.equal(nextTaskName('JIRA-41'), 'JIRA-42');
    assert.equal(nextTaskName('Login'), 'Login 2');
});

test('cambiar de mazo reinicia los votos', () => {
    const room = roomWith(A);
    room.vote(A, 5);
    room.updateSettings(A, { deck: 'tshirt' });
    assert.equal(room.getPlayer(A).vote, null);
    assert.throws(() => room.updateSettings(A, { deck: 'nope' }), { code: 'INVALID' });
});

test('expulsar banea al clientId', () => {
    const room = roomWith(A, B);
    const bId = room.getPlayer(B).id;
    assert.throws(() => room.kick(B, room.getPlayer(A).id), { code: 'FORBIDDEN' });
    room.kick(A, bId);
    assert.throws(() => room.join({ clientId: B, name: 'x' }), { code: 'KICKED' });
});

test('temporizador valida rango', () => {
    const room = roomWith(A);
    assert.throws(() => room.startTimer(A, 1), { code: 'INVALID' });
    const t = room.startTimer(A, 30, 1000);
    assert.equal(t.endsAt, 31000);
});

test('store: ids válidos, límite de salas y barrido', () => {
    const store = new RoomStore({ maxRooms: 2 });
    const room = store.create(0);
    assert.ok(isValidRoomId(room.id));
    assert.equal(store.get('<script>'), null);
    store.create(0);
    assert.throws(() => store.create(0), { code: 'TOO_MANY_ROOMS' });
    // salas nunca usadas quedan vacías desde su creación
    assert.deepEqual(store.sweep(config.EMPTY_ROOM_TTL_MS - 1), []);
    assert.equal(store.sweep(config.EMPTY_ROOM_TTL_MS).length, 2);
});

test('store: sala con gente conectada no se borra hasta el TTL de inactividad', () => {
    const store = new RoomStore();
    const room = store.create(0);
    room.join({ clientId: A, name: 'A' }, 0);
    assert.deepEqual(store.sweep(config.EMPTY_ROOM_TTL_MS * 2), []);
    assert.equal(store.sweep(config.ROOM_IDLE_TTL_MS).length, 1);
});
