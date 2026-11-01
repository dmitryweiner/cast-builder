import { plural } from './plural';

// English is the default locale and defines the shape of every message set.
// Plain string messages can be used in index.html via data-i18n / data-i18n-label.
export const en = {
  title: 'Web App Template',
  description: 'A starting point for small offline web apps.',
  heading: 'Web App Template',
  intro: 'Edit src/app.ts and start with a failing test.',
  languageLabel: 'Language',
  count: 'Count',
  reset: 'Reset',
  source: 'Source code',

  clicked: (n: number) => (n === 0 ? 'Not clicked yet' : `Clicked ${n} ${plural('en', n, { one: 'time', other: 'times' })}`),
};

export type Messages = typeof en;
