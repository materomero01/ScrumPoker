'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStats } = require('../src/domain/stats');

const r = (...votes) => votes.map((vote, i) => ({ name: `p${i}`, vote }));

test('promedio, mediana y sugerencia con Fibonacci', () => {
    const s = computeStats(r(3, 5, 8, 5), 'fibonacci');
    assert.equal(s.average, 5.3);
    assert.equal(s.median, 5);
    assert.equal(s.suggestion, 5);
    assert.equal(s.consensus, false);
    assert.deepEqual(s.mode, [5]);
    assert.deepEqual(s.low, { value: 3, names: ['p0'] });
    assert.deepEqual(s.high, { value: 8, names: ['p2'] });
});

test('consenso cuando todos coinciden e ignora ? y café', () => {
    const s = computeStats(r(5, 5, '?', '☕'), 'fibonacci');
    assert.equal(s.consensus, true);
    assert.equal(s.abstained, 2);
    assert.equal(s.counted, 2);
    assert.equal(s.average, 5);
    assert.equal(s.low, null);
});

test('un solo voto no es consenso', () => {
    assert.equal(computeStats(r(8), 'fibonacci').consensus, false);
});

test('en empate de distancia sugiere la carta mayor', () => {
    // promedio 4 -> 3 y 5 equidistantes
    assert.equal(computeStats(r(3, 5), 'fibonacci').suggestion, 5);
});

test('talles: sin promedio, extremos por orden del mazo', () => {
    const s = computeStats(r('S', 'XL', 'S'), 'tshirt');
    assert.equal(s.average, null);
    assert.equal(s.suggestion, 'S');
    assert.equal(s.low.value, 'S');
    assert.equal(s.high.value, 'XL');
});

test('solo abstenciones', () => {
    const s = computeStats(r('?', '☕'), 'fibonacci');
    assert.equal(s.average, null);
    assert.equal(s.counted, 0);
    assert.equal(s.votes, 2);
});
