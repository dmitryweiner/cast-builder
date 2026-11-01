// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApp } from './app';
import { LOCALE_NAMES, LOCALES } from './i18n';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type KeyValueStorage } from './storage';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>')).replace(/<script[^>]*><\/script>/g, '');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));

function $<T extends Element>(selector: string, type: abstract new () => T): T {
  const el = document.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`missing ${selector}`);
  return el;
}
const text = (selector: string) => $(selector, HTMLElement).textContent;
function selectLocale(locale: string) {
  const select = $('#locale', HTMLSelectElement);
  select.value = locale;
  select.dispatchEvent(new Event('change'));
}

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

let stop: () => void = () => {};
let storage: MemoryStorage;

function start(languages: readonly string[] = ['en-US']) {
  stop = startApp({ storage, languages });
}

beforeEach(() => {
  document.head.innerHTML = head;
  document.body.innerHTML = body;
  storage = new MemoryStorage();
});
afterEach(() => stop());

describe('language', () => {
  it('lists every locale in the switcher by its own name', () => {
    const options = [...$('#locale', HTMLSelectElement).options].map((o) => [o.value, o.textContent]);
    expect(options).toEqual(LOCALES.map((l) => [l, LOCALE_NAMES[l]]));
  });

  it('follows the browser when nothing is saved', () => {
    start(['ru-RU', 'en']);
    expect(document.documentElement.lang).toBe('ru');
    expect(document.title).toBe('Шаблон веб-приложения');
    expect(text('#count')).toBe('Нажать');
    expect($('#locale', HTMLSelectElement).getAttribute('aria-label')).toBe('Язык');
  });

  it('falls back to English', () => {
    start(['de-DE']);
    expect(document.documentElement.lang).toBe('en');
    expect(text('h1')).toBe('Web App Template');
  });

  it('saves the switcher choice and prefers it over the browser', () => {
    start(['en-US']);
    selectLocale('he');
    expect(loadSettings(storage).locale).toBe('he');
    stop();
    document.body.innerHTML = body;
    start(['ru-RU']);
    expect(document.documentElement.lang).toBe('he');
    expect($('#locale', HTMLSelectElement).value).toBe('he');
  });

  it('turns the page right-to-left for Hebrew and back', () => {
    start();
    selectLocale('he');
    expect(document.documentElement.dir).toBe('rtl');
    selectLocale('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('keeps the state when the language changes', () => {
    start();
    $('#count', HTMLButtonElement).click();
    selectLocale('ru');
    expect(text('#clicked')).toBe('Нажато 1 раз');
  });
});

describe('counter', () => {
  it('counts clicks with plural forms and saves them', () => {
    start();
    expect(text('#clicked')).toBe('Not clicked yet');
    expect($('#reset', HTMLButtonElement).disabled).toBe(true);
    $('#count', HTMLButtonElement).click();
    $('#count', HTMLButtonElement).click();
    expect(text('#clicked')).toBe('Clicked 2 times');
    expect(loadSettings(storage).count).toBe(2);
  });

  it('starts from the saved count and resets it', () => {
    saveSettings(storage, { ...DEFAULT_SETTINGS, count: 1 });
    start();
    expect(text('#clicked')).toBe('Clicked 1 time');
    $('#reset', HTMLButtonElement).click();
    expect(text('#clicked')).toBe('Not clicked yet');
    expect(loadSettings(storage).count).toBe(0);
  });

  it('works without storage', () => {
    stop = startApp({ storage: null, languages: [] });
    $('#count', HTMLButtonElement).click();
    expect(text('#clicked')).toBe('Clicked 1 time');
  });
});
