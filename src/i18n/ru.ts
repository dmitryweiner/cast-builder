import type { Messages } from './en';
import { plural } from './plural';

export const ru: Messages = {
  title: 'Шаблон веб-приложения',
  description: 'Отправная точка для небольших офлайн-приложений.',
  heading: 'Шаблон веб-приложения',
  intro: 'Отредактируйте src/app.ts и начните с падающего теста.',
  languageLabel: 'Язык',
  count: 'Нажать',
  reset: 'Сбросить',
  source: 'Исходный код',

  clicked: (n: number) =>
    n === 0 ? 'Ещё не нажимали' : `Нажато ${n} ${plural('ru', n, { one: 'раз', few: 'раза', many: 'раз', other: 'раза' })}`,
};
