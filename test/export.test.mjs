import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, historyToCSV, historyToMarkdown } from '../public/js/export.js';

const history = [{
    round: 1,
    task: 'Login | SSO',
    results: [{ name: '=HYPERLINK("http://x")', vote: 5 }, { name: 'Beto', vote: 8 }],
    stats: { average: 6.5, consensus: false, suggestion: 8 },
}];

test('csvCell neutraliza fórmulas y escapa comillas', () => {
    assert.equal(csvCell('=1+1'), `"'=1+1"`);
    assert.equal(csvCell('-2'), `"'-2"`);
    assert.equal(csvCell('a"b'), '"a""b"');
    assert.equal(csvCell(5), '"5"');
});

test('historyToCSV genera una fila por voto', () => {
    const csv = historyToCSV(history).trim().split('\r\n');
    assert.equal(csv.length, 3);
    assert.match(csv[1], /^"1","Login \| SSO","'=HYPERLINK/);
});

test('historyToMarkdown escapa pipes', () => {
    const md = historyToMarkdown(history);
    assert.match(md, /Login \\\| SSO/);
    assert.match(md, /\| 8 \|/);
});
