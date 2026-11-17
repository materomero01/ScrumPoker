import { $, toast, announce, debounce, formatValue } from './dom.js';
import * as net from './net.js';
import { renderSeats, renderCenter, renderStatus, resetTable, throwEmoji } from './table.js';
import { renderHand } from './hand.js';
import { setupEmojiPicker, currentEmoji } from './emoji.js';
import { setupHistory, setupSettings } from './dialogs.js';

// ── Estado del cliente ──────────────────────────────────────────────────

const clientId = net.getClientId();
const session = {
    roomId: null,   // sala en la que estoy (tras un join exitoso)
    name: '',
    role: 'player',
    me: null,       // { id, name, role }
    myVote: null,
    state: null,
    decks: {},
    clockOffset: 0, // serverTime - Date.now()
    pending: false,
    confirmUntil: 0,
};
let socket = null;

// ── Pantallas ───────────────────────────────────────────────────────────

const screens = ['lobby', 'notice', 'game'];
function show(name) {
    for (const s of screens) document.getElementById(`screen-${s}`).hidden = s !== name;
}

function notice({ title, body, primary, onPrimary, secondary, onSecondary }) {
    $('#notice-title').textContent = title;
    $('#notice-body').textContent = body;
    const p = $('#notice-primary');
    const s = $('#notice-secondary');
    p.textContent = primary;
    p.onclick = onPrimary;
    s.hidden = !secondary;
    if (secondary) {
        s.textContent = secondary;
        s.onclick = onSecondary;
    }
    show('notice');
    p.focus();
}

function backToLobby({ keepInvite = false } = {}) {
    session.roomId = null;
    session.state = null;
    session.me = null;
    resetTable();
    if (!keepInvite) {
        net.setRoomInURL(null);
        setInvite(null);
    }
    document.title = 'Scrum Poker';
    show('lobby');
    $('#lobby-name').focus();
}

// ── Lobby ───────────────────────────────────────────────────────────────

let inviteRoom = null;

function setInvite(roomId) {
    inviteRoom = roomId;
    $('#invite').hidden = !roomId;
    $('#invite-code').textContent = roomId ? roomId.toUpperCase() : '';
    $('#join-by-code').hidden = Boolean(roomId);
    $('#btn-new-instead').hidden = !roomId;
    $('#btn-primary-lobby').textContent = roomId ? 'Entrar a la sala' : 'Crear sala';
}

function lobbyError(msg) {
    const el = $('#lobby-error');
    el.hidden = !msg;
    el.textContent = msg || '';
}

function lobbyBusy(busy) {
    $('#btn-primary-lobby').disabled = busy;
    $('#btn-join-code').disabled = busy;
}

function readName() {
    const name = $('#lobby-name').value.trim();
    if (!name) {
        lobbyError('Escribí tu nombre para que el equipo sepa quién vota.');
        $('#lobby-name').focus();
        return null;
    }
    return name;
}

async function onLobbySubmit(e) {
    e.preventDefault();
    lobbyError('');
    const name = readName();
    if (!name) return;
    lobbyBusy(true);
    try {
        const roomId = inviteRoom || await net.createRoom();
        await enterRoom(roomId, name, $('#lobby-observer').checked ? 'observer' : 'player');
    } catch (err) {
        lobbyError(net.errorText(err.message));
    } finally {
        lobbyBusy(false);
    }
}

async function onJoinByCode() {
    lobbyError('');
    const name = readName();
    if (!name) return;
    const code = $('#lobby-code').value.trim().toLowerCase();
    if (!net.ROOM_ID_RE.test(code)) {
        lobbyError('El código tiene 5 letras o números. Lo ves arriba a la izquierda en la sala.');
        $('#lobby-code').focus();
        return;
    }
    lobbyBusy(true);
    try {
        if (!await net.roomExists(code)) {
            lobbyError(`No hay ninguna sala ${code.toUpperCase()}. Revisá el código o creá una nueva.`);
            return;
        }
        await enterRoom(code, name, $('#lobby-observer').checked ? 'observer' : 'player');
    } catch {
        lobbyError('No pudimos verificar la sala. Revisá tu conexión.');
    } finally {
        lobbyBusy(false);
    }
}

// ── Entrar / reconectar ─────────────────────────────────────────────────

