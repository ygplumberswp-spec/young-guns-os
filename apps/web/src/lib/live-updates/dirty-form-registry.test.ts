import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDirtyForms,
  hasDirtyForms,
  registerDirtyForm,
  unregisterDirtyForm,
} from './dirty-form-registry.js';

test('tracks dirty forms for live-update deferral', () => {
  clearDirtyForms();
  assert.equal(hasDirtyForms(), false);
  registerDirtyForm('quote:new');
  assert.equal(hasDirtyForms(), true);
  unregisterDirtyForm('quote:new');
  assert.equal(hasDirtyForms(), false);
});

test('clearDirtyForms resets all registrations', () => {
  registerDirtyForm('invoice:abc');
  registerDirtyForm('quote:def');
  clearDirtyForms();
  assert.equal(hasDirtyForms(), false);
});
