'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createApp } = require('../src/app');

let ctx;
let url;
const clients = [];

test.before(async () => {
    ctx = createApp();
    await new Promise(r => ctx.server.listen(0, r));
    url = `http://localhost:${ctx.server.address().port}`;
});

test.after(async () => {
    clients.forEach(c => c.close());
    await ctx.close();
});

let seq = 0;
function client() {
    const c = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    c.clientId = `test-client-${String(++seq).padStart(10, '0')}`;
    clients.push(c);
    return new Promise(resolve => c.on('connect', () => resolve(c)));
}

const call = (c, event, payload) => new Promise(resolve => c.emit(event, payload, resolve));
const waitState = (c, pred) => new Promise(resolve => {
    const fn = s => { if (pred(s)) { c.off('state', fn); resolve(s); } };
    c.on('state', fn);
});

async function createRoom() {
    const res = await fetch(`${url}/api/rooms`, { method: 'POST' });
    assert.equal(res.status, 201);
    return (await res.json()).roomId;
}

test('REST: crear y consultar sala, ids inválidos dan 404, sin endpoint de debug', async () => {
    const roomId = await createRoom();
    assert.equal((await fetch(`${url}/api/rooms/${roomId}`)).status, 200);
    assert.equal((await fetch(`${url}/api/rooms/${roomId.toUpperCase()}`)).status, 200);
    assert.equal((await fetch(`${url}/api/rooms/%3Cimg%3E`)).status, 404);
    assert.equal((await fetch(`${url}/api/rooms-debug`)).status, 404);
    const health = await (await fetch(`${url}/healthz`)).json();
    assert.equal(health.ok, true);
});

test('flujo completo: unirse, votar en secreto, revelar con estadísticas', async () => {
    const roomId = await createRoom();
    const a = await client();
    const b = await client();

    const ja = await call(a, 'join', { roomId, clientId: a.clientId, name: 'Ana' });
    assert.equal(ja.ok, true);
    assert.equal(ja.state.moderatorId, ja.you.id);
    const jb = await call(b, 'join', { roomId: roomId.toUpperCase(), clientId: b.clientId, name: 'Beto' });
    assert.equal(jb.ok, true);

    await call(a, 'vote', { value: 5 });
    const seenByB = waitState(b, st => st.players.every(p => p.voted));
    await call(b, 'vote', { value: 8 });
    const s = await seenByB;
    assert.ok(s.players.every(p => p.voted));
    assert.ok(s.players.every(p => p.vote === null), 'los votos no se filtran antes de revelar');

    const revealed = waitState(b, st => st.revealed);
    assert.equal((await call(a, 'reveal')).ok, true);
    const r = await revealed;
    assert.equal(r.revealed, true);
    assert.equal(r.stats.average, 6.5);
    assert.deepEqual(r.players.map(p => p.vote).sort(), [5, 8]);

    const h = await call(b, 'get_history');
    assert.equal(h.history.length, 1);
});

test('payloads malformados no tumban el servidor', async () => {
    const c = await client();
    const bad = [undefined, null, 42, 'x', [], { roomId: { $gt: '' } }, { name: 123, clientId: 5 }];
    for (const p of bad) {
        for (const ev of ['join', 'vote', 'reveal', 'next_round', 'update_task', 'update_settings', 'kick', 'timer_start']) {
            const res = await call(c, ev, p);
            assert.equal(res.ok, false, `${ev} con ${JSON.stringify(p)} -> ${JSON.stringify(res)}`);
        }
        c.emit('emoji', p);
    }
    c.emit('join'); // sin ack ni payload
    const roomId = await createRoom();
    const fresh = await client();
    const ok = await call(fresh, 'join', { roomId, clientId: fresh.clientId, name: 'Sigue vivo' });
    assert.equal(ok.ok, true);
});

test('reconexión con el mismo clientId conserva el voto', async () => {
    const roomId = await createRoom();
    const a = await client();
    const b = await client();
    await call(a, 'join', { roomId, clientId: a.clientId, name: 'Ana' });
    await call(b, 'join', { roomId, clientId: b.clientId, name: 'Beto' });
    await call(b, 'vote', { value: 3 });

    const disconnected = waitState(a, st => st.players.some(p => p.name === 'Beto' && !p.connected));
    b.close();
    const s = await disconnected;
    assert.equal(s.players.find(p => p.name === 'Beto').connected, false);

    const b2 = await client();
    const res = await call(b2, 'join', { roomId, clientId: b.clientId, name: 'Beto' });
    assert.equal(res.rejoined, true);
    assert.equal(res.you.vote, 3);
    assert.equal(res.state.players.length, 2, 'sin duplicados fantasma');
});

test('nombres con HTML se guardan como texto plano y las cartas inválidas se rechazan', async () => {
    const roomId = await createRoom();
    const a = await client();
    const res = await call(a, 'join', { roomId, clientId: a.clientId, name: '<img src=x onerror=alert(1)>' });
    assert.equal(res.ok, true);
    assert.equal(res.you.name, '<img src=x onerror=alert(1)>'.slice(0, 24));
    const bad = await call(a, 'vote', { value: '<b>' });
    assert.deepEqual(bad, { ok: false, error: 'INVALID_CARD' });
});

test('solo el moderador cambia la configuración y puede expulsar', async () => {
    const roomId = await createRoom();
    const a = await client();
    const b = await client();
    await call(a, 'join', { roomId, clientId: a.clientId, name: 'Mod' });
    const jb = await call(b, 'join', { roomId, clientId: b.clientId, name: 'Otro' });

    assert.equal((await call(b, 'update_settings', { settings: { moderatorOnly: true } })).error, 'FORBIDDEN');
    assert.equal((await call(a, 'update_settings', { settings: { moderatorOnly: true } })).ok, true);
    assert.equal((await call(b, 'reveal')).error, 'FORBIDDEN');

    const kicked = new Promise(r => b.once('kicked', r));
    assert.equal((await call(a, 'kick', { playerId: jb.you.id })).ok, true);
    await kicked;
    const again = await call(b, 'join', { roomId, clientId: b.clientId, name: 'Otro' });
    assert.equal(again.error, 'KICKED');
});

test('emojis: se reenvían con ids públicos y respetan el rate limit', async () => {
    const roomId = await createRoom();
    const a = await client();
    const b = await client();
    await call(a, 'join', { roomId, clientId: a.clientId, name: 'A' });
    const jb = await call(b, 'join', { roomId, clientId: b.clientId, name: 'B' });

    let received = 0;
    b.on('emoji', e => {
        received++;
        assert.equal(e.to, jb.you.id);
        assert.equal(e.emoji, '🍅');
    });
    for (let i = 0; i < 50; i++) a.emit('emoji', { to: jb.you.id, emoji: '🍅' });
    a.emit('emoji', { to: jb.you.id, emoji: '<script>' });
    await call(a, 'get_history'); // barrera: asegura que el server procesó todo
    await new Promise(r => setTimeout(r, 50));
    assert.ok(received > 0 && received <= 12, `recibidos: ${received}`);
});
