import { h, formatValue, toast } from './dom.js';
import { historyToCSV, historyToMarkdown } from './export.js';

function wireClose(dlg) {
    dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
    // Click en el backdrop cierra
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}

const BOM = String.fromCharCode(0xfeff); // para que Excel detecte UTF-8

// ── Historial ───────────────────────────────────────────────────────────

export function setupHistory({ fetchHistory, roomId }) {
    const dlg = document.getElementById('dlg-history');
    const list = document.getElementById('history-list');
    let history = [];
    wireClose(dlg);

    function render() {
        if (!history.length) {
            list.replaceChildren(h('p', { class: 'history-empty', text: 'Todavía no se reveló ninguna ronda. Cuando revelen, cada resultado queda acá.' }));
            return;
        }
        list.replaceChildren(...[...history].reverse().map(r => {
            const s = r.stats || {};
            const value = s.suggestion !== null && s.suggestion !== undefined ? formatValue(s.suggestion) : '?';
            const meta = [`Ronda ${r.round}`];
            if (s.consensus) meta.push('consenso');
            else if (s.average !== null && s.average !== undefined) meta.push(`promedio ${formatValue(s.average)}`);
            return h('article', { class: `round${s.consensus ? ' is-consensus' : ''}` },
                h('p', { class: 'round-task', text: r.task }),
                h('p', { class: 'round-meta', text: meta.join(', ') }),
                h('span', { class: 'round-value', text: value }),
                h('p', { class: 'round-votes', text: r.results.map(x => `${x.name} ${formatValue(x.vote)}`).join(', ') }),
            );
        }));
    }

    async function load() {
        const res = await fetchHistory();
        if (res.ok) history = res.history;
        return res.ok;
    }

    document.getElementById('btn-history').addEventListener('click', async () => {
        await load();
        render();
        dlg.showModal();
    });

    document.getElementById('btn-export-csv').addEventListener('click', async () => {
        await load();
        if (!history.length) return toast('No hay rondas para exportar todavía.');
        const blob = new Blob([BOM + historyToCSV(history)], { type: 'text/csv;charset=utf-8' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `scrum-poker-${roomId()}.csv` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        toast('CSV descargado');
    });

    document.getElementById('btn-export-md').addEventListener('click', async () => {
        await load();
        if (!history.length) return toast('No hay rondas para copiar todavía.');
        try {
            await navigator.clipboard.writeText(historyToMarkdown(history));
            toast('Tabla copiada en Markdown');
        } catch {
            toast('No se pudo copiar. Tu navegador bloqueó el portapapeles.', { type: 'error' });
        }
    });
}

// ── Sala (configuración + personas) ─────────────────────────────────────

export function setupSettings({ getState, getMe, decks, actions }) {
    const dlg = document.getElementById('dlg-settings');
    const form = document.getElementById('settings-form');
    const deckBox = document.getElementById('deck-options');
    const people = document.getElementById('people-list');
    const note = document.getElementById('settings-readonly');
    wireClose(dlg);

    function renderDecks() {
        const available = decks();
        if (deckBox.childElementCount === Object.keys(available).length) return;
        deckBox.replaceChildren(...Object.entries(available).map(([key, d]) => h('label', { class: 'deck-option' },
            h('input', { type: 'radio', name: 'deck', value: key }),
            h('span', { text: d.label }),
            h('span', { class: 'values', text: d.values.map(formatValue).join('  ') }),
        )));
    }

    function render() {
        const state = getState();
        const me = getMe();
        if (!state || !me) return;
        renderDecks();
        const isMod = state.moderatorId === me.id;
        note.hidden = isMod;
        form.querySelectorAll('fieldset').forEach(f => { f.disabled = !isMod; });

        const s = state.settings;
        form.querySelectorAll('input[name="deck"]').forEach(r => { r.checked = r.value === s.deck; });
        form.elements.autoReveal.checked = s.autoReveal;
        form.elements.moderatorOnly.checked = s.moderatorOnly;
        form.elements.emojis.checked = s.emojis;
        form.elements.timerSec.value = String(s.timerSec);

        people.replaceChildren(...state.players.map(p => {
            const isMe = p.id === me.id;
            const meta = [];
            if (p.id === state.moderatorId) meta.push('modera');
            if (p.role === 'observer') meta.push('observa');
            if (!p.connected) meta.push('desconectado');
            return h('li', {},
                h('span', { class: 'who' }, isMe ? `${p.name} (vos)` : p.name, ' ', h('span', { class: 'meta', text: meta.join(', ') })),
                isMod && !isMe ? h('button', { type: 'button', text: 'Pasar moderación', onclick: () => actions.makeModerator(p) }) : null,
                isMod && !isMe ? h('button', { type: 'button', class: 'kick', text: 'Sacar', onclick: () => actions.kick(p) }) : null,
            );
        }));
    }

    form.addEventListener('change', e => {
        const t = e.target;
        const patch = t.name === 'deck' ? { deck: t.value }
            : t.name === 'timerSec' ? { timerSec: Number(t.value) }
                : { [t.name]: t.checked };
        actions.updateSettings(patch);
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        render();
        dlg.showModal();
    });
    document.getElementById('btn-leave').addEventListener('click', () => {
        dlg.close();
        actions.leave();
    });

    return { refresh: () => { if (dlg.open) render(); } };
}
