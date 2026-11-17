'use strict';

const { ABSTAIN, deckValues } = require('./decks');

const round1 = n => Math.round(n * 10) / 10;

/**
 * Calcula estadísticas de una ronda revelada.
 * @param {Array<{name: string, vote: any}>} results votos emitidos (sin nulls)
 * @param {string} deckKey
 */
function computeStats(results, deckKey) {
    const deck = deckValues(deckKey);
    const cast = results.filter(r => r.vote !== null && r.vote !== undefined);
    const counted = cast.filter(r => !ABSTAIN.includes(r.vote));
    const abstained = cast.length - counted.length;

    const distribution = deck
        .map(value => ({ value, count: cast.filter(r => r.vote === value).length }))
        .filter(d => d.count > 0);

    const distinct = new Set(counted.map(r => r.vote));
    const consensus = counted.length >= 2 && distinct.size === 1;

    const maxCount = Math.max(0, ...distribution.filter(d => !ABSTAIN.includes(d.value)).map(d => d.count));
    const mode = distribution.filter(d => !ABSTAIN.includes(d.value) && d.count === maxCount).map(d => d.value);

    const stats = {
        votes: cast.length,
        counted: counted.length,
        abstained,
        consensus,
        distribution,
        mode,
        average: null,
        median: null,
        suggestion: mode.length === 1 ? mode[0] : null,
        low: null,
        high: null,
    };

    const nums = counted.map(r => r.vote).filter(v => typeof v === 'number');
    if (nums.length && nums.length === counted.length) {
        const sorted = [...nums].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        stats.average = round1(sorted.reduce((a, b) => a + b, 0) / sorted.length);
        stats.median = sorted.length % 2 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2);

        // Carta del mazo más cercana al promedio (en empate, la mayor: estimar de menos sale caro)
        const numericDeck = deck.filter(v => typeof v === 'number');
        stats.suggestion = numericDeck.reduce((best, v) =>
            Math.abs(v - stats.average) <= Math.abs(best - stats.average) ? v : best, numericDeck[0]);
    }

    // Extremos según el orden del mazo (sirve también para talles): quiénes deberían explicar su voto
    if (distinct.size > 1) {
        const order = v => deck.indexOf(v);
        const byOrder = [...distinct].sort((a, b) => order(a) - order(b));
        const pick = value => ({ value, names: counted.filter(r => r.vote === value).map(r => r.name) });
        stats.low = pick(byOrder[0]);
        stats.high = pick(byOrder[byOrder.length - 1]);
    }

    return stats;
}

module.exports = { computeStats };
