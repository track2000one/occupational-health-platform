import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANGUAGE_STORAGE_KEY, resolveAppLanguage, getInitialAppLanguage,
  rememberAppLanguage, applyDocumentLanguage,
} from './languagePreference.ts';

test('Arabic is first-choice and unknown locale values revert safely to Arabic', () => {
  assert.equal(resolveAppLanguage(null), 'ar');
  assert.equal(resolveAppLanguage('ar'), 'ar');
  assert.equal(resolveAppLanguage('en'), 'en');
  assert.equal(resolveAppLanguage('fr'), 'ar');
  assert.equal(resolveAppLanguage('EN'), 'ar');
});

test('first visit defaults to Arabic; English selection is remembered and sets LTR', () => {
  const oldWindow = (globalThis as {window?: unknown}).window;
  const oldDocument = (globalThis as {document?: unknown}).document;
  const values = new Map<string,string>();
  const html = {lang: '', dir: ''};
  try {
    Object.assign(globalThis, {
      window: {localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key,value); },
      }},
      document: {documentElement: html},
    });
    assert.equal(getInitialAppLanguage(), 'ar');
    applyDocumentLanguage('ar');
    assert.deepEqual(html, {lang: 'ar', dir: 'rtl'});
    rememberAppLanguage('en');
    assert.equal(values.get(LANGUAGE_STORAGE_KEY), 'en');
    assert.equal(getInitialAppLanguage(), 'en');
    assert.deepEqual(html, {lang: 'en', dir: 'ltr'});
    rememberAppLanguage('ar');
    assert.equal(getInitialAppLanguage(), 'ar');
    assert.deepEqual(html, {lang: 'ar', dir: 'rtl'});
  } finally {
    if (oldWindow === undefined) Reflect.deleteProperty(globalThis,'window');
    else Object.assign(globalThis,{window:oldWindow});
    if (oldDocument === undefined) Reflect.deleteProperty(globalThis,'document');
    else Object.assign(globalThis,{document:oldDocument});
  }
});

test('blocked storage does not prevent Arabic startup or language changes', () => {
  const oldWindow = (globalThis as {window?: unknown}).window;
  try {
    Object.assign(globalThis, {window: {localStorage: {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    }}});
    assert.equal(getInitialAppLanguage(), 'ar');
    assert.doesNotThrow(() => rememberAppLanguage('en'));
  } finally {
    if (oldWindow === undefined) Reflect.deleteProperty(globalThis,'window');
    else Object.assign(globalThis,{window:oldWindow});
  }
});
