const CLIENT_ID_KEY = 'scrum-poker:client-id';
const NAME_KEY = 'scrum-poker:name';

function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

function storage(kind) {
    try { return window[kind]; } catch { return null; }
}

/**
 * Identidad persistente por pestaña: sobrevive recargas y reconexiones,
 * así el servidor devuelve el mismo asiento y el mismo voto.
 */
export function getClientId() {
    const s = storage('sessionStorage');
    let id = null;
    try { id = s?.getItem(CLIENT_ID_KEY); } catch { /* sin storage */ }
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
        id = randomId();
        try { s?.setItem(CLIENT_ID_KEY, id); } catch { /* sin storage */ }
    }
    return id;
}

export function savedName() {
    try { return storage('localStorage')?.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function saveName(name) {
    try { storage('localStorage')?.setItem(NAME_KEY, name); } catch { /* sin storage */ }
}

const SEAT_KEY = 'scrum-poker:seat';

/** Recuerda en qué sala estaba esta pestaña para volver sola tras recargar. */
export function rememberSeat(seat) {
    try {
        const s = storage('sessionStorage');
        if (seat) s?.setItem(SEAT_KEY, JSON.stringify(seat));
        else s?.removeItem(SEAT_KEY);
    } catch { /* sin storage */ }
}

export function rememberedSeat() {
    try {
        const seat = JSON.parse(storage('sessionStorage')?.getItem(SEAT_KEY) || 'null');
        return seat && typeof seat.roomId === 'string' && typeof seat.name === 'string' ? seat : null;
    } catch { return null; }
}

export function connect() {
    return io({ reconnectionDelay: 800, reconnectionDelayMax: 5000, transports: ['websocket', 'polling'] });
}

/** Emite un evento y espera el ack del servidor (con timeout). */
export function call(socket, event, payload = {}, timeoutMs = 6000) {
    return new Promise(resolve => {
        socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
            resolve(err ? { ok: false, error: 'TIMEOUT' } : res);
        });
    });
}

export async function createRoom() {
    const res = await fetch('/api/rooms', { method: 'POST' });
    if (!res.ok) throw new Error(res.status === 429 ? 'RATE_LIMITED' : 'CREATE_FAILED');
    return (await res.json()).roomId;
}

export async function roomExists(roomId) {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new Error('LOOKUP_FAILED');
    return true;
}

export const ROOM_ID_RE = /^[a-z0-9]{5}$/;

export function roomFromURL() {
    const raw = new URLSearchParams(location.search).get('room');
    const id = raw ? raw.trim().toLowerCase() : null;
    return id && ROOM_ID_RE.test(id) ? id : null;
}

export function setRoomInURL(roomId) {
    const url = new URL(location.href);
    if (roomId) url.searchParams.set('room', roomId);
    else url.searchParams.delete('room');
    history.replaceState(null, '', url);
}

export function inviteLink(roomId) {
    return `${location.origin}${location.pathname}?room=${roomId}`;
}

export const ERROR_TEXT = {
    ROOM_NOT_FOUND: 'Esa sala no existe o ya expiró.',
    ROOM_FULL: 'La sala está llena.',
    KICKED: 'Te sacaron de esta sala.',
    FORBIDDEN: 'Solo quien modera puede hacer eso.',
    NAME_REQUIRED: 'Escribí tu nombre para entrar.',
    INVALID_CARD: 'Esa carta no es del mazo actual.',
    ALREADY_REVEALED: 'La ronda ya se reveló.',
    OBSERVER: 'Estás como observador: pasate a votar para elegir carta.',
    RATE_LIMITED: 'Demasiadas acciones seguidas. Esperá un momento.',
    TIMEOUT: 'El servidor no respondió. Revisá tu conexión.',
    TOO_MANY_ROOMS: 'No se pueden crear más salas ahora. Probá en unos minutos.',
};

export const errorText = code => ERROR_TEXT[code] || 'Algo salió mal. Probá de nuevo.';