async function enterRoom(roomId, name, role) {
    const res = await net.call(socket, 'join', { roomId, clientId, name, role });
    if (!res.ok) {
        if (res.error === 'ROOM_NOT_FOUND') return roomGone(roomId);
        if (res.error === 'KICKED') return kicked();
        throw new Error(res.error);
    }
    net.saveName(name);
    session.roomId = roomId;
    session.name = name;
    session.role = res.you.role;
    session.me = res.you;
    session.myVote = res.you.vote;
    session.decks = res.decks;
    net.setRoomInURL(roomId);
    $('#room-code').textContent = roomId.toUpperCase();
    document.title = `Sala ${roomId.toUpperCase()} · Scrum Poker`;
    show('game');
    applyState(res.state);
    if (res.you.name !== name) toast(`Ya había alguien con ese nombre: sos ${res.you.name}.`);
    maybeShowEmojiHint();
}

async function rejoin() {
    if (!session.roomId) return;
    const res = await net.call(socket, 'join', { roomId: session.roomId, clientId, name: session.name, role: session.role });
    if (res.ok) {
        session.me = res.you;
        session.myVote = res.you.vote;
        applyState(res.state);
    } else if (res.error === 'ROOM_NOT_FOUND') {
        roomGone(session.roomId);
    } else if (res.error === 'KICKED') {
        kicked();
    }
}

function roomGone(roomId) {
    session.roomId = null;
    net.setRoomInURL(null);
    notice({
        title: 'Esta sala ya no existe',
        body: `La sala ${roomId.toUpperCase()} expiró o el código es incorrecto. Creá una nueva y compartí el enlace con tu equipo.`,
        primary: 'Crear una sala nueva',
        onPrimary: () => backToLobby(),
    });
}

function kicked() {
    session.roomId = null;
    net.setRoomInURL(null);
    notice({
        title: 'Te sacaron de la sala',
        body: 'Quien modera te quitó de esta sesión. Si fue un error, pedile un enlace nuevo.',
        primary: 'Ir al inicio',
        onPrimary: () => backToLobby(),
    });
}

// ── Estado y render ─────────────────────────────────────────────────────

function applyState(state) {
    if (state.serverTime) session.clockOffset = state.serverTime - Date.now();
    const prev = session.state;
    session.state = state;
    const me = state.players.find(p => p.id === session.me?.id);
    if (me) {
        session.me = { ...session.me, name: me.name, role: me.role };
        session.role = me.role;
        if (!state.revealed && !me.voted) session.myVote = null;
    }
    if (state.revealed && prev && !prev.revealed) announceReveal(state);
    if (prev && prev.round !== state.round) toast(`Ronda ${state.round}: ${state.taskName}`);
    render();
}

function announceReveal(state) {
    const s = state.stats;
    if (!s || !s.votes) return announce('Se revelaron las cartas. Nadie votó.');
    if (s.consensus) return announce(`Consenso en ${formatValue(s.suggestion)}.`);
    announce(`Cartas reveladas. Sugerida ${formatValue(s.suggestion ?? '?')}${s.average !== null ? `, promedio ${formatValue(s.average)}` : ''}.`);
}

function timerText() {
    const t = session.state?.timer;
    if (!t) return null;
    const left = Math.max(0, Math.ceil((t.endsAt - (Date.now() + session.clockOffset)) / 1000));
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, '0');
    return { text: `${mm}:${ss}`, urgent: left <= 10 };
}

let emoji = null;
let settings = null;

function render() {
    const state = session.state;
    const me = session.me;
    if (!state || !me) return;

    renderSeats(state, me, { onThrow: onThrow });
    renderCenter(state, timerText());
    renderHand(state, me, session.myVote, { onPick });
    renderMainButton();
    renderTopbar();
    emoji?.setEnabled(state.settings.emojis);
    settings?.refresh();
}

function canControl() {
    const s = session.state;
    return s && (!s.settings.moderatorOnly || s.moderatorId === session.me?.id);
}

function renderMainButton() {
    const btn = $('#btn-main');
    const s = session.state;
    btn.classList.remove('is-confirm');

    if (!canControl()) {
        btn.disabled = true;
        btn.textContent = s.revealed ? 'Esperando nueva ronda' : 'Revela quien modera';
        return;
    }
    if (s.revealed) {
        btn.disabled = session.pending;
        btn.textContent = 'Nueva ronda';
        return;
    }
    const voters = s.players.filter(p => p.role === 'player' && p.connected);
    const voted = voters.filter(p => p.voted).length;
    const missing = voters.length - voted;
    btn.disabled = session.pending || voted === 0;
    if (missing > 0 && voted > 0 && Date.now() < session.confirmUntil) {
        btn.classList.add('is-confirm');
        btn.textContent = `Faltan ${missing}. ¿Revelar igual?`;
    } else {
        btn.textContent = 'Revelar cartas';
    }
}

