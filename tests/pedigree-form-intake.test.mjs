import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDriveFileIds, parseFormSubmission } from '../app/lib/pedigree-form-intake.ts';

const headers = [
  'Деловодни број', 'Временска ознака', 'Имејл адреса', 'Основна одгајивачка организација',
  'Врста захтева', 'Назначити ако је хитна израда', 'Одгајивачки програм',
  'Број грла на захтеву', 'Име и презиме продавца', 'Име и презиме купца',
  'Електронски потписан захтев доставити заједно са прилозима', 'Имејл адреса 2',
];

test('maps Google Form response headers and attachment links without depending on fixed column positions', () => {
  const submission = parseFormSubmission(headers, [
    1469, '2026-03-27T09:55:30Z', 'office@example.test', 'Veterinarska stanica',
    'Zahtev za izdavanje pedigrea', 'Hitna izrada', 'Mlečno govedarstvo', 2,
    'Seller', 'Buyer',
    'https://drive.google.com/open?id=file_abc, https://drive.google.com/file/d/file_xyz/view', '',
  ], 2);
  assert.equal(submission.responseId, '1469');
  assert.equal(submission.declaredAnimalCount, 2);
  assert.equal(submission.urgent, true);
  assert.deepEqual(submission.attachmentFileIds, ['file_abc', 'file_xyz']);
  assert.equal(submission.checks.length, 0);
});

test('surfaces zero animals and missing attachments for operator review', () => {
  const submission = parseFormSubmission(headers, [1469, '2026-03-27', '', '', '', '', '', 0, '', '', '', ''], 2);
  assert.deepEqual(submission.checks.map(x => x.code), ['zero_animal_count', 'missing_attachments']);
});

test('deduplicates Drive file IDs and ignores unrelated links', () => {
  assert.deepEqual(extractDriveFileIds(
    'https://drive.google.com/open?id=one, https://drive.google.com/open?id=one',
    'https://example.test/file/other',
  ), ['one']);
});
