import { h, setText, formatValue, prefersReducedMotion } from './dom.js';

const seatsEl = () => document.getElementById('seats');
const seatEls = new Map(); // playerId -> <li>
let lastRevealed = false;

/**
 * Posición en la elipse de la mesa. Yo siempre quedo abajo al centro,
 * pegado a mi mano; el resto se reparte en sentido horario.
 */
function seatPosition(index, total, meIndex) {
    const offset = meIndex >= 0 ? index - meIndex : index;
    const angle = (Math.PI / 2) + (offset * 2 * Math.PI) / Math.max(total, 1);
    return { left: 50 + 50 * Math.cos(angle), top: 50 + 50 * Math.sin(angle), order: (offset + total) % total };
}

function createSeat(player, onThrow) {
    const card = h('button', { class: 'seat-card', type: 'button' },
        h('span', { class: 'slot', 'aria-hidden': 'true' }),
        h('span', { class: 'back', 'aria-hidden': 'true' }),
        h('span', { class: 'face', 'aria-hidden': 'true' }),
        h('span', { class: 'visually-hidden seat-desc' }),
    );
    card.addEventListener('click', () => onThrow(player.id, card));
    const li = h('li', { class: 'seat is-entering', dataset: { id: player.id } },
        h('span', { class: 'seat-flag', hidden: true }),
        card,
        h('span', { class: 'seat-name' },
            h('span', { class: 'crown', 'aria-hidden': 'true', hidden: true, text: '★' }),
            h('span', { class: 'n' }),
        ),
    );
    li.addEventListener('animationend', () => li.classList.remove('is-entering'), { once: true });
    return li;
}

function cardState(player, revealed) {
    if (player.role === 'observer') return 'observer';
    if (revealed && player.vote !== null) return 'shown';
    if (player.voted) return 'voted';
    return 'empty';
}

function describeSeat(player, { isMe, isMod, revealed, emojisOn }) {
    const parts = [isMe ? `${player.name} (vos)` : player.name];
    if (isMod) parts.push('modera');
    if (player.role === 'observer') parts.push('observa');
    else if (revealed && player.vote !== null) parts.push(`votó ${formatValue(player.vote)}`);
    else parts.push(player.voted ? 'ya votó' : 'todavía no votó');
    if (!player.connected) parts.push('desconectado');
    if (!isMe && emojisOn) parts.push('tocá para tirarle un emoji');
    return parts.join(', ');
}

export function renderSeats(state, me, { onThrow }) {
    const list = seatsEl();
    const players = state.players;
    const meIndex = players.findIndex(p => p.id === me?.id);
    const justRevealed = state.revealed && !lastRevealed;
    lastRevealed = state.revealed;

    const lowNames = new Set(state.stats?.low?.names || []);
    const highNames = new Set(state.stats?.high?.names || []);
    const seen = new Set();

    players.forEach((p, i) => {
        seen.add(p.id);
        let li = seatEls.get(p.id);
        if (!li) {
            li = createSeat(p, onThrow);
            seatEls.set(p.id, li);
            list.append(li);
        }
        const isMe = p.id === me?.id;
        const isMod = p.id === state.moderatorId;
        const pos = seatPosition(i, players.length, meIndex);
        li.style.left = `${pos.left}%`;
        li.style.top = `${pos.top}%`;
        li.style.setProperty('--flip-delay', justRevealed && !prefersReducedMotion() ? `${pos.order * 90}ms` : '0ms');
        li.dataset.card = cardState(p, state.revealed);
        li.classList.toggle('is-me', isMe);
        li.classList.toggle('is-away', !p.connected);
        li.classList.toggle('is-target', !isMe && state.settings.emojis);

        const face = li.querySelector('.face');
        const value = state.revealed && p.vote !== null ? formatValue(p.vote) : '';
        setText(face, value);
        face.classList.toggle('is-text', value.length > 2);

        const flag = li.querySelector('.seat-flag');
        const flagText = state.revealed && !state.stats?.consensus
            ? (lowNames.has(p.name) ? 'más bajo' : highNames.has(p.name) ? 'más alto' : '')
            : '';
        flag.hidden = !flagText;
        setText(flag, flagText);

        li.querySelector('.crown').hidden = !isMod;
        setText(li.querySelector('.n'), isMe ? `${p.name} (vos)` : p.name);

        const btn = li.querySelector('.seat-card');
        btn.disabled = isMe || !state.settings.emojis;
        setText(li.querySelector('.seat-desc'), describeSeat(p, { isMe, isMod, revealed: state.revealed, emojisOn: state.settings.emojis }));
    });

    for (const [id, li] of seatEls) {
        if (!seen.has(id)) {
            li.remove();
            seatEls.delete(id);
        }
    }
}

