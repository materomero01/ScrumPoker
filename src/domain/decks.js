'use strict';

/** Valores que no cuentan para las estadísticas numéricas. */
const ABSTAIN = Object.freeze(['?', '☕']);

const DECKS = Object.freeze({
    fibonacci: {
        label: 'Fibonacci',
        values: [0, 1, 2, 3, 5, 8, 13, 21, '?', '☕'],
    },
    modified: {
        label: 'Fibonacci modificado',
        values: [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100, '?', '☕'],
    },
    tshirt: {
        label: 'Talles de remera',
        values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'],
    },
    powers: {
        label: 'Potencias de 2',
        values: [0, 1, 2, 4, 8, 16, 32, 64, '?', '☕'],
    },
});

const DEFAULT_DECK = 'fibonacci';

function isDeck(key) {
    return Object.prototype.hasOwnProperty.call(DECKS, key);
}

function deckValues(key) {
    return (DECKS[key] || DECKS[DEFAULT_DECK]).values;
}

/** Devuelve el valor canónico del mazo (mismo tipo) o undefined si no pertenece. */
function normalizeCard(deckKey, value) {
    return deckValues(deckKey).find(v => v === value || String(v) === String(value));
}

function publicDecks() {
    return Object.fromEntries(Object.entries(DECKS).map(([k, d]) => [k, { label: d.label, values: d.values }]));
}

module.exports = { DECKS, DEFAULT_DECK, ABSTAIN, isDeck, deckValues, normalizeCard, publicDecks };
