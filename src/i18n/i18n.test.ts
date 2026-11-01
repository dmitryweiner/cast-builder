// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLocale, direction, isLocale, LOCALES, messages, staticText } from './index';
import { plural } from './plural';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const keysIn = (attribute: string) => [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((m) => m[1] ?? '');

describe('detectLocale', () => {
  it('prefers the saved locale', () => {
    expect(detectLocale('he', ['ru-RU'])).toBe('he');
  });

  it('takes the first supported browser language', () => {
    expect(detectLocale(null, ['ru-RU', 'en'])).toBe('ru');
    expect(detectLocale(null, ['de-DE', 'he-IL', 'ru'])).toBe('he');
    expect(detectLocale(null, ['en-GB', 'ru'])).toBe('en');
    expect(detectLocale(null, ['RU'])).toBe('ru');
  });

  it('falls back to English', () => {
    expect(detectLocale(null, [])).toBe('en');
    expect(detectLocale(null, ['de-DE', 'fr'])).toBe('en');
    expect(detectLocale('xx', ['de'])).toBe('en');
  });
});

describe('isLocale', () => {
  it('accepts only supported locales', () => {
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe('direction', () => {
  it('is right-to-left for Hebrew only', () => {
    expect(direction('he')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
    expect(direction('ru')).toBe('ltr');
  });
});

describe('messages', () => {
  it('have the same keys in every locale', () => {
    const keys = Object.keys(messages.en).toSorted();
    for (const locale of LOCALES) expect(Object.keys(messages[locale]).toSorted()).toEqual(keys);
  });

  it.each(LOCALES)('cover every text in index.html (%s)', (locale) => {
    const keys = [...keysIn('data-i18n'), ...keysIn('data-i18n-label')];
    expect(keys.length).toBeGreaterThan(3);
    for (const key of keys) expect({ key, text: staticText(messages[locale], key) }).toEqual({ key, text: expect.any(String) });
  });

  it('do not have static texts for unknown keys or functions', () => {
    expect(staticText(messages.en, 'missing')).toBeUndefined();
    expect(staticText(messages.en, 'clicked')).toBeUndefined();
  });

  it('match the English defaults in index.html', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.title).toBe(messages.en.title);
    for (const el of doc.querySelectorAll<HTMLElement>('[data-i18n]')) {
      // Prettier may wrap long texts in index.html.
      expect(el.textContent.replace(/\s+/g, ' ').trim()).toBe(staticText(messages.en, el.dataset.i18n ?? ''));
    }
  });

  it('format plural forms', () => {
    expect(messages.en.clicked(0)).toBe('Not clicked yet');
    expect(messages.en.clicked(1)).toBe('Clicked 1 time');
    expect(messages.en.clicked(2)).toBe('Clicked 2 times');
    expect(messages.ru.clicked(1)).toBe('Нажато 1 раз');
    expect(messages.ru.clicked(3)).toBe('Нажато 3 раза');
    expect(messages.ru.clicked(5)).toBe('Нажато 5 раз');
    expect(messages.ru.clicked(21)).toBe('Нажато 21 раз');
    expect(messages.he.clicked(1)).toBe('נלחץ פעם אחת');
    expect(messages.he.clicked(2)).toBe('נלחץ פעמיים');
    expect(messages.he.clicked(5)).toBe('נלחץ 5 פעמים');
  });
});

describe('plural', () => {
  it('falls back to "other" when a form is missing', () => {
    expect(plural('ru', 3, { other: 'x' })).toBe('x');
  });
});