export function resetTable() {
    seatEls.forEach(li => li.remove());
    seatEls.clear();
    lastRevealed = false;
}

// ── Centro de la mesa ───────────────────────────────────────────────────

function renderResults(state) {
    const box = document.getElementById('results');
    const s = state.stats;
    box.hidden = !state.revealed;
    if (!state.revealed) return;

    const caption = document.getElementById('result-caption');
    const value = document.getElementById('result-value');
    const detail = document.getElementById('result-detail');
    const dist = document.getElementById('distribution');

    box.classList.toggle('is-consensus', Boolean(s?.consensus));

    if (!s || s.votes === 0) {
        setText(caption, 'Nadie votó en esta ronda');
        setText(value, '–');
        setText(detail, '');
        dist.replaceChildren();
        return;
    }

    if (s.consensus) setText(caption, 'Consenso');
    else if (s.average !== null) setText(caption, 'Carta sugerida');
    else if (s.suggestion !== null) setText(caption, 'Lo más votado');
    else setText(caption, 'Sin acuerdo');

    setText(value, s.suggestion !== null ? formatValue(s.suggestion) : (s.mode.length ? s.mode.map(formatValue).join(' / ') : '?'));

    const lines = [];
    if (s.average !== null && !s.consensus) lines.push(`Promedio ${formatValue(s.average)}, mediana ${formatValue(s.median)}`);
    if (s.abstained) lines.push(s.abstained === 1 ? 'Una persona no estimó' : `${s.abstained} personas no estimaron`);
    setText(detail, lines.join('\n'));

    const max = Math.max(...s.distribution.map(d => d.count));
    dist.replaceChildren(...s.distribution.map((d, i) => h('li', {
        class: d.count === max ? 'is-top' : '',
        'aria-label': `${formatValue(d.value)}: ${d.count} ${d.count === 1 ? 'voto' : 'votos'}`,
    },
    h('span', { class: 'count', text: String(d.count), 'aria-hidden': 'true' }),
    h('span', { class: 'bar', 'aria-hidden': 'true', style: { height: `${Math.max(6, (d.count / max) * 30)}px`, animationDelay: `${i * 40}ms` } }),
    h('span', { class: 'label', text: formatValue(d.value), 'aria-hidden': 'true' }),
    )));
}

export function renderStatus(state, timerText) {
    const status = document.getElementById('status');
    if (state.revealed) {
        status.replaceChildren();
        status.hidden = true;
        return;
    }
    status.hidden = false;
    const voters = state.players.filter(p => p.role === 'player' && p.connected);
    const voted = voters.filter(p => p.voted).length;
    const parts = [];
    if (voters.length === 0) parts.push('Esperando jugadores');
    else if (voted === voters.length) parts.push(h('strong', { text: 'Votaron todos' }));
    else parts.push(h('strong', { text: `${voted} de ${voters.length}` }), ' votaron');
    if (timerText) parts.push('. ', h('span', { class: `timer${timerText.urgent ? ' urgent' : ''}`, text: timerText.text }));
    status.replaceChildren(...parts);
}

export function renderCenter(state, timerText) {
    renderStatus(state, timerText);
    renderResults(state);
}

// ── Emojis voladores ────────────────────────────────────────────────────
//
// El emoji viaja en una parábola (Bézier cuadrática muestreada, sin esquinas),
// choca contra el borde de la carta del destinatario, la empuja en la dirección
// del golpe y rebota hacia atrás cayendo con gravedad.

const SIZE = 28;
const at = (x, y, rot = 0, sx = 1, sy = sx) =>
    `translate(${(x - SIZE / 2).toFixed(1)}px, ${(y - SIZE / 2).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${sx}, ${sy})`;

