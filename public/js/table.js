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
        btn.setAttribute('aria-label', describeSeat(p, { isMe, isMod, revealed: state.revealed, emojisOn: state.settings.emojis }));
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

function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Lanza un emoji de un asiento a otro. Devuelve una promesa que resuelve al impactar. */
export function throwEmoji(fromId, toId, emoji) {
    const target = seatEls.get(toId);
    if (!target) return Promise.resolve(false);
    const source = seatEls.get(fromId);
    const to = centerOf(target.querySelector('.seat-card'));
    const from = source ? centerOf(source.querySelector('.seat-card')) : { x: to.x, y: window.innerHeight };

    const p = h('span', { class: 'projectile', 'aria-hidden': 'true', text: emoji });
    document.body.append(p);
    const size = 28;
    const at = (x, y, extra = '') => `translate(${x - size / 2}px, ${y - size / 2}px) ${extra}`;

    if (prefersReducedMotion()) {
        p.style.transform = at(to.x, to.y - 40);
        setTimeout(() => p.remove(), 700);
        return Promise.resolve(true);
    }

    const midX = (from.x + to.x) / 2;
    const midY = Math.min(from.y, to.y) - 80;
    const flight = p.animate([
        { transform: at(from.x, from.y, 'rotate(0deg) scale(0.8)') },
        { transform: at(midX, midY, 'rotate(160deg) scale(1.15)'), offset: 0.5 },
        { transform: at(to.x, to.y, 'rotate(320deg) scale(1)') },
    ], { duration: 520, easing: 'cubic-bezier(.3,.1,.5,1)' });

    return flight.finished.then(() => {
        target.classList.remove('is-buzzed');
        void target.offsetWidth;
        target.classList.add('is-buzzed');
        const dir = Math.random() > 0.5 ? 1 : -1;
        const fall = p.animate([
            { transform: at(to.x, to.y, 'rotate(320deg)'), opacity: 1 },
            { transform: at(to.x + dir * 24, to.y - 20, 'rotate(400deg)'), opacity: 1, offset: 0.35 },
            { transform: at(to.x + dir * 50, to.y + 70, 'rotate(560deg)'), opacity: 0 },
        ], { duration: 650, easing: 'ease-in', fill: 'forwards' });
        fall.finished.then(() => p.remove());
        return true;
    });
}
