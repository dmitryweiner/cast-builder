// DOM wiring: a model in, the user's choices, the preview from the worker,
// the download.
//
// The main thread only reads the STL, turns it and shows it. Everything
// that builds tooling goes to the worker (`ToolingClient`): the master and
// the pour boxes need boolean operations on the WASM module, which the main
// thread never loads, and the slump mold of a large model is long enough to
// freeze a tab. The preview waits for a pause in the edits.

import type { IndexedMesh } from 'maker-kit/3d/mesh';
import { encodeSTL, parseSTL } from 'maker-kit/3d/stl';
import { flip, placeModel, quarterTurn, sizeOf } from './geo/model';
import { meshNormals } from 'maker-kit/3d/mesh';
import type { SurfaceMesh } from 'maker-kit/3d/mesh';
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
import { detectLocale, direction, isKey, LOCALES, lowerFirst, messages, setLocale, staticText, t, tDynamic, tm } from './i18n';
import type { Mode, Project, Settings, Setup } from './state';
import {
  defaultSetup,
  ModelRef,
  MODES,
  RECESS_MAX_MM,
  resetSettings,
  RESOLUTIONS,
  sanitizeSettings,
  sanitizeSetup,
  SCHEME_CHOICES,
} from './state';
import type { KeyValueStorage, StorageWrite } from './storage';
import { loadProject, loadSavedModel, removeModel, saveModel, saveProject } from './storage';
import { renderBanner } from 'maker-kit/ui/banner';
import type { Control } from 'maker-kit/ui/controls';
import { renderControls } from 'maker-kit/ui/controls';
import { el, make } from 'maker-kit/ui/dom';
import { History } from 'maker-kit/core/history';
import type { JobProgress } from 'maker-kit/core/progress';
import { bindHistory } from 'maker-kit/ui/historyKeys';
import { createLanguagePicker } from 'maker-kit/ui/languagePicker';
import { renderMessages } from 'maker-kit/ui/messageList';
import { createProgress } from 'maker-kit/ui/progress';
import { setupSheet } from 'maker-kit/ui/sheet';
import { screwControls, screwParams, stopParams } from './ui/screws';
import { bedControls, inOneFile } from './ui/bed';
import { messageLines } from './ui/messages';
import { allowedCatch, catchNote, pressKind, splitControls, splitLand, tileCutControls, tileLand } from './ui/press';
import { createViewer } from 'maker-kit/3d/viewer';
import { toolingMaterial } from './render/look';
import { createThumb } from './render/thumb';
import { createToolingClient } from './worker/client';
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
/** the smallest bed the view draws under the tooling, mm */
const PRINT_BED_MM = 200;

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
  tile: 'export.tile',
  split: 'export.split',
};
/** What the result card says first: the mold modes give their parting's reason. */
const NOTE: Partial<Record<Mode, Key>> = { slump: 'slump.note', tile: 'tile.note', split: 'split.note' };

