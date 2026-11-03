// English is the default locale and defines the keys of every message set.
// Templates: `{name}` is a parameter; `{n|form|form}` picks a word by the
// number n, the forms in the order of the locale's Intl.PluralRules
// categories (en: one/other, ru: one/few/many). Plain messages without
// parameters can be used in index.html via data-i18n / data-i18n-label /
// data-i18n-title.
export const en = {
  title: 'Cast Builder',
  description: 'Slip-casting molds from a ready STL: a master positive, pour boxes for silicone, a slump mold and its punch.',
  tagline: 'molds from a ready STL',
  languageLabel: 'Language',
  source: 'Source code',
  clayform: 'Design a piece in Clayform',
  open: 'Open STL',
  'open.title': 'Open an STL file of the piece',
  example: 'Try a sample teapot',
  'drop.title': 'Bring a ready piece',
  'drop.hint': 'Drop an STL here or open one. Units are millimetres, the axis of the piece goes up; a hollow print is filled by itself.',

  'panel.model': 'Model',
  'panel.tooling': 'Tooling',
  'panel.mouth': 'Mouth and parting',
  'panel.open': 'Settings',

  'turn.x': 'Turn about X',
  'turn.y': 'Turn about Y',
  'turn.flip': 'Upside down',
  'turn.reset': 'Reset',
  'turn.hint': 'Stand the piece upright, then spin it so a handle or a spout lies along X, where the mold parts.',
  'ctl.spin': 'Spin',
  'ctl.spin.hint': 'about the vertical axis, degrees',

  'model.info': '{name} · {dims} mm · {k}k triangles',
  'model.pieces':
    'There are {n} separate pieces in the file: a mold is made for one. Export each piece on its own — in Clayform untick “Lid alongside”.',
  'model.notSolid': 'The model is not a closed solid: it has holes or loose edges. Repair it in the program it came from.',
  'model.filled': 'The model was hollow: its inside is filled, the plaster only sees the outside.',
  'model.open':
    'The model is hollow and open where there is no flat cut, so it cannot be filled: the plaster would get into it. Bring a solid model.',
  'model.openBottom':
    'The model is hollow and open at the bottom — a lid as it is printed? Turn it over (“Upside down”): its opening has to look up to be filled.',

  'tab.master': 'Master',
  'tab.master.title': 'A positive with a pouring collar for a mold made by hand',
  'tab.bath': 'Pour boxes',
  'tab.bath.title': 'Printed formwork for pouring silicone, one per part of the mold',
  'tab.slump': 'Slump mold',
  'tab.slump.title': 'A dished mold and its punch: the slab is pressed in, the relief lies outside the piece',
  'slump.note':
    'A dished mold: the slab is pressed in, the relief lands on the outside of the piece. The punch sits next to it in the same file.',

  'ctl.shrink': 'Shrinkage',
  'ctl.shrink.hint': 'slip shrinks as it dries and fires — the model grows by this much, %',
  'ctl.spare': 'Collar',
  'ctl.spare.hint': 'a collar over the rim to top the slip up, mm',
  'ctl.plaster': 'Plaster',
  'ctl.plaster.hint': 'thickness of plaster round the cavity, mm',
  'ctl.key': 'Keys',
  'ctl.key.hint': 'radius of the locks on the parting plane, mm; 0 — none',
  'ctl.silicone': 'Silicone',
  'ctl.silicone.hint': 'layer of silicone over the block, mm',
  'ctl.wall': 'Wall',
  'ctl.bathWall.hint': 'wall of the printed formwork, mm',
  'ctl.slumpWall.hint': 'shell of the mold and the punch, mm: only the surface the slab touches is printed',
  'ctl.slab': 'Slab',
  'ctl.slab.hint': 'thickness of the clay slab — the wall of the piece, mm; the punch is smaller than the mold by exactly this',
  'ctl.ear': 'Ears',
  'ctl.ear.hint': 'seat of a mold ear for the punch leg, mm: the ears and legs reach this much further',
  'ctl.round': 'Round bottom',
  'ctl.round.hint': 'the punch bottom, %: 100 — a cap from the axis, nearly a hemisphere for a bowl; 0 — a flat floor',
  'ctl.vent': 'Vents',
  'ctl.vent.hint': 'holes in the mold bottom and along the punch axis, mm: they let air out and break the suction',
  'ctl.resolution': 'Detail',
  'ctl.resolution.hint': 'grid of the slump mold in the exported file; the preview is coarser',

  'mouth.auto': 'Find the mouth',
  'mouth.auto.hint': 'the largest flat top of the piece, or the rim of a filled hollow one',
  'mouth.z': 'Mouth height',
  'mouth.z.hint': 'where the collar stands, mm: the rim, not the tip of a spout',
  'mouth.r': 'Gate radius',
  'mouth.r.hint': 'radius of the collar, mm; a little narrower than the rim, so the surfaces never coincide',
  'mouth.note': 'Mouth {z} mm high, gate Ø{d} mm.',
  scheme: 'Parting',
  'scheme.hint': 'how the plaster mold comes apart; Auto reads it from the shape',
  'scheme.auto': 'Auto',
  'scheme.dropout': 'One part',
  'scheme.halves': 'Two halves',
  'scheme.halves-bottom': 'Halves and a bottom plate',
  'plug.on': 'Mouth plug',
  'plug.on.hint': 'for a recessed lid: a separate part that casts the ledge inside the mouth',
  'plug.recess': 'Ledge depth',
  'plug.recess.hint': 'how far below the rim the ledge for the lid lies, mm',
  'plug.gallery': 'Gallery radius',
  'plug.gallery.hint': 'radius of the opening above the ledge, mm; wider than the gate, narrower than the rim',

  'mold.whyHandle': 'The model has a through hole (a handle): it cannot come out upwards, the mold parts along the axis.',
  'mold.whyWider':
    'The piece is somewhere wider than above it ({pct} % of the surface catches): it cannot come out upwards, the mold parts along the axis.',
  'mold.dropout': 'The piece is nowhere wider than above it: it comes out upwards, the mold is one part.',
  'mold.wideBase': 'The bottom is wide and flat: a seam across it is the hardest to clean, so the bottom is a separate plate.',
  'mold.narrowBase': 'The bottom is narrow, no separate plate is needed.',
  'mold.manual': 'Parting picked by hand.',
  'mold.undercuts':
    'Undercuts: {pct} % of the surface, the steepest catch {deg}°. The halves will hold the piece: make the relief shallower or spin the piece about its axis.',
  'mold.noPlug':
    'The plug does not fit: the gallery must be wider than the gate by a millimetre and narrower than the rim. The mold keeps a collar.',
  'press.undercut':
    'The piece will not come out of the mold: {pct} % of its surface catches, the steepest {deg}° — the slab will tear on lifting. Slump molding wants a piece that is nowhere wider than above it.',
  'press.notRound':
    'The piece is not round: its radius varies by up to {mm} mm around the axis. The punch is round, so the slab will be uneven — slump molding suits a body of revolution.',

  'mesh.nonFinite': 'The mesh has broken coordinates.',
  'mesh.badIndices': 'The mesh has broken triangles.',
  'mesh.empty': 'The mesh is empty.',
  'mesh.flat': 'The mesh is flat.',
  'mesh.open': 'The mesh is not closed — a slicer will not print it.',
  'mesh.inverted': 'The mesh is turned inside out.',
  'mesh.degenerate': '{count} degenerate triangles ({pct} %).',

  'progress.loading': 'loading the boolean operations module',
  'progress.model': 'preparing the model',
  'progress.checkMeshes': 'checking the meshes',
  'progress.slump': 'slump mold',
  'progress.punch': 'punch',
  'progress.analyze': 'parting analysis',
  'progress.master': 'master positive',
  'progress.block': 'plaster block',
  'progress.part': 'part {i} of {n}',
  'progress.preview': 'building the tooling…',
  'progress.export': 'building…',

  'part.master': 'Master positive',
  'part.half-A': 'Half A',
  'part.half-B': 'Half B',
  'part.bottom': 'Bottom plate',
  'part.single': 'Whole mold',
  'part.plug': 'Mouth plug',
  'part.bath': 'Pour box: {part}',
  'part.slump': 'Mold + punch',
  'size.box': '{dims} mm',

  'export.master': 'Export master',
  'export.bath': 'Export pour boxes',
  'export.slump': 'Export mold',
  'export.busy': 'Building…',
  'audit.parts': '{n} {n|part|parts}, {k}k triangles',
  'audit.step': 'building: {step} ({i} of {n})',
  'audit.none': 'Open a model to build its tooling.',
  'error.read': 'Could not read the file: {error}',
  'error.build': 'The tooling failed: {error}',
  'error.export': 'The export failed: {error}',
};

export type Key = keyof typeof en;
export type Messages = Readonly<Record<Key, string>>;
