import assert from 'node:assert/strict';
import { parseNasajonCsv } from '../services/csvImport.service.js';

const header = [
  'Estabelecimento',
  'Código do produto',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'Vendas (Unidade Padrão)'
].join(';');

const row = [
  'MATRIZ',
  'A1',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '1.234,5'
].join(';');

const records = parseNasajonCsv(Buffer.from(`${header}\n${row}`, 'utf8'));
assert.equal(records.length, 1);
assert.equal(records[0][0], 'MATRIZ');
assert.equal(records[0][1], 'A1');
assert.equal(records[0][17], '1.234,5');