/** The model in hand as it is shown: the history's reference, turned and placed. */
interface Model {
  ref: ModelRef;
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
): Control<Settings, Key> {
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
  const modelInfo = el('modelInfo', HTMLParagraphElement);
  const modelNote = el('modelNote', HTMLParagraphElement);
  const storageBanner = el('storageBanner', HTMLDivElement);
  const modelControls = el('modelControls', HTMLDivElement);
  const toolingControls = el('toolingControls', HTMLDivElement);
  const splitCard = el('splitCard', HTMLDivElement);
  const splitControlsEl = el('splitControls', HTMLDivElement);
  const findBtn = el('findBtn', HTMLButtonElement);
  const findNote = el('findNote', HTMLParagraphElement);
  const mouthCard = el('mouthCard', HTMLElement);
  const mouthControls = el('mouthControls', HTMLDivElement);
  const mouthNote = el('mouthNote', HTMLParagraphElement);
  const bedCard = el('bedCard', HTMLElement);
  const bedControlsEl = el('bedControls', HTMLDivElement);
  const bedNote = el('bedNote', HTMLParagraphElement);
  const schemeNote = el('schemeNote', HTMLParagraphElement);
  const partList = el('partList', HTMLUListElement);
  const messageList = el('messages', HTMLUListElement);
  const auditEl = el('audit', HTMLParagraphElement);
  const exportBtn = el('exportBtn', HTMLButtonElement);
  const turnButtons = ['turnX', 'turnY', 'turnFlip'].map((id) => el(id, HTMLButtonElement));
  const resetBtn = el('turnReset', HTMLButtonElement);
  const newBtn = el('newProject', HTMLButtonElement);
  const progress = createProgress(el('progressWrap', HTMLDivElement), { t });

  const view = el('view', HTMLCanvasElement);
  // null without WebGL: the panel and the downloads work on without the view
  const viewer = createViewer(view);
  // no bed is drawn smaller than a small printer's
  viewer?.fitBed(PRINT_BED_MM, PRINT_BED_MM);
  const tooling = toolingMaterial();
  const thumb = createThumb(el('thumb', HTMLCanvasElement), {
    x: el('axisX', HTMLSpanElement),
    y: el('axisY', HTMLSpanElement),
    z: el('axisZ', HTMLSpanElement),
  });
  const client = createToolingClient();
  // the width where kit.css puts the panel beside the view
  const narrow = window.matchMedia('(max-width: 1023px)');
  // on a phone with no model the sheet would cover the invitation; a model opens it
  const sheet = setupSheet({
    panel,
    button: el('panelBtn', HTMLButtonElement),
    close: el('sheetClose', HTMLButtonElement),
    view,
    narrow,
    onInset: (px) => viewer?.setInset(px),
    open: !narrow.matches,
  });
  // the sheet's height follows the window
  window.addEventListener('resize', () => sheet.refresh());

  // the project of the last visit: the settings now, the setup with its model at the end
  const saved = loadProject(storage);
  let settings: Settings = saved.settings;
  /** the language picked in the switcher; null — from the browser */
  let chosenLocale: Locale | null = saved.locale;
  let locale: Locale = detectLocale(chosenLocale, languages);
  setLocale(locale);
  let setup: Setup = defaultSetup();
  /** undo and redo over the settings, the setup and the model, held by reference */
  const history = new History<Project>({ settings, setup, model: null });
  let model: Model | null = null;
  /** models opened in this session, for their ids */
  let opened = 0;
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
  let finding = false;
  let readError = '';

  // ---- controls ----

  const toolingSpec: Control<Settings, Key>[] = [
    pressKind,
    range('shrink', 'ctl.shrink', 'ctl.shrink.hint', 0, SHRINK_MAX_PCT, 0.5, 'shrinkPct', MODES),
    range('spare', 'ctl.spare', 'ctl.spare.hint', 0, SPARE_MAX_MM, 1, 'spareMm', ['master', 'bath']),
    range('plaster', 'ctl.plaster', 'ctl.plaster.hint', PLASTER_MIN_MM, PLASTER_MAX_MM, 1, 'plasterMm', ['bath']),
    range('key', 'ctl.key', 'ctl.key.hint', 0, KEY_MAX_MM, 0.5, 'keyMm', ['bath']),
    range('silicone', 'ctl.silicone', 'ctl.silicone.hint', CLEAR_MIN_MM, CLEAR_MAX_MM, 1, 'bathClearMm', ['bath']),
    range('bathWall', 'ctl.wall', 'ctl.bathWall.hint', BATH_WALL_MIN_MM, BATH_WALL_MAX_MM, 0.2, 'bathWallMm', ['bath']),
    range('slumpWall', 'ctl.wall', 'ctl.slumpWall.hint', BATH_WALL_MIN_MM, BATH_WALL_MAX_MM, 0.2, 'bathWallMm', ['slump']),
    range('tileWall', 'ctl.wall', 'ctl.tileWall.hint', BATH_WALL_MIN_MM, BATH_WALL_MAX_MM, 0.2, 'bathWallMm', ['tile']),
    tileLand,
    ...tileCutControls,
    range('splitWall', 'ctl.wall', 'ctl.splitWall.hint', BATH_WALL_MIN_MM, BATH_WALL_MAX_MM, 0.2, 'bathWallMm', ['split']),
    splitLand,
    allowedCatch,
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
      // "128 × 128", not a translated label
      options: RESOLUTIONS.map((value) => ({ value: String(value), text: `${value} × ${value}` })),
      when: (s) => s.mode === 'slump',
      get: (s) => String(s.resolution),
      set: (s, value) => ({ ...s, resolution: Number(value) }),
    },
  ];
  const schemeSpec: Control<Settings, Key>[] = [
    {
      kind: 'select',
      key: 'scheme',
      label: 'scheme',
      hint: 'scheme.hint',
      options: SCHEME_CHOICES.map((value) => ({ value, label: `scheme.${value}` })),
      when: (s) => s.mode === 'master' || s.mode === 'bath',
      get: (s) => s.scheme,
      set: (s, value) => ({ ...s, scheme: SCHEME_CHOICES.find((choice) => choice === value) ?? 'auto' }),
    },
  ];
  const heightLimit = (): number => Math.max(1, Math.round(model?.heightMm ?? 100));
  const radiusLimit = (): number => Math.max(2, Math.round(model?.radiusMm ?? 100));
  const mouthSpec: Control<Setup, Key>[] = [
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
  const modelSpec: Control<Setup, Key>[] = [
    {
      kind: 'range',
      key: 'spin',
      label: 'ctl.spin',
      hint: 'ctl.spin.hint',
      min: 0,
      max: 355,
      step: 5,
      values: { list: [0, 90, 180, 270], suffix: '°' },
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
    const toolingRows = draw(toolingControls, toolingSpec, () => settings, setSettings, 'mold');
    const mouthHost = make('div');
    const schemeHost = make('div');
    mouthControls.textContent = '';
    mouthControls.append(mouthHost, schemeHost);
    const mouthRows = draw(mouthHost, mouthSpec, () => setup, setSetup, 'mouth');
    const schemeRows = draw(schemeHost, schemeSpec, () => settings, setSettings, 'mold');
    const modelRows = draw(modelControls, modelSpec, () => setup, setSetup, 'model');
    const splitRows = draw(splitControlsEl, splitControls, () => setup, setSetup, 'split');
    const bedRows = draw(bedControlsEl, bedControls, () => settings, setSettings, 'bed');
    rows = [
      { sync: () => toolingRows.sync(settings) },
      { sync: () => schemeRows.sync(settings) },
      { sync: () => mouthRows.sync(setup) },
      { sync: () => modelRows.sync(setup) },
      { sync: () => splitRows.sync(setup) },
      { sync: () => bedRows.sync(settings) },
    ];
  }

  function syncPanel(): void {
    for (const row of rows) row.sync();
    for (const tab of TABS) el(tab.id, HTMLButtonElement).setAttribute('aria-selected', String(tab.mode(settings) === settings.mode));
    mouthCard.hidden = settings.mode !== 'master' && settings.mode !== 'bath';
    splitCard.hidden = settings.mode !== 'split';
    findBtn.disabled = model === null || finding;
    // with no model the setup waits for one: a new model starts from the defaults anyway
    newBtn.disabled = model === null;
    // a master and a whole tile mold are one part: nothing to lay out
    bedCard.hidden = settings.mode === 'master' || (settings.mode === 'tile' && !settings.mold.tileCut);
    emptyEl.hidden = model !== null;
    for (const button of turnButtons) button.disabled = model === null;
    modelNote.hidden = model === null || modelKept !== 'full';
    if (!exporting) exportBtn.textContent = t(EXPORT_LABEL[settings.mode]);
    modelInfo.textContent = model
      ? t('model.info', {
          name: model.ref.name,
          dims: sizeOf(model.placed.positions)
            .map((value) => Math.round(value))
            .join('×'),
          k: Math.round(model.ref.mesh.indices.length / 3000),
        })
      : readError;
    renderResult();
  }

  /** The panel's part of the last build: the parts, the reasons, the warnings. */
  function renderResult(): void {
    partList.textContent = '';
    if (!model) {
      for (const node of [schemeNote, mouthNote, stageNote, bedNote]) node.textContent = '';
      renderMessages(messageList, []);
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
    const note = NOTE[settings.mode];
    schemeNote.textContent = [note ? t(note) : info.reason.map(tm).join(' '), catchNote(info.catches, settings.mold.allowedCatchMm)]
      .filter(Boolean)
      .join(' ');
    const blocking = [...info.blocking, ...parts.flatMap((part) => part.blocking)];
    renderMessages(messageList, messageLines({ blocking, warnings: info.warnings }));
    // the view is empty then, and on a phone the panel may be out of sight
    stageNote.textContent = parts.length === 0 ? blocking.map(tm).join('\n') : '';
    const mouth = setup.mouth.auto ? info.mouth : setup.mouth;
    mouthNote.textContent = mouth ? t('mouth.note', { z: mouth.zMm.toFixed(1), d: (mouth.radiusMm * 2).toFixed(1) }) : '';
    bedNote.textContent =
      laid && inOneFile(settings) ? t('bed.footprint', { w: Math.round(laid.widthMm), d: Math.round(laid.depthMm) }) : '';
    const triangles = parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
    auditEl.textContent = parts.length > 0 ? t('audit.parts', { n: parts.length, k: Math.round(triangles / 1000) }) : '';
    exportBtn.disabled = exporting || parts.length === 0 || info.blocking.length > 0;
  }

  // ---- state changes ----

  /**
   * Everything but the model itself, on every change: a reload opens the
   * project as it was. The banner says when the browser refuses it, and goes
   * once a write works.
   */
  function save(): void {
    const project = saveProject(storage, { locale: chosenLocale, settings, setup });
    renderBanner(
      storageBanner,
      { project, preset: null },
      { t, advice: { blocked: 'storage.advice.blocked', full: 'storage.advice.full' }, onDismiss: () => {} },
    );
  }

  /** An edit of the project: `final` is one undo step, the frames of a drag are not. */
  function edit(next: Project, final: boolean): void {
    const clean = { settings: sanitizeSettings(next.settings), setup: sanitizeSetup(next.setup), model: next.model };
    if (final) history.commit(clean);
    else history.live(clean);
    apply(clean);
  }

  function setSettings(next: Settings, final: boolean): void {
    edit({ settings: next, setup, model: model?.ref ?? null }, final);
  }

  function setSetup(next: Setup, final: boolean): void {
    edit({ settings, setup: next, model: model?.ref ?? null }, final);
  }

  /** Shows a project — an edit's, or one undo or redo brought back. */
  function apply(next: Project): void {
    const before = { settings, setup };
    settings = next.settings;
    setup = next.setup;
    const swapped = next.model !== (model?.ref ?? null);
    if (swapped) {
      hold(next.model);
      // the model is written only when it changes: a slider never encodes it again
      if (next.model) modelKept = saveModel(storage, { name: next.model.name, mesh: next.model.mesh });
      else {
        removeModel(storage);
        modelKept = 'ok';
      }
    }
    // another mode's parts do not stay in sight while its own are built
    if (settings.mode !== before.settings.mode) last = null;
    // what Find said is about the setup it left
    if (swapped || !same(setup, before.setup)) findNote.textContent = '';
    if (model && !swapped && !same(setup.orientation, before.setup.orientation)) {
      place(model);
      last = null;
    }
    save();
    // the layout is the main thread's: a change of it alone lays the last build out anew, with no new build
    const build = swapped || !same({ ...settings, bed: null }, { ...before.settings, bed: null }) || !same(setup, before.setup);
    if (!build && last && !same(settings.bed, before.settings.bed)) show(last.parts);
    syncPanel();
    keys.refresh();
    // a model just opened is built at once
    if (build) schedule(swapped ? 0 : PREVIEW_DELAY_MS);
  }

  /** The model in hand changes: one opened or brought back by undo is placed; none empties the stage to its invitation. */
  function hold(ref: ModelRef | null): void {
    readError = '';
    last = null;
    laid = null;
    // the view shows tooling only: the old model's goes, the new one's is on its way
    viewer?.setMeshes([]);
    stageNote.textContent = '';
    if (!ref) {
      model = null;
      thumbBox.hidden = true;
      // on a phone the sheet would cover the invitation
      if (narrow.matches) sheet.close();
      return;
    }
    model = { ref, placed: ref.mesh, heightMm: 0, radiusMm: 0 };
    // the thumbnail and the turns are what to look at first
    sheet.open();
    place(model);
  }

  /** The parts on the bed, in the view. */
  function show(parts: readonly JobPart[]): void {
    laid = parts.length > 0 ? layOut(parts) : null;
    if (laid) viewer?.setMeshes(laid.groups.flat().map((mesh) => ({ mesh, material: tooling })));
  }

  function layOut(parts: readonly JobPart[]): Arranged {
    return arrangeOnBed(
      parts.map((part) => [toMesh(part)]),
      settings.bed.place,
      settings.bed.gapMm,
    );
  }

  function place(current: Model): void {
    current.placed = placeModel(current.ref.mesh, setup.orientation);
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
    // one step, from the default setup: undo brings back the model before it with its own
    edit({ settings, setup: defaultSetup(), model: modelRef(name.replace(/\.stl$/i, ''), raw) }, true);
  }

  function modelRef(name: string, mesh: IndexedMesh): ModelRef {
    opened++;
    return new ModelRef(`m${opened}`, name, mesh);
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
      split: setup.split,
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
      const done = await progress.track((onProgress) =>
        client.run(job('preview', current), (step) => {
          // the view's bar has no text over a preview: the stages are told in the panel
          onProgress({ step: step.step, total: step.total });
          const { label } = stageOf(step);
          if (stamp === generation && label) {
            auditEl.textContent = t('audit.step', { step: t(label.code, label.params), i: step.step + 1, n: step.total });
          }
        }),
      );
      // null — a fresher job replaced it; stamp — a fresher answer is coming
      if (!done || stamp !== generation) return;
      const { result } = done;
      last = result;
      show(result.parts);
      renderResult();
    } catch (error) {
      if (stamp !== generation) return;
      last = null;
      partList.textContent = '';
      auditEl.textContent = '';
      const said = t('error.build', { error: message(error) });
      renderMessages(messageList, messageLines({ error: said, blocking: [], warnings: [] }));
      stageNote.textContent = said;
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
      const done = await progress.track((onProgress) => client.run(job('export', current), (step) => onProgress(stageOf(step))), {
        label: 'progress.export',
        delayMs: 0,
      });
      if (!done) return;
      const { result } = done;
      const blocking = [...result.info.blocking, ...result.parts.flatMap((part) => part.blocking)];
      if (blocking.length > 0) {
        renderMessages(messageList, messageLines({ blocking, warnings: result.info.warnings }));
        return;
      }
      if (oneFile) {
        download(
          encodeSTL(mergeMeshes(layOut(result.parts).groups.flat()), { brand: 'cast-builder', name: mode }),
          `${current.ref.name}-${mode}.stl`,
        );
        return;
      }
      for (const part of result.parts) {
        download(encodeSTL(part, { brand: 'cast-builder', name: part.id }), `${current.ref.name}-${part.id}.stl`);
        // oxlint-disable-next-line no-await-in-loop -- one by one on purpose: a browser swallows a burst of downloads
        await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_GAP_MS));
      }
    } catch (error) {
      const warnings = last?.info.warnings ?? [];
      renderMessages(messageList, messageLines({ error: t('error.export', { error: message(error) }), blocking: [], warnings }));
    } finally {
      exporting = false;
      exportBtn.textContent = t(EXPORT_LABEL[settings.mode]);
      exportBtn.disabled = false;
    }
  }

  /** Find: the worker looks for the plane, the setup takes the spin and the position it found. */
  async function runFind(): Promise<void> {
    const current = model;
    if (!current || finding) return;
    finding = true;
    findBtn.disabled = true;
    try {
      const done = await progress.track((onProgress) => client.run(job('find', current), (step) => onProgress(stageOf(step))), {
        label: 'split.finding',
        delayMs: 0,
      });
      if (!done || current.ref !== model?.ref) return;
      const { result } = done;
      const { found } = result;
      if (!found) {
        findNote.textContent = result.info.blocking.map(tm).join('\n');
        return;
      }
      edit(
        {
          settings,
          model: current.ref,
          setup: {
            ...setup,
            orientation: { ...setup.orientation, spinDeg: (setup.orientation.spinDeg + found.spinDeg) % 360 },
            split: { ...setup.split, pct: found.pct },
          },
        },
        true,
      );
      findNote.textContent = t('split.found', { spin: found.spinDeg, pct: found.pct, mm: found.depthMm.toFixed(1) });
    } catch (error) {
      findNote.textContent = t('error.build', { error: message(error) });
    } finally {
      finding = false;
      findBtn.disabled = model === null;
    }
  }

  // ---- events ----

  for (const tab of TABS) {
    el(tab.id, HTMLButtonElement).addEventListener('click', () => {
      const mode = tab.mode(settings);
      if (mode !== settings.mode) setSettings({ ...settings, mode }, true);
    });
  }
  const turn = (next: readonly number[]): void => setSetup({ ...setup, orientation: { ...setup.orientation, turn: next } }, true);
  turnButtons[0].addEventListener('click', () => turn(quarterTurn(setup.orientation.turn, 'x')));
  turnButtons[1].addEventListener('click', () => turn(quarterTurn(setup.orientation.turn, 'y')));
  turnButtons[2].addEventListener('click', () => turn(flip(setup.orientation.turn)));
  // everything back to the defaults but the model, the language and the mode tab; one undo step
  resetBtn.addEventListener('click', () =>
    edit({ settings: resetSettings(settings), setup: defaultSetup(), model: model?.ref ?? null }, true),
  );
  // 📄 New: no model, the setup at its defaults, the settings (the user's habits) as they are; one undo step
  newBtn.addEventListener('click', () => edit({ settings, setup: defaultSetup(), model: null }, true));

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
  findBtn.addEventListener('click', () => void runFind());
  const picker = createLanguagePicker(el('topbar', HTMLElement), {
    locales: LOCALES,
    current: locale,
    t,
    onChange(value) {
      // no undo step: the language is not the project's
      locale = chosenLocale = value;
      setLocale(value);
      save();
      translatePage(locale);
      picker.set(locale);
      renderPanel();
      progress.refresh();
      syncPanel();
    },
  });
  const keys = bindHistory({
    undo: el('undo', HTMLButtonElement),
    redo: el('redo', HTMLButtonElement),
    onUndo: () => restore(history.undo()),
    onRedo: () => restore(history.redo()),
    canUndo: () => history.canUndo,
    canRedo: () => history.canRedo,
  });
  function restore(project: Project | null): void {
    if (project) apply(project);
  }

  translatePage(locale);
  renderPanel();
  syncPanel();
  // the model of the last visit, with its setup: the start of the history, not a step
  const kept = loadSavedModel(storage);
  if (kept) {
    setup = saved.setup;
    const ref = modelRef(kept.name, kept.mesh);
    history.reset({ settings, setup, model: ref });
    hold(ref);
    syncPanel();
    schedule(0);
  }
}

/** The rows of one part of the panel. */
function draw<T>(
  host: HTMLElement,
  spec: readonly Control<T, Key>[],
  read: () => T,
  change: (next: T, final: boolean) => void,
  idPrefix: string,
) {
  return renderControls(host, spec, { read, change, idPrefix, t });
}

function withNormals(mesh: IndexedMesh): SurfaceMesh {
  return { ...mesh, normals: meshNormals(mesh.positions, mesh.indices) };
}

/** A part's mesh from the worker's answer — the buffers came by transfer, no copies. */
function toMesh(part: JobPart): SurfaceMesh {
  return { positions: part.positions, indices: part.indices, normals: part.normals };
}

/** A stage of the worker's job: its codes are the app's keys (the worker is the app's own); anything else is a bar with no text. */
function stageOf(progress: JobProgress): JobProgress<Key> {
  const { step, total, label } = progress;
  return label && isKey(label.code) ? { step, total, label: { code: label.code, params: label.params } } : { step, total };
}

/** Plain data compared by its text, as the history does. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