function renderTopbar() {
    const s = session.state;
    const input = $('#task-input');
    if (document.activeElement !== input && input.value !== s.taskName) input.value = s.taskName;
    input.readOnly = !canControl();
    input.setAttribute('aria-label', 'Nombre de la tarea que se está estimando');

    const count = $('#history-count');
    count.hidden = !s.historyCount;
    count.textContent = String(s.historyCount || '');

    const timerBtn = $('#btn-timer');
    timerBtn.setAttribute('aria-pressed', String(Boolean(s.timer)));
    timerBtn.querySelector('.tool-text').textContent = s.timer ? 'Detener' : 'Reloj';
    timerBtn.setAttribute('aria-label', s.timer ? 'Detener el reloj' : `Iniciar reloj de ${s.settings.timerSec} segundos`);
    timerBtn.disabled = !canControl() || s.revealed;

    const role = $('#btn-role');
    const observing = session.me.role === 'observer';
    role.setAttribute('aria-pressed', String(observing));
    role.textContent = observing ? 'Volver a votar' : 'Observar';
}

// Reloj: refresca solo la línea de estado
setInterval(() => {
    if (session.state?.timer && !session.state.revealed) renderStatus(session.state, timerText());
    if (session.confirmUntil && Date.now() >= session.confirmUntil) {
        session.confirmUntil = 0;
        if (session.state) renderMainButton();
    }
}, 250);

// ── Acciones ────────────────────────────────────────────────────────────

async function act(event, payload) {
    const res = await net.call(socket, event, payload);
    if (!res.ok) toast(net.errorText(res.error), { type: 'error' });
    return res;
}

async function onPick(value) {
    const s = session.state;
    if (!s || s.revealed || session.me.role !== 'player') return;
    const retract = session.myVote !== null && String(session.myVote) === String(value);
    const previous = session.myVote;
    session.myVote = retract ? null : value;
    renderHand(s, session.me, session.myVote, { onPick });
    const res = await act('vote', { value: retract ? null : value });
    if (!res.ok) {
        session.myVote = previous;
        renderHand(session.state, session.me, session.myVote, { onPick });
    } else {
        announce(retract ? 'Retiraste tu voto.' : `Votaste ${formatValue(value)}.`);
    }
}

async function onMain() {
    const s = session.state;
    if (!s || session.pending) return;
    if (!s.revealed) {
        const voters = s.players.filter(p => p.role === 'player' && p.connected);
        const missing = voters.filter(p => !p.voted).length;
        if (missing > 0 && Date.now() >= session.confirmUntil) {
            session.confirmUntil = Date.now() + 4000;
            renderMainButton();
            return;
        }
    }
    session.confirmUntil = 0;
    session.pending = true;
    renderMainButton();
    await act(s.revealed ? 'next_round' : 'reveal');
    setTimeout(() => {
        session.pending = false;
        renderMainButton();
    }, 600);
}

const pushTask = debounce(value => act('update_task', { taskName: value }), 500);

async function copyInvite() {
    const url = net.inviteLink(session.roomId);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (coarse && navigator.share) {
        try {
            await navigator.share({ title: 'Scrum Poker', text: `Sumate a la sala ${session.roomId.toUpperCase()}`, url });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado. Pegalo en el chat del equipo.');
    } catch {
        window.prompt('Copiá este enlace:', url);
    }
}

function onThrow(targetId, cardEl) {
    if (!session.state?.settings.emojis || targetId === session.me?.id) return;
    socket.emit('emoji', { to: targetId, emoji: currentEmoji() });
    cardEl.blur?.();
}

// Zumbido: muchos impactos seguidos sacuden la pantalla de quien los recibe
const hits = [];
async function onEmoji({ from, to, emoji: e }) {
    const landed = await throwEmoji(from, to, e);
    if (!landed || to !== session.me?.id) return;
    const now = Date.now();
    hits.push(now);
    while (hits.length && now - hits[0] > 6000) hits.shift();
    if (hits.length >= 8) {
        hits.length = 0;
        const who = session.state.players.find(p => p.id === from)?.name || 'Alguien';
        toast(`${who} te está zumbando ${e}`);
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.body.classList.add('is-buzzing');
            setTimeout(() => document.body.classList.remove('is-buzzing'), 900);
            navigator.vibrate?.(200);
        }
    }
}

