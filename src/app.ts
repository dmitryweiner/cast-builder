// DOM wiring: a model in, the user's choices, the preview from the worker,
// the download.
//
// The main thread only reads the STL, turns it and shows it. Everything
// that builds tooling goes to the worker (`ToolingClient`): the master and
// the pour boxes need boolean operations on the WASM module, which the main
// thread never loads, and the slump mold of a large model is long enough to
// freeze a tab. The preview waits for a pause in the edits.

import type { IndexedMesh } from './geo/stl';
import { encodeSTL, parseSTL } from './geo/stl';
import { flip, placeModel, quarterTurn, sizeOf } from './geo/model';
import { meshNormals } from './geo/normals';
import type { SurfaceMesh } from './geo/surface';
import { mergeMeshes } from './geo/surface';
import type { Arranged } from './geo/layout';
import { arrangeOnBed } from './geo/layout';
import {
  BATH_WALL_MAX_MM,
  BATH_WALL_MIN_MM,
  CLEAR_MAX_MM,
  CLEAR_MIN_MM,
  EAR_MAX_MM,
  EAR_MIN_MM,
  KEY_MAX_MM,
  PLASTER_MAX_MM,
  PLASTER_MIN_MM,
  SHRINK_MAX_PCT,
  SLAB_MAX_MM,
  SLAB_MIN_MM,
  SPARE_MAX_MM,
  VENT_MAX_MM,
  VENT_MIN_MM,
} from './geo/mold/state';
import type { Key, Locale } from './i18n';
import { detectLocale, direction, isLocale, lowerFirst, messages, setLocale, staticText, t, tDynamic, tm } from './i18n';
import type { Mode, Settings, Setup } from './state';
import { defaultSetup, MODES, RECESS_MAX_MM, resetSettings, RESOLUTIONS, sanitizeSettings, sanitizeSetup, SCHEME_CHOICES } from './state';
import type { KeyValueStorage, StorageWrite } from './storage';
import { loadProject, loadSavedModel, saveModel, saveProject } from './storage';
import type { Control } from './ui/controls';
import { screwControls, screwParams, stopParams } from './ui/screws';
import { bedControls, inOneFile } from './ui/bed';
import { renderControls, setupAdjustmentButtons } from './ui/controls';
import { el, make } from './ui/dom';
import { createProgress } from './ui/progress';
import { createScene } from './render/scene';
import type { SceneHandle } from './render/scene';
import { createThumb } from './render/thumb';
import { setupSheet } from './ui/sheet';
import { ToolingClient } from './worker/client';
import type { JobInfo, JobPart, ToolingJob } from './worker/protocol';

export interface AppOptions {
  storage?: KeyValueStorage | null;
  /** browser languages in preference order (`navigator.languages`) */
  languages?: readonly string[];
}

/** The worker builds after this much quiet: tooling costs hundreds of milliseconds. */
const PREVIEW_DELAY_MS = 400;
/** A browser swallows a burst of downloads — they go one by one. */
const DOWNLOAD_GAP_MS = 250;
const EXAMPLE_URL = './examples/teapot.stl';

/** The tabs: the press molds share one, with a switch of their kind inside. */
const TABS = [
  { id: 'tabMaster', mode: (): Mode => 'master' },
  { id: 'tabBath', mode: (): Mode => 'bath' },
  { id: 'tabSlump', mode: (s: Settings): Mode => s.press },
] as const;
const EXPORT_LABEL: Record<Mode, Key> = {
  master: 'export.master',
  bath: 'export.bath',
  slump: 'export.slump',
  tile: 'export.slump',
  split: 'export.slump',
};

interface Model {
  /** file name without the extension: the downloads are named after it */
  name: string;
  raw: IndexedMesh;
  placed: IndexedMesh;
  heightMm: number;
  radiusMm: number;
}

