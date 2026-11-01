// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLocale, direction, format, isKey, isLocale, LOCALES, messages, placeholders, staticText } from './index';

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const keysIn = (attribute: string) => [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((m) => m[1] ?? '');

describe('detectLocale', () => {
  it('prefers the saved locale', () => {
    expect(detectLocale('ru', ['en-US'])).toBe('ru');
  });

  it('takes the first supported browser language', () => {
    expect(detectLocale(null, ['ru-RU', 'en'])).toBe('ru');
    expect(detectLocale(null, ['de-DE', 'ru'])).toBe('ru');
    expect(detectLocale(null, ['en-GB', 'ru'])).toBe('en');
    expect(detectLocale(null, ['RU'])).toBe('ru');
  });

  it('falls back to English', () => {
    expect(detectLocale(null, [])).toBe('en');
    expect(detectLocale(null, ['de-DE', 'fr'])).toBe('en');
    expect(detectLocale('xx', ['de'])).toBe('en');
  });
});

describe('locales', () => {
  it('are known and left-to-right', () => {
    expect(LOCALES.every(isLocale)).toBe(true);
    expect(isLocale('he')).toBe(false);
    for (const locale of LOCALES) expect(direction(locale)).toBe('ltr');
  });
});

describe('messages', () => {
  it('have the same keys in every locale', () => {
    const keys = Object.keys(messages.en).toSorted();
    for (const locale of LOCALES) expect(Object.keys(messages[locale]).toSorted()).toEqual(keys);
  });

  it('have the same parameters in every locale', () => {
    for (const key of Object.keys(messages.en)) {
      if (!isKey(key)) continue;
      for (const locale of LOCALES) {
        expect([...new Set(placeholders(messages[locale][key]))], `${locale}: ${key}`).toEqual([
          ...new Set(placeholders(messages.en[key])),
        ]);
      }
    }
  });

  it.each(LOCALES)('cover every text in index.html (%s)', (locale) => {
    const keys = [...keysIn('data-i18n'), ...keysIn('data-i18n-label'), ...keysIn('data-i18n-title')];
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect({ key, text: staticText(messages[locale], key) }).toEqual({ key, text: expect.any(String) });
  });

  it('match the English defaults in index.html', () => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.title).toBe(messages.en.title);
    for (const node of doc.querySelectorAll<HTMLElement>('[data-i18n]')) {
      // Prettier may wrap long texts in index.html.
      expect(node.textContent.replace(/\s+/g, ' ').trim()).toBe(staticText(messages.en, node.dataset.i18n ?? ''));
    }
  });

  it('do not have static texts for unknown keys', () => {
    expect(staticText(messages.en, 'missing')).toBeUndefined();
  });
});

describe('format', () => {
  it('fills parameters and picks plural forms by the locale', () => {
    expect(format(messages.en['audit.parts'], { n: 1, k: 5 }, 'en')).toBe('1 part, 5k triangles');
    expect(format(messages.en['audit.parts'], { n: 3, k: 5 }, 'en')).toBe('3 parts, 5k triangles');
    expect(format(messages.ru['audit.parts'], { n: 1, k: 5 }, 'ru')).toBe('1 деталь, 5 тыс. треугольников');
    expect(format(messages.ru['audit.parts'], { n: 3, k: 5 }, 'ru')).toBe('3 детали, 5 тыс. треугольников');
    expect(format(messages.ru['audit.parts'], { n: 5, k: 5 }, 'ru')).toBe('5 деталей, 5 тыс. треугольников');
  });

  it('leaves an unknown parameter as it is', () => {
    expect(format('a {b} c', {}, 'en')).toBe('a {b} c');
  });
});

describe('the source', () => {
  // Every visible text goes through the dictionaries: Cyrillic in a string
  // literal anywhere but ru.ts is a caption that bypassed them.
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
    );

  it('has no Cyrillic outside ru.ts and the language names', () => {
    const offenders = files(resolve(__dirname, '..'))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('ru.ts') && !file.endsWith('.test.ts'))
      .filter((file) => {
        const text = readFileSync(file, 'utf8').replace("'Русский'", '');
        return /[а-яё]/i.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
