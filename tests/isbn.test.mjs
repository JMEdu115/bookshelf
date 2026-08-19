import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidIsbn, looksLikeIsbn, parseYear } from '../js/isbn.js';

test('ISBN-13 檢查碼：正確的過、打錯一碼的擋', () => {
  assert.equal(isValidIsbn('9789573287674'), true);
  assert.equal(isValidIsbn('978-957-32-8767-4'), true); // 連字號可
  assert.equal(isValidIsbn('9789573287675'), false); // 末碼錯
  assert.equal(isValidIsbn('9789573287647'), false); // 相鄰對調
});

test('ISBN-10 檢查碼（含 X 校驗位）', () => {
  assert.equal(isValidIsbn('0306406152'), true);
  assert.equal(isValidIsbn('080442957X'), true);
  assert.equal(isValidIsbn('0306406153'), false);
});

test('looksLikeIsbn 只驗形狀——用來區分打錯字 vs 格式不對', () => {
  assert.equal(looksLikeIsbn('9789573287675'), true); // 形狀對但檢查碼錯
  assert.equal(looksLikeIsbn('12345'), false);
});

test('parseYear 各種出版日期格式', () => {
  assert.equal(parseYear('2020'), 2020);
  assert.equal(parseYear('2020-05'), 2020);
  assert.equal(parseYear('May 2, 1997'), 1997);
  assert.equal(parseYear(''), 0);
});
