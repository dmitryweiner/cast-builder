// The panel as a bottom sheet on a phone. On a wide screen the panel stands
// beside the view and none of this applies: the CSS ignores `.open` there and
// the button stays hidden.
//
// The view under the open sheet stays live — a drag turns the tooling, a
// pinch zooms it; only a tap (one finger, short, still) closes the sheet.

/** The part of `MediaQueryList` used here — a test passes its own. */
export interface NarrowQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
}

export interface SheetOptions {
  panel: HTMLElement;
  /** "Settings": opens the closed sheet */
  button: HTMLButtonElement;
  /** the canvas: a tap on it closes the sheet */
  view: HTMLElement;
  /** true where the panel is a sheet */
  narrow: NarrowQuery;
  /** how much of the view's bottom the sheet covers, px — the view centres the tooling above it */
  onInset: (px: number) => void;
  /** whether the sheet starts open (it does by default) */
  open?: boolean;
}

export interface SheetHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** reports the inset again — after a resize: the sheet's height follows the window */
  refresh(): void;
}

const TAP_MOVE_PX = 6;
const TAP_MS = 300;

export function setupSheet({ panel, button, view, narrow, onInset, open: initial = true }: SheetOptions): SheetHandle {
  let open = initial;

  function apply(): void {
    panel.classList.toggle('open', open);
    button.hidden = open || !narrow.matches;
    onInset(open && narrow.matches ? panel.offsetHeight : 0);
  }

  const pressed = new Map<number, { x: number; y: number; t: number }>();
  let gesture = false;
  view.addEventListener('pointerdown', (event) => {
    pressed.set(event.pointerId, { x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (pressed.size > 1) gesture = true;
  });
  view.addEventListener('pointermove', (event) => {
    const start = pressed.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_MOVE_PX) gesture = true;
  });
  const release = (event: PointerEvent): void => {
    const start = pressed.get(event.pointerId);
    pressed.delete(event.pointerId);
    const tap =
      start !== undefined &&
      !gesture &&
      event.timeStamp - start.t < TAP_MS &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_MOVE_PX;
    if (pressed.size === 0) gesture = false;
    if (tap && narrow.matches && open) {
      open = false;
      apply();
    }
  };
  view.addEventListener('pointerup', release);
  view.addEventListener('pointercancel', (event) => {
    pressed.delete(event.pointerId);
    if (pressed.size === 0) gesture = false;
  });

  button.addEventListener('click', () => {
    open = true;
    apply();
  });
  narrow.addEventListener('change', apply);
  apply();

  return {
    open() {
      open = true;
      apply();
    },
    close() {
      open = false;
      apply();
    },
    isOpen: () => open,
    refresh: apply,
  };
}
