import { h, formatValue } from './dom.js';

const handEl = () => document.getElementById('hand');
let renderedDeck = '';

/** Dibuja la mano solo cuando cambia el mazo; después solo actualiza atributos. */
export function renderHand(state, me, myVote, { onPick }) {
    const hand = handEl();
    const key = JSON.stringify(state.deck);
    const n = state.deck.length;
    if (key !== renderedDeck) {
        renderedDeck = key;
        hand.replaceChildren(...state.deck.map((value, i) => {
            const label = formatValue(value);
            const isText = typeof value !== 'number' || label.length > 2;
            const isWild = value === '?' || value === '☕';
            const tilt = ((i - (n - 1) / 2) * 1.2).toFixed(2);
            const btn = h('button', {
                class: `card${isText ? ' is-text' : ''}${isWild ? ' is-wild' : ''}`,
                type: 'button',
                'aria-pressed': 'false',
                dataset: { index: String(i) },
            },
            h('span', { class: 'corner tl', 'aria-hidden': 'true', text: label }),
            isWild ? null : h('span', { class: 'visually-hidden', text: 'Votar ' }),
            h('span', { text: label }),
            isWild ? h('span', { class: 'visually-hidden', text: value === '☕' ? ' (necesito una pausa)' : ' (no sé)' }) : null,
            h('span', { class: 'corner br', 'aria-hidden': 'true', text: label }),
            );
            btn.style.setProperty('--tilt', `${tilt}deg`);
            btn.addEventListener('click', () => onPick(value));
            return btn;
        }));
    }

    const canVote = me?.role === 'player' && !state.revealed;
    hand.classList.toggle('is-disabled', !canVote);
    hand.querySelectorAll('.card').forEach((btn, i) => {
        btn.disabled = !canVote;
        btn.setAttribute('aria-pressed', String(myVote !== null && myVote !== undefined && String(state.deck[i]) === String(myVote)));
    });
}
