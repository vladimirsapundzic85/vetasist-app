import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnimalCase, resolveIdentitySource } from '../app/lib/airs-case-validation.ts';

const identity = {
  animalId: '7169162596', birthDate: '2025-03-25', registryNumber: 'REG-1',
  sireId: 'RS7000000001', damId: 'RS7000000002', breeder: 'Farm A', sex: 'female', status: 'alive',
};

test('selects registry for RS, attached pedigree for foreign IDs, and Zemun pedigree exception', () => {
  assert.equal(resolveIdentitySource(true), 'serbian_register');
  assert.equal(resolveIdentitySource(true, true), 'institute_zemun_pedigree');
  assert.equal(resolveIdentitySource(false), 'attached_pedigree');
});

test('checks RS identity against registry and applies the Zemun exception', () => {
  const base = { animalId: 'RS7169162596', hasRsPrefix: true, requested: identity };
  const mismatch = evaluateAnimalCase({ ...base, register: { ...identity, damId: 'RS7000000999' } });
  assert.ok(mismatch.some(x => x.code === 'identity_mismatch_damId'));
  assert.ok(!mismatch.some(x => x.code === 'missing_pedigree'));

  const zemun = evaluateAnimalCase({ ...base, hasInstituteZemunPedigree: true, attachedPedigree: identity });
  assert.ok(!zemun.some(x => x.code === 'missing_register'));
  assert.ok(!zemun.some(x => x.code === 'missing_pedigree'));
});

test('foreign animals use attached pedigree and missing identity data remains visible', () => {
  const checks = evaluateAnimalCase({ animalId: '7169162596', hasRsPrefix: false, requested: identity, attachedPedigree: { ...identity, sex: 'male' } });
  assert.ok(checks.some(x => x.code === 'identity_mismatch_sex'));
  assert.ok(!checks.some(x => x.code === 'missing_register'));
});

test('normalizes Serbian dates, sex labels and RS prefixes before comparing identity fields', () => {
  const checks = evaluateAnimalCase({
    animalId: 'RS7169162596', hasRsPrefix: true,
    requested: { ...identity, birthDate: '25.03.25', sex: 'Žensko', sireId: 'RS 7000000001' },
    register: { ...identity, birthDate: '2025-03-25', sex: 'F', sireId: '7000000001' },
  });
  assert.deepEqual(checks.filter(x => x.code.startsWith('identity_mismatch_')), []);
});

test('compares smotra owner to the AIRS owner interval on smotra date', () => {
  const checks = evaluateAnimalCase({
    animalId: identity.animalId,
    hasRsPrefix: true,
    register: identity,
    requested: identity,
    smotra: { ordinalNumber: '42', date: '2026-07-31', owner: 'Old owner' },
    airsOwnership: [
      { owner: 'Old owner', from: '2025-03-25', to: '2026-10-26' },
      { owner: 'New owner', from: '2026-10-27' },
    ],
  });
  assert.ok(!checks.some(x => x.code === 'smotra_airs_owner_mismatch'));
});

test('checks smotra ordinal and request seller, buyer, and sale date against AIRS transitions', () => {
  const input = {
    animalId: identity.animalId, hasRsPrefix: true, register: identity,
    requested: { ...identity, smotraOrdinalNumber: '18', seller: 'Old Farm', buyer: 'New Farm', saleDate: '27.10.26' },
    smotra: { ordinalNumber: '19', date: '2026-07-31', owner: 'Old Farm' },
    airsOwnership: [
      { owner: 'Old Farm', from: '2025-03-25', to: '2026-10-26' },
      { owner: 'New Farm', from: '2026-10-28' },
    ],
  };
  const checks = evaluateAnimalCase(input);
  assert.ok(checks.some(x => x.code === 'smotra_ordinal_mismatch'));
  assert.ok(checks.some(x => x.code === 'airs_transfer_unknown'));

  const withIntermediary = evaluateAnimalCase({
    ...input,
    airsOwnership: [
      { owner: 'Old Farm', from: '2025-03-25', to: '2026-10-26' },
      { owner: 'Middle Farm', from: '2026-10-27', to: '2026-10-27' },
      { owner: 'New Farm', from: '2026-10-28' },
    ],
  });
  assert.ok(withIntermediary.some(x => x.code === 'airs_intermediary_owner'));
  assert.ok(withIntermediary.some(x => x.code === 'airs_transfer_date_mismatch'));
});

