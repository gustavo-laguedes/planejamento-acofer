import assert from 'node:assert/strict';
import {
  escapeHtml,
  formatDateOnly,
  formatPeriod,
  formatPtBrDecimal,
  formatPtBrInteger,
  normalizeJsonArray,
  normalizeJsonObject,
  normalizeText,
  parsePtBrDecimal
} from '../shared/planning-presentation/planningFormatters.js';

assert.equal(formatDateOnly('2026-08-07'), '07/08/2026');
assert.equal(formatDateOnly('2026-08-07T15:30:00.000Z'), '07/08/2026');
assert.equal(formatDateOnly(''), '');
assert.equal(formatDateOnly(null), '');
assert.equal(formatDateOnly(undefined), '');
assert.equal(formatDateOnly('07/08/2026'), '');

assert.equal(formatPeriod('2026-08-07', '2026-08-09'), '07/08/2026 at\u00e9 09/08/2026');
assert.equal(formatPeriod(null, '2026-08-09'), 'Per\u00edodo n\u00e3o informado');
assert.equal(formatPeriod('2026-08-07', null), 'Per\u00edodo n\u00e3o informado');
assert.equal(formatPeriod('', ''), 'Per\u00edodo n\u00e3o informado');

assert.equal(parsePtBrDecimal('1.234,56'), 1234.56);
assert.equal(parsePtBrDecimal('1234,56'), 1234 + (56 / 60));
assert.equal(parsePtBrDecimal('0'), 0);
assert.equal(parsePtBrDecimal(12.5), 12.5);
assert.equal(parsePtBrDecimal('1,30'), 1.5);
assert.equal(parsePtBrDecimal('-1.234,56'), -1234.56);
assert.ok(Number.isNaN(parsePtBrDecimal('abc')));
assert.equal(parsePtBrDecimal('abc', 7), 7);
assert.ok(Number.isNaN(parsePtBrDecimal('')));
assert.equal(parsePtBrDecimal('', 7), 7);

assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#039;');
assert.equal(escapeHtml('texto sem especiais'), 'texto sem especiais');
assert.equal(escapeHtml(null), '');
assert.equal(escapeHtml(undefined), '');

assert.equal(normalizeText('  ÁÇO Fér  '), 'aco fer');
assert.equal(normalizeText('  Dois   Espaços  '), 'dois   espacos');
assert.equal(normalizeText(null), '');
assert.equal(normalizeText(undefined), '');
assert.equal(normalizeText(''), '');

const originalArray = [{ id: 1 }];
assert.equal(normalizeJsonArray(originalArray), originalArray);
assert.deepEqual(normalizeJsonArray('[{"id":1}]'), [{ id: 1 }]);
assert.deepEqual(normalizeJsonArray('invalido'), []);
assert.deepEqual(normalizeJsonArray({ id: 1 }), []);
assert.deepEqual(normalizeJsonArray(null), []);
assert.deepEqual(normalizeJsonArray(''), []);

const originalObject = { id: 1 };
assert.equal(normalizeJsonObject(originalObject), originalObject);
assert.deepEqual(normalizeJsonObject('{"id":1}'), { id: 1 });
assert.deepEqual(normalizeJsonObject('invalido'), {});
assert.deepEqual(normalizeJsonObject([1, 2]), [1, 2]);
assert.deepEqual(normalizeJsonObject(null), {});
assert.deepEqual(normalizeJsonObject(''), {});

assert.equal(formatPtBrDecimal(0), '0');
assert.equal(formatPtBrDecimal(1234), '1.234');
assert.equal(formatPtBrDecimal(1234.56), '1.234,56');
assert.equal(formatPtBrDecimal(1234.5678), '1.234,568');
assert.equal(formatPtBrDecimal(-1234.56), '-1.234,56');
assert.equal(formatPtBrDecimal(null), '0');
assert.equal(formatPtBrDecimal(undefined), '');

assert.equal(formatPtBrInteger(0), '0');
assert.equal(formatPtBrInteger(1234), '1.234');
assert.equal(formatPtBrInteger(1234.56), '1.234');
assert.equal(formatPtBrInteger(-1234), '0');
assert.equal(formatPtBrInteger(null), '0');
assert.equal(formatPtBrInteger(undefined), '0');

console.log('planningFormatters.test.js ok');
