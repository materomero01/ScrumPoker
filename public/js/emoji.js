import { h } from './dom.js';

const QUICK = ['🍅', '📄', '✈️', '🎯', '🔥', '👏', '🤔', '☕', '🐢', '🚀', '💡', '🎉'];
const PICKER_URL = 'https://cdn.jsdelivr.net/npm/emoji-picker-element@1.29.1/index.js';
const KEY = 'scrum-poker:emoji';

let current = '🍅';
try { current = localStorage.getItem(KEY) || current; } catch { /* sin storage */ }

export const currentEmoji = () => current;

export function setupEmojiPicker() {
    const btn = document.getElementById('btn-emoji');
    const pop = document.getElementById('emoji-pop');
    const grid = document.getElementById('emoji-grid');
    const more = document.getElementById('btn-emoji-more');
    const slot = document.getElementById('emoji-picker-slot');
    const label = document.getElementById('emoji-current');

    function select(emoji) {
        current = emoji;
        label.textContent = emoji;
        try { localStorage.setItem(KEY, emoji); } catch { /* sin storage */ }
        grid.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.emoji === emoji)));
    }

    function setOpen(open) {
        pop.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        if (open) grid.querySelector('[aria-pressed="true"]')?.focus() || grid.querySelector('button')?.focus();
    }

    grid.replaceChildren(...QUICK.map(e => h('button', {
        type: 'button', dataset: { emoji: e }, 'aria-pressed': 'false', 'aria-label': `Usar ${e}`, text: e,
        onclick: () => { select(e); setOpen(false); btn.focus(); },
    })));
    select(current);

    btn.addEventListener('click', () => setOpen(pop.hidden));
    document.addEventListener('click', e => {
        if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    pop.addEventListener('keydown', e => {
        if (e.key === 'Escape') { setOpen(false); btn.focus(); }
    });

    more.addEventListener('click', async () => {
        more.disabled = true;
        more.textContent = 'Cargando…';
        try {
            await import(PICKER_URL);
            const picker = document.createElement('emoji-picker');
            picker.classList.add('dark');
            picker.addEventListener('emoji-click', ev => {
                select(ev.detail.unicode);
                setOpen(false);
                btn.focus();
            });
            slot.replaceChildren(picker);
            more.hidden = true;
        } catch {
            more.disabled = false;
            more.textContent = 'No se pudo cargar. Reintentar';
        }
    });

    return {
        setEnabled(enabled) {
            btn.disabled = !enabled;
            if (!enabled) setOpen(false);
            btn.title = enabled ? '' : 'Los emojis están desactivados en esta sala';
        },
    };
}
