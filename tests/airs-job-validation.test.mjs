import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobInput, parseJobResult } from '../app/lib/airs-job-validation.ts';
const ids = ['7169162596', '7128503206', '7149200622', '7169154959'];
const row = id => ({ 'Broj životinje': id, Kretanje: 'Dolazak', 'Datum dolaska': '22.10.2026', 'Datum odlaska': '', 'Dolazak na gazdinstvo': '800000000001', Držalac: 'Test holder', __WARN: '0' });
test('normalizes RS without changing digits or allowing ambiguous/duplicate IDs', () => {
  assert.deepEqual(parseJobInput({ request_ref: 'TEST-001', animal_ids: ['RS ' + ids[0]] }).animal_ids, [ids[0]]);
  for (const animal_ids of [[ids[0], 'RS' + ids[0]], ['716916259'], ['RS71 69162596'], [7169162596], Array(21).fill(ids[0])]) assert.throws(() => parseJobInput({ request_ref: 'TEST', animal_ids }));
});
test('requires coverage of every requested animal, rejects foreign animals and empty rows', () => {
  assert.equal(parseJobResult({ status: 'completed', rows: ids.map(row) }, ids).status, 'completed');
  assert.throws(() => parseJobResult({ status: 'completed', rows: ids.slice(1).map(row) }, ids), /missing_animals/);
  assert.throws(() => parseJobResult({ status: 'completed', rows: [row('7100000000')] }, ids), /unexpected_animal/);
  assert.throws(() => parseJobResult({ status: 'completed', rows: [] }, ids));
  assert.throws(() => parseJobResult({ status: 'completed', rows: [{ ...row(ids[0]), Kretanje: '', 'Datum dolaska': '' }] }, [ids[0]]), /empty_movement/);
});
test('warnings are review outcomes, failures cannot be presented as successful checks', () => {
  const rows = ids.map(row); rows[0].__WARN = '1';
  assert.equal(parseJobResult({ status: 'completed', rows }, ids).status, 'needs_review');
  assert.equal(parseJobResult({ status: 'failed', error: 'airs_login_required' }, ids).status, 'failed');
  assert.throws(() => parseJobResult({ status: 'failed', error: 'anything' }, ids));
});
