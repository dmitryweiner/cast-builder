// Messages from the core and the worker to the user: a code and parameters,
// not a sentence. Neither the core nor the worker knows the language (it may
// change in the middle of a job); the interface turns a code into text
// (`tm` in src/i18n). Every code must be a key of the dictionary, which `tm`
// checks at compile time.

export type MessageCode =
  // parting scheme of the mold (mold/analyze)
  | 'mold.whyHandle'
  | 'mold.whyWider'
  | 'mold.dropout'
  | 'mold.wideBase'
  | 'mold.narrowBase'
  | 'mold.manual'
  | 'mold.undercuts'
  | 'mold.noPlug'
  | 'press.undercut'
  | 'press.notRound'
  // the loaded model (solidify, model)
  | 'model.notSolid'
  | 'model.filled'
  | 'model.openTop'
  // mesh checks before the download (validate)
  | 'mesh.nonFinite'
  | 'mesh.badIndices'
  | 'mesh.empty'
  | 'mesh.flat'
  | 'mesh.open'
  | 'mesh.inverted'
  | 'mesh.degenerate'
  // stages of worker jobs
  | 'progress.loading'
  | 'progress.model'
  | 'progress.checkMeshes'
  | 'progress.slump'
  | 'progress.punch'
  | 'progress.analyze'
  | 'progress.master'
  | 'progress.block'
  | 'progress.part';

export interface Message {
  code: MessageCode;
  params?: Readonly<Record<string, string | number>>;
}