/** Translates the static page: texts, labels and titles marked in index.html, the title, lang and dir. */
function translatePage(locale: Locale): void {
  const dict = messages[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = direction(locale);
  document.title = dict.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', dict.description);
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const text = staticText(dict, node.dataset.i18n ?? '');
    if (text !== undefined) node.textContent = text;
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const text = staticText(dict, node.dataset.i18nLabel ?? '');
    if (text !== undefined) node.setAttribute('aria-label', text);
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const text = staticText(dict, node.dataset.i18nTitle ?? '');
    if (text !== undefined) node.title = text;
  }
}

/** The name of a tooling part by its `id`: `bath-…` is the pour box for a part, the rest the part itself. */
export function partLabel(id: string): string {
  if (id.startsWith('bath-')) return t('part.bath', { part: lowerFirst(partLabel(id.slice(5))) });
  if (id === 'screws') return t('part.screws', screwParams);
  if (id === 'stops') return t('part.stops', stopParams);
  return tDynamic(`part.${id}`);
}

type MoldState = Settings['mold'];
/** The fields of the mold's parameters that are numbers — the sliders'. */
type MoldNumber = { [K in keyof MoldState]: MoldState[K] extends number ? K : never }[keyof MoldState];

/** A slider over one field of the mold's parameters, shown in the given modes. */
function range(
  key: string,
  label: Key,
  hint: Key,
  min: number,
  max: number,
  step: number,
  field: MoldNumber,
  modes: readonly Mode[],
): Control<Settings> {
  return {
    kind: 'range',
    key,
    label,
    hint,
    min,
    max,
    step,
    when: (s) => modes.includes(s.mode),
    get: (s) => s.mold[field],
    set: (s, value) => ({ ...s, mold: { ...s.mold, [field]: value } }),
  };
}