test('warns about a smotra/AIRS owner mismatch and missing AIRS interval', () => {
  const base = { animalId: identity.animalId, hasRsPrefix: true, register: identity, requested: identity,
    smotra: { ordinalNumber: '42', date: '2026-07-31', owner: 'Different owner' } };
  assert.ok(evaluateAnimalCase({ ...base, airsOwnership: [{ owner: 'Old owner', from: '2025-03-25' }] }).some(x => x.code === 'smotra_airs_owner_mismatch'));
  assert.ok(evaluateAnimalCase({ ...base, airsOwnership: [] }).some(x => x.code === 'airs_owner_unknown_on_smotra_date'));
});

test('checks parity, missing lactations and production thresholds', () => {
  const checks = evaluateAnimalCase({
    animalId: identity.animalId, hasRsPrefix: true, register: identity, requested: { ...identity, parity: 5, lactationCount: 5 },
    milkRecord: { parity: 5, lactations: [
      { number: 1, days: 305, milkKg: 9000, fatPercent: 4.0, proteinPercent: 3.3 },
      { number: 2, days: 305, milkKg: 10000, fatPercent: 4.9, proteinPercent: 4.8 },
      { number: 3, days: 305, milkKg: 9000, fatPercent: 4.1, proteinPercent: 3.5 },
      { number: 5, days: 250, milkKg: 11000, fatPercent: 4.2, proteinPercent: 3.4 },
    ] },
  });
  assert.ok(checks.some(x => x.code === 'lactation_row_count_mismatch'));
  assert.ok(checks.some(x => x.code === 'missing_lactations' && x.actual === '4'));
  assert.ok(checks.some(x => x.code === 'high_daily_milk' && x.field === 'lactation_5'));
  assert.ok(checks.some(x => x.code === 'high_fatPercent' && x.field === 'lactation_2'));
  assert.ok(checks.some(x => x.code === 'high_proteinPercent' && x.field === 'lactation_2'));
});

test('40 kg/day is allowed; only a value above 40 kg/day triggers a warning', () => {
  const base = { animalId: identity.animalId, hasRsPrefix: true, register: identity, requested: identity };
  const atLimit = evaluateAnimalCase({ ...base, milkRecord: { lactations: [{ number: 1, days: 100, milkKg: 4000 }] } });
  const aboveLimit = evaluateAnimalCase({ ...base, milkRecord: { lactations: [{ number: 1, days: 100, milkKg: 4001 }] } });
  assert.ok(!atLimit.some(x => x.code === 'high_daily_milk'));
  assert.equal(aboveLimit.find(x => x.code === 'high_daily_milk')?.actual, 40.01);
});

test('keeps incomplete or repeated lactation rows visible for manual review', () => {
  const checks = evaluateAnimalCase({
    animalId: identity.animalId, hasRsPrefix: true, register: identity, requested: identity,
    milkRecord: { parity: 3, lactations: [
      { number: 1, days: 305, milkKg: 7000 },
      { number: 2, days: null, milkKg: null },
      { number: 2, days: 300, milkKg: 8000 },
      { number: 3, days: 0, milkKg: 0 },
    ] },
  });
  assert.ok(checks.some(x => x.code === 'incomplete_lactation_data' && x.field === 'lactation_2'));
  assert.ok(checks.some(x => x.code === 'duplicate_lactation_numbers'));
  assert.ok(checks.some(x => x.code === 'invalid_lactation_values' && x.field === 'lactation_3'));
});

test('marks a current unfinished lactation separately from missing historical data', () => {
  const checks = evaluateAnimalCase({
    animalId: identity.animalId, hasRsPrefix: true, register: identity, requested: identity,
    milkRecord: { parity: 2, lactations: [
      { number: 1, days: 321, milkKg: 7763 },
      { number: 2, ongoing: true },
    ] },
  });
  assert.ok(checks.some(x => x.code === 'ongoing_lactation' && x.field === 'lactation_2'));
  assert.ok(!checks.some(x => x.code === 'incomplete_lactation_data'));
});
