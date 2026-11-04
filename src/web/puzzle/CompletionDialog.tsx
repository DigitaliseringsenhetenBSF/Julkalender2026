import { useEffect, useRef } from 'react';
import { sv } from '../texts.sv.ts';

/**
 * Shown once, the moment the last piece falls into place. A native modal <dialog> takes focus,
 * is announced by screen readers and closes with Escape or the button.
 */
export function CompletionDialog(props: {
  open: boolean;
  totalPieces: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      className="celebration"
      aria-labelledby="celebration-title"
      aria-describedby="celebration-text"
      onClose={props.onClose}
    >
      <p className="celebration__icon" aria-hidden="true">
        🎉
      </p>
      <h2 id="celebration-title">{sv.puzzle.celebrationTitle}</h2>
      <p id="celebration-text">{sv.puzzle.celebrationText(props.totalPieces)}</p>
      <button
        type="button"
        className="button button--primary"
        autoFocus
        onClick={() => ref.current?.close()}
      >
        {sv.puzzle.celebrationClose}
      </button>
    </dialog>
  );
}
