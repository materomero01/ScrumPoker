/** Exportaciones del historial. Módulo puro: se testea desde Node. */

const FORMULA_START = /^[=+\-@\t\r]/;

/** Escapa una celda CSV y neutraliza fórmulas (inyección CSV en Excel/Sheets). */
export function csvCell(value) {
    let s = String(value ?? '');
    if (FORMULA_START.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

export function historyToCSV(history) {
    const rows = [['Ronda', 'Tarea', 'Jugador', 'Voto', 'Promedio', 'Consenso']];
    for (const r of history) {
        for (const { name, vote } of r.results) {
            rows.push([r.round, r.task, name, vote, r.stats?.average ?? '', r.stats?.consensus ? 'sí' : 'no']);
        }
    }
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const mdCell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function historyToMarkdown(history) {
    const lines = ['| Ronda | Tarea | Resultado | Votos |', '| --- | --- | --- | --- |'];
    for (const r of history) {
        const result = r.stats?.consensus ? `${r.stats.suggestion} (consenso)` : (r.stats?.suggestion ?? '');
        const votes = r.results.map(x => `${x.name}: ${x.vote}`).join(', ');
        lines.push(`| ${r.round} | ${mdCell(r.task)} | ${mdCell(result)} | ${mdCell(votes)} |`);
    }
    return lines.join('\n');
}
