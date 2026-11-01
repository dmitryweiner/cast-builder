// A progress bar over the canvas, for anything long. A preview of a small
// mold takes half a second, and flashing a bar for it is noise; on a slow
// machine (and on a phone, where the panel text is out of sight) the bar is
// the only sign the tab works. Hence the delay: only what is really long shows.

import type { JobProgress } from '../worker/protocol';
import type { Message } from '../geo/message';
import type { Key } from '../i18n';
import { t, tm } from '../i18n';

/** How long after a job's start the bar appears, if the job is still on. */
export const SHOW_DELAY_MS = 300;

export interface ProgressElements {
  wrap: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement;
}

export interface TrackOptions {
  /** the label until the job says something about itself */
  label: Key;
  /** 0 — show at once: an export was asked for by a button and is waited for */
  delayMs?: number;
}

/** The label is kept as a code and translated when shown: the language may change mid-job. */
interface Tracker {
  label: Key | Message;
  step: number | null;
  total: number | null;
  visible: boolean;
}

export interface ProgressHandle {
  /** Follows a job: when its promise settles (with null or an error too) the bar hides. */
  track<T>(job: (onProgress: (progress: JobProgress) => void) => Promise<T>, options: TrackOptions): Promise<T>;
  /** draw the label again — after a change of language */
  refresh(): void;
}

export function createProgress({ wrap, fill, label }: ProgressElements): ProgressHandle {
  const active: Tracker[] = [];

  function render(): void {
    const shown = active.findLast((tracker) => tracker.visible);
    if (!shown) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const indeterminate = shown.total === null || shown.step === null;
    wrap.classList.toggle('indeterminate', indeterminate);
    fill.style.inlineSize = indeterminate ? '' : `${Math.round(((shown.step ?? 0) / Math.max(1, shown.total ?? 1)) * 100)}%`;
    label.textContent = typeof shown.label === 'string' ? t(shown.label) : tm(shown.label);
  }

  return {
    async track(job, options) {
      const tracker: Tracker = { label: options.label, step: null, total: null, visible: false };
      active.push(tracker);
      const reveal = (): void => {
        tracker.visible = true;
        render();
      };
      const delay = options.delayMs ?? SHOW_DELAY_MS;
      const timer = delay > 0 ? setTimeout(reveal, delay) : null;
      if (!timer) reveal();
      try {
        return await job(({ step, total, label: text }) => {
          tracker.step = step;
          tracker.total = total;
          tracker.label = text;
          if (tracker.visible) render();
        });
      } finally {
        if (timer) clearTimeout(timer);
        active.splice(active.indexOf(tracker), 1);
        render();
      }
    },
    refresh: render,
  };
}
