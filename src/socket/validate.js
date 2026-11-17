'use strict';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g;

/** Devuelve el string limpio (sin caracteres de control, recortado) o undefined si no es válido. */
function text(value, max) {
    if (typeof value !== 'string') return undefined;
    const clean = value.replace(CONTROL_CHARS, '').trim();
    return [...clean].slice(0, max).join('');
}

function obj(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function clientId(value) {
    return typeof value === 'string' && CLIENT_ID_RE.test(value) ? value : undefined;
}

function cardValue(value) {
    if (value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.length <= 4) return value;
    return undefined;
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const NOT_EMOJI = /[\p{L}\p{N}<>&"'`\s]/u;

/** Acepta un único emoji (incluye secuencias con ZWJ y modificadores), hasta `max` unidades UTF-16. */
function emoji(value, max) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max) return undefined;
    if (!PICTOGRAPHIC.test(value) || NOT_EMOJI.test(value.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ''))) return undefined;
    return value;
}

module.exports = { text, obj, clientId, cardValue, emoji };