export function startApp({ storage = null, languages = [] }: AppOptions = {}): void {
  const stage = el('stage', HTMLElement);
  const panel = el('panel', HTMLElement);
  const emptyEl = el('empty', HTMLDivElement);
  const stageNote = el('stageNote', HTMLParagraphElement);
  const thumbBox = el('thumbBox', HTMLDivElement);
  const fileInput = el('fileInput', HTMLInputElement);
  const localeSelect = el('locale', HTMLSelectElement);
  const modelInfo = el('modelInfo', HTMLParagraphElement);
  const modelNote = el('modelNote', HTMLParagraphElement);
  const modelControls = el('modelControls', HTMLDivElement);
  const toolingControls = el('toolingControls', HTMLDivElement);
  const mouthCard = el('mouthCard', HTMLElement);
  const mouthControls = el('mouthControls', HTMLDivElement);
  const mouthNote = el('mouthNote', HTMLParagraphElement);
  const bedCard = el('bedCard', HTMLElement);
  const bedControlsEl = el('bedControls', HTMLDivElement);
  const bedNote = el('bedNote', HTMLParagraphElement);
  const schemeNote = el('schemeNote', HTMLParagraphElement);
  const partList = el('partList', HTMLUListElement);
  const warningsEl = el('warnings', HTMLParagraphElement);
  const blockersEl = el('blockers', HTMLParagraphElement);
  const auditEl = el('audit', HTMLParagraphElement);
  const exportBtn = el('exportBtn', HTMLButtonElement);
  const turnButtons = ['turnX', 'turnY', 'turnFlip'].map((id) => el(id, HTMLButtonElement));
  const resetBtn = el('turnReset', HTMLButtonElement);
  const progress = createProgress({
    wrap: el('progressWrap', HTMLDivElement),
    fill: el('progressFill', HTMLDivElement),
    label: el('progressLabel', HTMLSpanElement),
  });

  const view = el('view', HTMLCanvasElement);
  const scene: SceneHandle = createScene(view);
  const thumb = createThumb(el('thumb', HTMLCanvasElement), {
    x: el('axisX', HTMLSpanElement),
    y: el('axisY', HTMLSpanElement),
    z: el('axisZ', HTMLSpanElement),
  });
  const client = new ToolingClient();
  const narrow = window.matchMedia('(max-width: 760px)');
  // on a phone with no model the sheet would cover the invitation; a model opens it
  const sheet = setupSheet({
    panel,
    button: el('panelBtn', HTMLButtonElement),
    view,
    narrow,
    onInset: (px) => scene.setBottomInset(px),
    open: !narrow.matches,
  });
  // the sheet's height follows the window
  window.addEventListener('resize', () => sheet.refresh());

  // the project of the last visit: the settings now, the setup with its model at the end
  const saved = loadProject(storage);
  let settings: Settings = saved.settings;
  let locale: Locale = detectLocale(settings.locale, languages);
  setLocale(locale);
  let setup: Setup = defaultSetup();
  let model: Model | null = null;
  /** how the model in hand was kept: 'full' — too large, it is gone after a reload */
  let modelKept: StorageWrite = 'ok';
  /** what the last finished build said; the panel is drawn from it */
  let last: { parts: JobPart[]; info: JobInfo } | null = null;
  /** its parts as they lie on the bed — in the view and, in one file, in the STL */
  let laid: Arranged | null = null;
  /** grows on each request: a late answer to an old one must not overwrite a fresh one */
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let exporting = false;
  let readError = '';

  // ---- controls ----

  const toolingSpec: Control<Settings>[] = [
    range('shrink', 'ctl.shrink', 'ctl.shrink.hint', 0, SHRINK_MAX_PCT, 0.5, 'shrinkPct', MODES),
    range('spare', 'ctl.spare', 'ctl.spare.hint', 0, SPARE_MAX_MM, 1, 'spareMm', ['master', 'bath']),
    range('plaster', 'ctl.plaster', 'ctl.plaster.hint', PLASTER_MIN_MM, PLASTER_MAX_MM, 1, 'plasterMm', ['bath']),
    range('key', 'ctl.key', 'ctl.key.hint', 0, KEY_MAX_MM, 0.5, 'keyMm', ['bath']),
    range('silicone', 'ctl.silicone', 'ctl.silicone.hint', CLEAR_MIN_MM, CLEAR_MAX_MM, 1, 'bathClearMm', ['bath']),
    range('bathWall', 'ctl.wall', 'ctl.bathWall.hint', BATH_WALL_MIN_MM, BATH_WALL_MAX_MM, 0.2, 'bathWallMm', ['bath']),
    range('slumpWall', 'ctl.wall', 'ctl.slumpWall.hint', BATH_WALL_MIN_MM, BATH_WALL_MAX_MM, 0.2, 'bathWallMm', ['slump']),
    range('slab', 'ctl.slab', 'ctl.slab.hint', SLAB_MIN_MM, Math.min(SLAB_MAX_MM, 20), 0.1, 'slabMm', ['slump']),
    range('ear', 'ctl.ear', 'ctl.ear.hint', EAR_MIN_MM, EAR_MAX_MM, 0.5, 'earMm', ['slump']),
    range('round', 'ctl.round', 'ctl.round.hint', 0, 100, 5, 'punchRoundPct', ['slump']),
    range('vent', 'ctl.vent', 'ctl.vent.hint', VENT_MIN_MM, VENT_MAX_MM, 0.5, 'ventMm', ['slump']),
    ...screwControls,
    {
      kind: 'select',
      key: 'resolution',
      label: 'ctl.resolution',
      hint: 'ctl.resolution.hint',
      options: RESOLUTIONS.map((value) => ({ value: String(value), label: 'size.box' })),
      when: (s) => s.mode === 'slump',
      get: (s) => String(s.resolution),
      set: (s, value) => ({ ...s, resolution: Number(value) }),
    },
  ];
  const schemeSpec: Control<Settings>[] = [
    {
      kind: 'select',
      key: 'scheme',
      label: 'scheme',
      hint: 'scheme.hint',
      options: SCHEME_CHOICES.map((value) => ({ value, label: `scheme.${value}` })),
      when: (s) => s.mode !== 'slump',
      get: (s) => s.scheme,
      set: (s, value) => ({ ...s, scheme: SCHEME_CHOICES.find((choice) => choice === value) ?? 'auto' }),
    },
  ];
  const heightLimit = (): number => Math.max(1, Math.round(model?.heightMm ?? 100));
  const radiusLimit = (): number => Math.max(2, Math.round(model?.radiusMm ?? 100));
  const mouthSpec: Control<Setup>[] = [
    {
      kind: 'check',
      key: 'auto',
      label: 'mouth.auto',
      hint: 'mouth.auto.hint',
      get: (s) => s.mouth.auto,
      // the numbers start from what was found, not from zero
      set: (s, auto) => ({
        ...s,
        mouth:
          auto || !last?.info.mouth
            ? { ...s.mouth, auto }
            : { auto, zMm: round1(last.info.mouth.zMm), radiusMm: round1(last.info.mouth.radiusMm) },
      }),
    },
    {
      kind: 'range',
      key: 'z',
      label: 'mouth.z',
      hint: 'mouth.z.hint',
      min: 0,
      max: heightLimit,
      step: 0.5,
      when: (s) => !s.mouth.auto,
      get: (s) => s.mouth.zMm,
      set: (s, zMm) => ({ ...s, mouth: { ...s.mouth, zMm } }),
    },
    {
      kind: 'range',
      key: 'r',
      label: 'mouth.r',
      hint: 'mouth.r.hint',
      min: 1,
      max: radiusLimit,
      step: 0.5,
      when: (s) => !s.mouth.auto,
      get: (s) => s.mouth.radiusMm,
      set: (s, radiusMm) => ({ ...s, mouth: { ...s.mouth, radiusMm } }),
    },
    {
      kind: 'check',
      key: 'on',
      label: 'plug.on',
      hint: 'plug.on.hint',
      get: (s) => s.plug.on,
      set: (s, on) => ({ ...s, plug: { ...s.plug, on, galleryMm: s.plug.galleryMm || defaultGallery() } }),
    },
    {
      kind: 'range',
      key: 'recess',
      label: 'plug.recess',
      hint: 'plug.recess.hint',
      min: 0,
      max: RECESS_MAX_MM,
      step: 0.5,
      when: (s) => s.plug.on,
      get: (s) => s.plug.recessMm,
      set: (s, recessMm) => ({ ...s, plug: { ...s.plug, recessMm } }),
    },
    {
      kind: 'range',
      key: 'gallery',
      label: 'plug.gallery',
      hint: 'plug.gallery.hint',
      min: 1,
      max: radiusLimit,
      step: 0.5,
      when: (s) => s.plug.on,
      get: (s) => s.plug.galleryMm,
      set: (s, galleryMm) => ({ ...s, plug: { ...s.plug, galleryMm } }),
    },
  ];
  const modelSpec: Control<Setup>[] = [
    {
      kind: 'range',
      key: 'spin',
      label: 'ctl.spin',
      hint: 'ctl.spin.hint',
      min: 0,
      max: 355,
      step: 5,
      presets: [0, 90, 180, 270],
      get: (s) => s.orientation.spinDeg,
      set: (s, spinDeg) => ({ ...s, orientation: { ...s.orientation, spinDeg } }),
    },
  ];

  /** Between the gate and the rim: where a gallery over a ledge usually is. */
  function defaultGallery(): number {
    const info = last?.info;
    if (!info?.mouth || info.rimMm === null) return 0;
    return round1((info.mouth.radiusMm + info.rimMm) / 2);
  }

  let rows: { sync(): void }[] = [];

  /** The panel drawn anew — at the start and on every change of language. */
  function renderPanel(): void {
    const toolingRows = renderControls(toolingControls, toolingSpec, () => settings, setSettings, 'mold');
    const mouthHost = make('div');
    const schemeHost = make('div');
    mouthControls.textContent = '';
    mouthControls.append(mouthHost, schemeHost);
    const mouthRows = renderControls(mouthHost, mouthSpec, () => setup, setSetup, 'mouth');
    const schemeRows = renderControls(schemeHost, schemeSpec, () => settings, setSettings, 'mold');
    const modelRows = renderControls(modelControls, modelSpec, () => setup, setSetup, 'model');
    const bedRows = renderControls(bedControlsEl, bedControls, () => settings, setBed, 'bed');
    // the resolution options read as "128 × 128", not as a translated label
    for (const option of document.querySelectorAll<HTMLOptionElement>('#mold_resolution option')) {
      option.textContent = `${option.value} × ${option.value}`;
    }
    rows = [
      { sync: () => toolingRows.sync(settings) },
      { sync: () => schemeRows.sync(settings) },
      { sync: () => mouthRows.sync(setup) },
      { sync: () => modelRows.sync(setup) },
      { sync: () => bedRows.sync(settings) },
    ];
  }

  function syncPanel(): void {
    for (const row of rows) row.sync();
    for (const tab of TABS) el(tab.id, HTMLButtonElement).setAttribute('aria-selected', String(tab.mode(settings) === settings.mode));
    mouthCard.hidden = settings.mode === 'slump';
    // a master is one part: nothing to lay out
    bedCard.hidden = settings.mode === 'master';
    emptyEl.hidden = model !== null;
    for (const button of turnButtons) button.disabled = model === null;
    modelNote.hidden = model === null || modelKept !== 'full';
    localeSelect.value = locale;
    if (!exporting) exportBtn.textContent = t(EXPORT_LABEL[settings.mode]);
    modelInfo.textContent = model
      ? t('model.info', {
          name: model.name,
          dims: sizeOf(model.placed.positions)
            .map((value) => Math.round(value))
            .join('×'),
          k: Math.round(model.raw.indices.length / 3000),
        })
      : readError;
    renderResult();
  }

  /** The panel's part of the last build: the parts, the reasons, the warnings. */
  function renderResult(): void {
    partList.textContent = '';
    if (!model) {
      for (const node of [schemeNote, warningsEl, blockersEl, mouthNote, stageNote, bedNote]) node.textContent = '';
      auditEl.textContent = t('audit.none');
      exportBtn.disabled = true;
      return;
    }
    if (!last) return;
    const { parts, info } = last;
    for (const part of parts) {
      const item = make('li');
      item.append(
        make('span', undefined, partLabel(part.id)),
        make('span', undefined, part.note ? t('size.box', { dims: part.note }) : ''),
      );
      partList.append(item);
    }
    schemeNote.textContent = settings.mode === 'slump' ? t('slump.note') : info.reason.map(tm).join(' ');
    warningsEl.textContent = info.warnings.map(tm).join('\n');
    blockersEl.textContent = [...info.blocking, ...parts.flatMap((part) => part.blocking)].map(tm).join('\n');
    // the view is empty then, and on a phone the panel may be out of sight
    stageNote.textContent = parts.length === 0 ? blockersEl.textContent : '';
    const mouth = setup.mouth.auto ? info.mouth : setup.mouth;
    mouthNote.textContent = mouth ? t('mouth.note', { z: mouth.zMm.toFixed(1), d: (mouth.radiusMm * 2).toFixed(1) }) : '';
    bedNote.textContent =
      laid && inOneFile(settings) ? t('bed.footprint', { w: Math.round(laid.widthMm), d: Math.round(laid.depthMm) }) : '';
    const triangles = parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
    auditEl.textContent = parts.length > 0 ? t('audit.parts', { n: parts.length, k: Math.round(triangles / 1000) }) : '';
    exportBtn.disabled = exporting || parts.length === 0 || info.blocking.length > 0;
  }

  // ---- state changes ----

  /** Everything but the model itself, on every change: a reload opens the project as it was. */
  function save(): void {
    saveProject(storage, { settings, setup });
  }

  function setSettings(next: Settings): void {
    settings = sanitizeSettings(next);
    save();
    syncPanel();
    schedule();
  }

  /** The layout is the main thread's: a change of it lays the last build out anew, with no new build. */
  function setBed(next: Settings): void {
    settings = sanitizeSettings(next);
    save();
    if (last) show(last.parts);
    syncPanel();
  }

  /** The parts on the bed, in the view. */
  function show(parts: readonly JobPart[]): void {
    laid = parts.length > 0 ? layOut(parts) : null;
    if (laid) scene.setMeshes(laid.groups.flat());
  }

  function layOut(parts: readonly JobPart[]): Arranged {
    return arrangeOnBed(
      parts.map((part) => [toMesh(part)]),
      settings.bed.place,
      settings.bed.gapMm,
    );
  }

  function setSetup(next: Setup): void {
    const turned = next.orientation !== setup.orientation;
    setup = sanitizeSetup(next);
    save();
    if (turned && model) {
      place(model);
      last = null;
    }
    syncPanel();
    schedule();
  }

  function place(current: Model): void {
    current.placed = placeModel(current.raw, setup.orientation);
    const [width, depth, height] = sizeOf(current.placed.positions);
    current.heightMm = height;
    current.radiusMm = Math.hypot(width, depth) / 2;
    thumbBox.hidden = false;
    thumb.show(withNormals(current.placed));
  }

  function loadModel(name: string, data: ArrayBuffer): void {
    let raw: IndexedMesh;
    try {
      raw = parseSTL(data);
    } catch (error) {
      readError = t('error.read', { error: message(error) });
      syncPanel();
      return;
    }
    const stem = name.replace(/\.stl$/i, '');
    modelKept = saveModel(storage, { name: stem, mesh: raw });
    openModel(stem, raw, defaultSetup());
    save();
  }

  /** A model in hand, read from a file or kept by the last visit, with its setup. */
  function openModel(name: string, raw: IndexedMesh, start: Setup): void {
    readError = '';
    setup = start;
    model = { name, raw, placed: raw, heightMm: 0, radiusMm: 0 };
    last = null;
    // the view shows tooling only: the old model's goes, the new one's is on its way
    scene.setMeshes([]);
    stageNote.textContent = '';
    // the thumbnail and the turns are what to look at first
    sheet.open();
    place(model);
    syncPanel();
    schedule(0);
  }

  // ---- the worker ----

  function job(kind: ToolingJob['kind'], current: Model): ToolingJob {
    return {
      kind,
      model: current.placed,
      mode: settings.mode,
      mold: settings.mold,
      scheme: settings.scheme,
      resolution: settings.resolution,
      mouth: setup.mouth,
      plug: setup.plug,
    };
  }

  function schedule(delay = PREVIEW_DELAY_MS): void {
    if (timer) clearTimeout(timer);
    generation++;
    if (!model) return;
    timer = setTimeout(() => void preview(generation), delay);
  }

  async function preview(stamp: number): Promise<void> {
    const current = model;
    if (!current) return;
    try {
      const result = await progress.track(
        (onProgress) =>
          client.run(job('preview', current), (step) => {
            onProgress(step);
            if (stamp === generation) auditEl.textContent = t('audit.step', { step: tm(step.label), i: step.step + 1, n: step.total });
          }),
        { label: 'progress.preview' },
      );
      // null — a fresher job replaced it; stamp — a fresher answer is coming
      if (!result || stamp !== generation) return;
      last = result;
      show(result.parts);
      renderResult();
    } catch (error) {
      if (stamp !== generation) return;
      last = null;
      partList.textContent = '';
      auditEl.textContent = '';
      blockersEl.textContent = t('error.build', { error: message(error) });
      stageNote.textContent = blockersEl.textContent;
      exportBtn.disabled = true;
    }
  }

  async function runExport(): Promise<void> {
    const current = model;
    if (!current || exporting) return;
    exporting = true;
    exportBtn.disabled = true;
    exportBtn.textContent = t('export.busy');
    const { mode } = settings;
    const oneFile = inOneFile(settings);
    try {
      const result = await progress.track((onProgress) => client.run(job('export', current), onProgress), {
        label: 'progress.export',
        delayMs: 0,
      });
      if (!result) return;
      const blocking = [...result.info.blocking, ...result.parts.flatMap((part) => part.blocking)];
      if (blocking.length > 0) {
        blockersEl.textContent = blocking.map(tm).join('\n');
        return;
      }
      if (oneFile) {
        download(encodeSTL(mergeMeshes(layOut(result.parts).groups.flat()), { name: mode }), `${current.name}-${mode}.stl`);
        return;
      }
      for (const part of result.parts) {
        download(encodeSTL(part, { name: part.id }), `${current.name}-${part.id}.stl`);
        // oxlint-disable-next-line no-await-in-loop -- one by one on purpose: a browser swallows a burst of downloads
        await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_GAP_MS));
      }
    } catch (error) {
      blockersEl.textContent = t('error.export', { error: message(error) });
    } finally {
      exporting = false;
      exportBtn.textContent = t(EXPORT_LABEL[settings.mode]);
      exportBtn.disabled = false;
    }
  }

  // ---- events ----

  for (const tab of TABS) {
    el(tab.id, HTMLButtonElement).addEventListener('click', () => {
      const mode = tab.mode(settings);
      if (mode === settings.mode) return;
      last = null;
      setSettings({ ...settings, mode });
    });
  }
  const turn = (next: readonly number[]): void => setSetup({ ...setup, orientation: { ...setup.orientation, turn: next } });
  turnButtons[0].addEventListener('click', () => turn(quarterTurn(setup.orientation.turn, 'x')));
  turnButtons[1].addEventListener('click', () => turn(quarterTurn(setup.orientation.turn, 'y')));
  turnButtons[2].addEventListener('click', () => turn(flip(setup.orientation.turn)));
  // everything back to the defaults but the model, the language and the mode tab
  resetBtn.addEventListener('click', () => {
    settings = resetSettings(settings);
    last = null;
    setSetup(defaultSetup());
  });

  const openFile = (file: File | undefined): void => {
    if (!file) return;
    file.arrayBuffer().then(
      (data) => loadModel(file.name, data),
      (error: unknown) => {
        readError = t('error.read', { error: message(error) });
        syncPanel();
      },
    );
  };
  el('openBtn', HTMLButtonElement).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    openFile(fileInput.files?.[0]);
    fileInput.value = '';
  });
  el('exampleBtn', HTMLButtonElement).addEventListener('click', () => {
    fetch(EXAMPLE_URL)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then(
        (data) => loadModel('teapot.stl', data),
        (error: unknown) => {
          readError = t('error.read', { error: message(error) });
          syncPanel();
        },
      );
  });
  stage.addEventListener('dragover', (event) => {
    event.preventDefault();
    stage.classList.add('dragging');
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    stage.classList.remove('dragging');
    openFile(event.dataTransfer?.files[0]);
  });
  exportBtn.addEventListener('click', () => void runExport());
  localeSelect.addEventListener('change', () => {
    const value = localeSelect.value;
    if (!isLocale(value)) return;
    locale = value;
    setLocale(value);
    settings = { ...settings, locale: value };
    save();
    translatePage(locale);
    renderPanel();
    progress.refresh();
    syncPanel();
  });

  setupAdjustmentButtons(panel);
  translatePage(locale);
  renderPanel();
  syncPanel();
  const kept = loadSavedModel(storage);
  if (kept) openModel(kept.name, kept.mesh, saved.setup);
}

function withNormals(mesh: IndexedMesh): SurfaceMesh {
  return { ...mesh, normals: meshNormals(mesh.positions, mesh.indices) };
}

/** A part's mesh from the worker's answer — the buffers came by transfer, no copies. */
function toMesh(part: JobPart): SurfaceMesh {
  return { positions: part.positions, indices: part.indices, normals: part.normals };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function download(data: BlobPart, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'model/stl' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
