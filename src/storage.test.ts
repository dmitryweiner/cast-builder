import { describe, expect, it } from 'vitest';
import type { IndexedMesh } from './geo/stl';
import { defaultSettings, defaultSetup, sanitizeSettings, sanitizeSetup } from './state';
import type { Setup } from './state';
import { loadProject, loadSavedModel, MODEL_KEY, saveModel, saveProject, STORAGE_KEY, type KeyValueStorage } from './storage';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  /** a value longer than this is refused as a full storage would */
  constructor(private readonly quota = Infinity) {}
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (value.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const broken: KeyValueStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

const loadSettings = (storage: KeyValueStorage | null) => loadProject(storage).settings;

/** A tetrahedron, its coordinates not round in float32. */
const tetra = (): IndexedMesh => ({
  positions: new Float32Array([0.1, 0.2, 0.3, 10.7, 0, 0, 0, 10.3, 0, 0, 0, 12.9]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
});

describe('settings storage', () => {
  it('uses the package name as the key, the model under a key of its own', () => {
    expect(STORAGE_KEY).toBe('cast-builder');
    expect(MODEL_KEY).toBe('cast-builder-model');
  });

  it('returns defaults when nothing is saved or storage is unavailable', () => {
    const fresh = { settings: defaultSettings(), setup: defaultSetup() };
    expect(loadProject(new MemoryStorage())).toEqual(fresh);
    expect(loadProject(null)).toEqual(fresh);
    expect(loadProject(broken)).toEqual(fresh);
  });

  it('saves and loads the settings and the setup of the model in hand', () => {
    const storage = new MemoryStorage();
    const settings = { ...defaultSettings(), locale: 'ru' as const, mode: 'slump' as const, scheme: 'halves' as const, resolution: 256 };
    const setup: Setup = {
      orientation: { turn: [0, 0, 1, 0, 1, 0, -1, 0, 0], spinDeg: 90 },
      mouth: { auto: false, zMm: 80, radiusMm: 20 },
      plug: { on: true, recessMm: 5, galleryMm: 30 },
    };
    expect(saveProject(storage, { settings, setup })).toBe('ok');
    expect(loadProject(storage)).toEqual({ settings, setup });
  });

  it('settings saved before the setup was kept (version 1) keep everything, the setup at its default', () => {
    const storage = new MemoryStorage();
    const settings = { ...defaultSettings(), mode: 'master' as const, resolution: 384 };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings }));
    expect(loadProject(storage)).toEqual({ settings, setup: defaultSetup() });
  });

  it('reports a failed write and never throws', () => {
    expect(saveProject(broken, { settings: defaultSettings(), setup: defaultSetup() })).toBe('blocked');
    expect(saveProject(null, { settings: defaultSettings(), setup: defaultSetup() })).toBe('blocked');
  });

  it.each(['not json', '[]', '{"version":3,"settings":{"locale":"ru"}}', '{"version":1}', '{"version":2,"settings":[]}'])(
    'resets unreadable data: %s',
    (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(STORAGE_KEY, raw);
      expect(loadSettings(storage)).toEqual(defaultSettings());
      expect(loadProject(storage).setup).toEqual(defaultSetup());
    },
  );

  it('replaces bad fields with defaults one by one', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        settings: { locale: 'xx', mode: 'slump', resolution: 7, mold: { shrinkPct: 99 } },
        setup: { orientation: { spinDeg: 'x' }, plug: { on: true, recessMm: -1 } },
      }),
    );
    const { settings, setup } = loadProject(storage);
    expect(settings.locale).toBeNull();
    expect(settings.mode).toBe('slump');
    expect(settings.resolution).toBe(defaultSettings().resolution);
    expect(settings.mold.shrinkPct).toBe(30);
    expect(setup.orientation).toEqual(defaultSetup().orientation);
    expect(setup.plug).toMatchObject({ on: true, recessMm: 0 });
  });

  it('settings saved before the screw clamps load with them off and keep the rest', () => {
    const storage = new MemoryStorage();
    const before = { ...defaultSettings().mold, slabMm: 7 };
    const { screws: _screws, printScrews: _printScrews, threadFitMm: _fit, ...old } = before;
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: { mode: 'slump', mold: old } }));
    const settings = loadSettings(storage);
    expect(settings.mold).toEqual({ ...before, screws: false, printScrews: false, threadFitMm: 0.5 });
  });

  it('settings saved before the bed layout load it as auto, 15 mm, pour boxes apart, and keep the rest', () => {
    const storage = new MemoryStorage();
    const { bed: _bed, ...old } = { ...defaultSettings(), mode: 'slump' };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: old }));
    const settings = loadSettings(storage);
    expect(settings.bed).toEqual({ place: 'auto', gapMm: 15, oneFile: false });
    expect(settings.mode).toBe('slump');
  });
});

