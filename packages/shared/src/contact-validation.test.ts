import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPlaceholderEmail,
  isValidEmailAddress,
  isValidSaMobile,
  isValidSaPhone,
  normalizeSaMobile,
  normalizeSaPhone,
} from './contact-validation.js';

describe('SA mobile normalisation', () => {
  it('normalises local and international mobiles', () => {
    assert.equal(normalizeSaMobile('0821234567'), '+27821234567');
    assert.equal(normalizeSaMobile('+27 82 123 4567'), '+27821234567');
    assert.equal(normalizeSaMobile('27821234567'), '+27821234567');
  });

  it('rejects landlines and invalid mobiles', () => {
    assert.equal(normalizeSaMobile('0215551234'), null);
    assert.equal(isValidSaMobile('0215551234'), false);
    assert.equal(isValidSaMobile('082123'), false);
  });

  it('accepts landlines via SA phone helper', () => {
    assert.equal(normalizeSaPhone('0215551234'), '+27215551234');
    assert.equal(isValidSaPhone('0215551234'), true);
  });
});

describe('email validation and placeholders', () => {
  it('validates emails', () => {
    assert.equal(isValidEmailAddress('owner@example.org'), true);
    assert.equal(isValidEmailAddress('not-an-email'), false);
  });

  it('flags Young Guns / company placeholder emails', () => {
    assert.equal(isPlaceholderEmail('noreply@youngguns.co.za'), true);
    assert.equal(isPlaceholderEmail('xero+abc@imports.local'), true);
    assert.equal(isPlaceholderEmail('placeholder@example.com'), true);
    assert.equal(isPlaceholderEmail('thabo@clienthome.co.za'), false);
  });
});
