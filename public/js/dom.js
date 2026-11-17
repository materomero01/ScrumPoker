/**
 * Mini helper para crear nodos sin innerHTML: todo texto entra como textContent,
 * así un nombre como "<img onerror=…>" se muestra literal y nunca se ejecuta.
 */
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}

const toasts = () => document.getElementById('toasts');

export function toast(message, { type = 'info', ms = 3200 } = {}) {
    const container = toasts();
    while (container.children.length >= 3) container.firstElementChild.remove();
    const el = h('div', { class: `toast${type === 'error' ? ' is-error' : ''}`, text: message });
    container.append(el);
    setTimeout(() => {
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 300);
    }, ms);
}

/** Anuncio solo para lectores de pantalla. */
export function announce(message) {
    const el = document.getElementById('announcer');
    el.textContent = '';
    requestAnimationFrame(() => { el.textContent = message; });
}

export function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

const numberFmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

export function formatValue(v) {
    return typeof v === 'number' ? numberFmt.format(v) : String(v);
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