describe('the model kept', () => {
  it('comes back bit for bit, with its name', () => {
    const storage = new MemoryStorage();
    const mesh = tetra();
    expect(saveModel(storage, { name: 'teapot', mesh })).toBe('ok');
    const kept = loadSavedModel(storage);
    expect(kept?.name).toBe('teapot');
    expect(kept?.mesh.positions).toEqual(mesh.positions);
    expect(kept?.mesh.indices).toEqual(mesh.indices);
    expect(kept?.mesh.positions).toBeInstanceOf(Float32Array);
    expect(kept?.mesh.indices).toBeInstanceOf(Uint32Array);
  });

  it('is written apart from the settings: saving them never touches it', () => {
    const storage = new MemoryStorage();
    saveModel(storage, { name: 'cup', mesh: tetra() });
    saveProject(storage, { settings: defaultSettings(), setup: defaultSetup() });
    expect(loadSavedModel(storage)?.name).toBe('cup');
  });

  it('too large for the storage: the old one goes too — a stale model must not reopen with a new setup', () => {
    const storage = new MemoryStorage(400);
    expect(saveModel(storage, { name: 'small', mesh: tetra() })).toBe('ok');
    const big: IndexedMesh = { positions: new Float32Array(300), indices: new Uint32Array([0, 1, 2]) };
    expect(saveModel(storage, { name: 'big', mesh: big })).toBe('full');
    expect(loadSavedModel(storage)).toBeNull();
    expect(storage.data.has(MODEL_KEY)).toBe(false);
  });

  it('a blocked storage keeps nothing and never throws', () => {
    expect(saveModel(broken, { name: 'x', mesh: tetra() })).toBe('blocked');
    expect(saveModel(null, { name: 'x', mesh: tetra() })).toBe('blocked');
    expect(loadSavedModel(broken)).toBeNull();
    expect(loadSavedModel(null)).toBeNull();
  });

  const encoded = (bytes: ArrayBufferLike): string => Buffer.from(bytes).toString('base64');
  const record = (over: Record<string, unknown>) => ({
    version: 1,
    name: 'x',
    positions: encoded(tetra().positions.buffer),
    indices: encoded(tetra().indices.buffer),
    ...over,
  });
  it.each([
    ['not json', 'not json'],
    ['another version', JSON.stringify(record({ version: 2 }))],
    ['no name', JSON.stringify(record({ name: 7 }))],
    ['not base64', JSON.stringify(record({ positions: '%%%' }))],
    ['a ragged buffer', JSON.stringify(record({ positions: encoded(new Uint8Array(7).buffer) }))],
    ['an index out of range', JSON.stringify(record({ indices: encoded(new Uint32Array([0, 1, 9]).buffer) }))],
    ['no triangles', JSON.stringify(record({ indices: '' }))],
    ['a NaN', JSON.stringify(record({ positions: encoded(new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]).buffer) }))],
  ])('garbage is no model: %s', (_label, raw) => {
    const storage = new MemoryStorage();
    storage.setItem(MODEL_KEY, raw);
    expect(loadSavedModel(storage)).toBeNull();
  });
});

describe('sanitizers', () => {
  const junk = [
    null,
    undefined,
    42,
    'x',
    [],
    { mode: 'vessel' },
    { bed: { gapMm: -3, place: 7 } },
    { mouth: { zMm: NaN, auto: 'yes' }, plug: { recessMm: -5 } },
  ];

  it('never throw and are idempotent', () => {
    for (const raw of junk) {
      const settings = sanitizeSettings(raw);
      expect(sanitizeSettings(settings)).toEqual(settings);
      const setup = sanitizeSetup(raw);
      expect(sanitizeSetup(setup)).toEqual(setup);
    }
  });

  it('keep what is valid', () => {
    const setup = { ...defaultSetup(), mouth: { auto: false, zMm: 120, radiusMm: 40 }, plug: { on: true, recessMm: 8, galleryMm: 44 } };
    expect(sanitizeSetup(setup)).toEqual(setup);
    expect(sanitizeSetup({ plug: { recessMm: -5 } }).plug.recessMm).toBe(0);
    const bed = { place: 'column', gapMm: 8, oneFile: true };
    expect(sanitizeSettings({ bed }).bed).toEqual(bed);
    expect(sanitizeSettings({ bed: { place: 'diagonal', gapMm: 900, oneFile: 'yes' } }).bed).toEqual({
      place: 'auto',
      gapMm: 50,
      oneFile: false,
    });
  });
});
