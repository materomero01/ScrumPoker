'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/socket/validate');
const { TokenBucket } = require('../src/rateLimit');

test('text: recorta, limpia caracteres de control y rechaza no-strings', () => {
    assert.equal(v.text('  Ana  ', 24), 'Ana');
    assert.equal(v.text('a'.repeat(50), 24).length, 24);
    assert.equal(v.text('x' + String.fromCharCode(0x202e) + 'y', 24), 'xy');
    assert.equal(v.text(123, 24), undefined);
    assert.equal(v.text({}, 24), undefined);
});

test('clientId exige formato', () => {
    assert.equal(v.clientId('short'), undefined);
    assert.equal(v.clientId('abcdefghijklmnop'), 'abcdefghijklmnop');
    assert.equal(v.clientId('abcdefghijklmnop<'), undefined);
});

test('emoji acepta solo emojis', () => {
    assert.equal(v.emoji('🍅', 16), '🍅');
    assert.equal(v.emoji('👍🏽', 16), '👍🏽');
    assert.equal(v.emoji('hola', 16), undefined);
    assert.equal(v.emoji('<img src=x>', 16), undefined);
});

test('token bucket limita ráfagas y recarga', () => {
    const b = new TokenBucket({ capacity: 2, refillPerSec: 1 }, 0);
    assert.equal(b.take(0), true);
    assert.equal(b.take(0), true);
    assert.equal(b.take(0), false);
    assert.equal(b.take(1000), true);
});
