import { detectLocale, direction, isLocale, messages, staticText, type Locale, type Messages } from './i18n';
import { loadSettings, saveSettings, type KeyValueStorage, type Settings } from './storage';

export interface AppOptions {
  storage?: KeyValueStorage | null;
  /** Browser languages in preference order (`navigator.languages`). */
  languages?: readonly string[];
}

function required<T extends Element>(selector: string, type: abstract new () => T): T {
  const el = document.querySelector(selector);
  if (!(el instanceof type)) throw new Error(`index.html has no ${selector}`);
  return el;
}

/** Translates the static page: texts and labels marked in index.html, title, description, lang and dir. */
function translatePage(locale: Locale, t: Messages) {
  document.documentElement.lang = locale;
  document.documentElement.dir = direction(locale);
  document.title = t.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const text = staticText(t, el.dataset.i18n ?? '');
    if (text !== undefined) el.textContent = text;
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const text = staticText(t, el.dataset.i18nLabel ?? '');
    if (text !== undefined) el.setAttribute('aria-label', text);
  }
}

/** Starts the app on the current page; returns a function that removes its listeners. */
export function startApp({ storage = null, languages = [] }: AppOptions = {}): () => void {
  const localeSelect = required('#locale', HTMLSelectElement);
  const countButton = required('#count', HTMLButtonElement);
  const resetButton = required('#reset', HTMLButtonElement);
  const clicked = required('#clicked', HTMLOutputElement);

  let settings: Settings = loadSettings(storage);
  let locale: Locale = detectLocale(settings.locale, languages);

  const render = () => {
    const t = messages[locale];
    translatePage(locale, t);
    localeSelect.value = locale;
    clicked.textContent = t.clicked(settings.count);
    resetButton.disabled = settings.count === 0;
  };
  const update = (next: Settings) => {
    settings = next;
    saveSettings(storage, settings);
    render();
  };

  const onLocale = () => {
    const value = localeSelect.value;
    if (!isLocale(value)) return;
    locale = value;
    update({ ...settings, locale: value });
  };
  const onCount = () => update({ ...settings, count: settings.count + 1 });
  const onReset = () => update({ ...settings, count: 0 });

  localeSelect.addEventListener('change', onLocale);
  countButton.addEventListener('click', onCount);
  resetButton.addEventListener('click', onReset);
  render();

  return () => {
    localeSelect.removeEventListener('change', onLocale);
    countButton.removeEventListener('click', onCount);
    resetButton.removeEventListener('click', onReset);
  };
}
