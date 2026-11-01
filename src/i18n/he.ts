import type { Messages } from './en';
import { plural } from './plural';

export const he: Messages = {
  title: 'תבנית לאפליקציית רשת',
  description: 'נקודת התחלה לאפליקציות רשת קטנות שעובדות גם בלי חיבור.',
  heading: 'תבנית לאפליקציית רשת',
  intro: 'ערכו את src/app.ts והתחילו מבדיקה שנכשלת.',
  languageLabel: 'שפה',
  count: 'לחיצה',
  reset: 'איפוס',
  source: 'קוד מקור',

  clicked: (n: number) => (n === 0 ? 'עוד לא לחצו' : `נלחץ ${plural('he', n, { one: 'פעם אחת', two: 'פעמיים', other: `${n} פעמים` })}`),
};