function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function bezier(p0, p1, p2, t) {
    const u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/** Punto del borde del rectángulo de la carta por donde entra un proyectil que viene en dirección `dir`. */
function impactPoint(card, dir) {
    const hw = card.w / 2 + SIZE * 0.3;
    const hh = card.h / 2 + SIZE * 0.3;
    const k = Math.min(hw / Math.abs(dir.x || 1e-6), hh / Math.abs(dir.y || 1e-6));
    return { x: card.x - dir.x * k, y: card.y - dir.y * k };
}

function normalize(v) {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
}

/** Lanza un emoji de un asiento a otro. Resuelve cuando impacta. */
export function throwEmoji(fromId, toId, emoji) {
    const target = seatEls.get(toId);
    if (!target) return Promise.resolve(false);
    const targetCard = target.querySelector('.seat-card');
    const source = seatEls.get(fromId);
    const card = centerOf(targetCard);
    const from = source ? centerOf(source.querySelector('.seat-card')) : { x: card.x, y: window.innerHeight + SIZE };

    const p = h('span', { class: 'projectile', 'aria-hidden': 'true', text: emoji });
    document.body.append(p);

    if (prefersReducedMotion()) {
        p.style.transform = at(card.x, card.y - card.h / 2 - SIZE / 2);
        setTimeout(() => p.remove(), 700);
        return Promise.resolve(true);
    }

    // Curva: el punto de control se desplaza perpendicular a la línea de tiro
    // (hacia "arriba" de la pantalla cuando se puede), así el arco nunca pasa
    // por encima del destinatario y le pega desde atrás.
    const dist = Math.hypot(card.x - from.x, card.y - from.y);
    let n = normalize({ x: card.y - from.y, y: -(card.x - from.x) });
    if (n.y > 0 || (n.y === 0 && n.x > 0)) n = { x: -n.x, y: -n.y };
    const lift = Math.min(130, 30 + dist * 0.22);
    const ctrl = { x: (from.x + card.x) / 2 + n.x * lift, y: (from.y + card.y) / 2 + n.y * lift };

    // Dirección de llegada = tangente final de la curva (ctrl -> destino)
    const dir = normalize({ x: card.x - ctrl.x, y: card.y - ctrl.y });
    const hit = impactPoint(card, dir);

    const spin = (dir.x >= 0 ? 1 : -1) * 300;
    const STEPS = 28;
    const flightFrames = [];
    for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const te = t * t * (1.6 - 0.6 * t); // acelera levemente al caer
        const q = bezier(from, ctrl, hit, te);
        flightFrames.push({ transform: at(q.x, q.y, spin * te, 0.85 + 0.15 * te) });
    }
    const duration = Math.min(700, 360 + dist * 0.4);
    const flight = p.animate(flightFrames, { duration, easing: 'linear', fill: 'forwards' });

    return flight.finished.then(() => {
        // La carta recibe el golpe en la dirección del proyectil
        const push = { x: dir.x * 7, y: dir.y * 7 };
        const tilt = dir.x * 9;
        targetCard.animate([
            { transform: 'translate(0, 0) rotate(0deg)' },
            { transform: `translate(${push.x}px, ${push.y}px) rotate(${tilt}deg)`, offset: 0.25 },
            { transform: `translate(${-push.x * 0.35}px, ${-push.y * 0.35}px) rotate(${-tilt * 0.35}deg)`, offset: 0.6 },
            { transform: 'translate(0, 0) rotate(0deg)' },
        ], { duration: 380, easing: 'ease-out' });

        // Rebote: sale hacia atrás (reflejo de la dirección) con un poco de impulso hacia arriba y cae con gravedad
        const v = { x: -dir.x * 150 + (Math.random() - 0.5) * 50, y: -dir.y * 150 - 90 };
        const g = 900;
        const T = 0.75;
        const bounceFrames = [{ transform: at(hit.x, hit.y, spin, 1.25, 0.75), opacity: 1 }];
        for (let i = 1; i <= 20; i++) {
            const t = (i / 20) * T;
            const x = hit.x + v.x * t;
            const y = hit.y + v.y * t + 0.5 * g * t * t;
            bounceFrames.push({ transform: at(x, y, spin + spin * 0.8 * (t / T)), opacity: i < 12 ? 1 : 1 - (i - 12) / 8 });
        }
        const bounce = p.animate(bounceFrames, { duration: T * 1000, easing: 'linear', fill: 'forwards' });
        bounce.finished.then(() => p.remove());
        return true;
    });
}
