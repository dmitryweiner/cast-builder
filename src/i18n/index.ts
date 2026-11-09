import { format } from 'maker-kit/core/format';
import type { Params } from 'maker-kit/core/message';
import { en, type Key, type Messages } from './en';
import { ru } from './ru';
import type { Message } from '../geo/message';

export { format, placeholders } from 'maker-kit/core/format';
export type { Params } from 'maker-kit/core/message';
export type { Key, Messages };
export type Locale = 'en' | 'ru';

export const LOCALES: readonly Locale[] = ['en', 'ru'];
export const DEFAULT_LOCALE: Locale = 'en';
/** Language names for the switcher, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ru: 'Русский' };
/** Right-to-left locales: none yet, but `direction` is the one place to add them. */
const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>();

export const messages: Record<Locale, Messages> = { en, ru };

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** The saved locale, else the first supported browser language, else English. */
export function detectLocale(saved: unknown, languages: readonly string[]): Locale {
  if (isLocale(saved)) return saved;
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Text direction of the locale, for `<html dir>`. */
export function direction(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isKey(key: string): key is Key {
  return Object.hasOwn(en, key);
}

/** A plain message by key (as written in index.html), or undefined. */
export function staticText(dict: Messages, key: string): string | undefined {
  return isKey(key) ? dict[key] : undefined;
}

// The current locale lives here, not in each caller: controls, cards and the
// worker's messages keep keys and codes and are translated when drawn.
let current: Locale = DEFAULT_LOCALE;

export function setLocale(locale: Locale): void {
  current = locale;
}

export function currentLocale(): Locale {
  return current;
}

export function t(key: Key, params?: Params): string {
  return format(messages[current][key], params, current);
}

/** A message of the core: a code plus parameters. A code is a key by type. */
export function tm(message: Message): string {
  return t(message.code, message.params);
}

/** A key built on the fly (`part.<id>`); an unknown one is shown as it is. */
export function tDynamic(key: string, params?: Params): string {
  return isKey(key) ? t(key, params) : key;
}

/** First letter in lower case: "Half A" inside "Pour box: half A". */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase(current) + text.slice(1);
}