function maybeShowEmojiHint() {
    try {
        if (localStorage.getItem('scrum-poker:hinted')) return;
        localStorage.setItem('scrum-poker:hinted', '1');
    } catch { return; }
    setTimeout(() => toast('Tip: tocá la carta de alguien para tirarle un emoji.', { ms: 5000 }), 1500);
}

// ── Atajos de teclado ───────────────────────────────────────────────────

document.addEventListener('keydown', e => {
    if (!session.state || $('#screen-game').hidden) return;
    if (e.target.closest('input, select, textarea, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter' && !e.target.closest('button')) {
        e.preventDefault();
        onMain();
        return;
    }
    const card = session.state.deck.find(v => String(v).toLowerCase() === e.key.toLowerCase());
    if (card !== undefined) onPick(card);
});

// ── Arranque ────────────────────────────────────────────────────────────

function wire() {
    socket = net.connect();
    socket.on('connect', () => {
        $('#offline-banner').hidden = true;
        document.body.classList.remove('is-offline');
        rejoin();
    });
    socket.on('disconnect', () => {
        if (!session.roomId) return;
        $('#offline-banner').hidden = false;
        document.body.classList.add('is-offline');
    });
    socket.on('state', state => { if (session.roomId && state.id === session.roomId) applyState(state); });
    socket.on('emoji', onEmoji);
    socket.on('timer_done', () => {
        toast('Se terminó el tiempo.');
        announce('Se terminó el tiempo.');
    });
    socket.on('kicked', kicked);
    socket.on('session_replaced', () => {
        const roomId = session.roomId;
        session.roomId = null;
        notice({
            title: 'Abriste la sala en otra pestaña',
            body: 'Tu asiento pasó a la otra pestaña. Podés seguir allá o traerlo de vuelta a esta.',
            primary: 'Usar esta pestaña',
            onPrimary: async () => {
                try { await enterRoom(roomId, session.name, session.role); } catch (err) { toast(net.errorText(err.message), { type: 'error' }); }
            },
        });
    });

    $('#lobby-form').addEventListener('submit', onLobbySubmit);
    $('#btn-join-code').addEventListener('click', onJoinByCode);
    $('#lobby-code').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); onJoinByCode(); }
    });
    $('#btn-new-instead').addEventListener('click', () => backToLobby());

    $('#btn-main').addEventListener('click', onMain);
    $('#btn-room').addEventListener('click', copyInvite);
    $('#btn-timer').addEventListener('click', () => act(session.state?.timer ? 'timer_stop' : 'timer_start'));
    $('#btn-role').addEventListener('click', () => {
        const role = session.me.role === 'observer' ? 'player' : 'observer';
        session.myVote = null;
        act('set_role', { role });
    });

    const task = $('#task-input');
    task.addEventListener('input', () => { if (!task.readOnly) pushTask(task.value); });
    task.addEventListener('keydown', e => { if (e.key === 'Enter') task.blur(); });
    task.addEventListener('blur', () => { if (session.state) task.value = session.state.taskName; });

    emoji = setupEmojiPicker();
    settings = setupSettings({
        getState: () => session.state,
        getMe: () => session.me,
        decks: () => session.decks,
        actions: {
            updateSettings: patch => act('update_settings', { settings: patch }),
            kick: p => { if (window.confirm(`¿Sacar a ${p.name} de la sala?`)) act('kick', { playerId: p.id }); },
            makeModerator: p => act('make_moderator', { playerId: p.id }),
            leave: async () => {
                await net.call(socket, 'leave');
                backToLobby();
            },
        },
    });
    setupHistory({ fetchHistory: () => net.call(socket, 'get_history'), roomId: () => session.roomId });
}

async function init() {
    wire();
    $('#lobby-name').value = net.savedName();

    const roomId = net.roomFromURL();
    if (new URLSearchParams(location.search).has('room') && !roomId) net.setRoomInURL(null);
    if (roomId) {
        try {
            if (!await net.roomExists(roomId)) return roomGone(roomId);
            setInvite(roomId);
        } catch {
            setInvite(roomId);
        }
    } else {
        setInvite(null);
    }
    show('lobby');
    ($('#lobby-name').value ? $('#btn-primary-lobby') : $('#lobby-name')).focus();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
