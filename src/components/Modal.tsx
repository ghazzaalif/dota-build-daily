import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`sheet-up max-h-[92dvh] w-full overflow-y-auto rounded-t-[8px] border border-line bg-panel px-5 pb-6 pt-5 focus:outline-none sm:rounded-[6px] ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-h2 font-extrabold uppercase">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted hover:text-ink">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4">
      {message && <div className="rounded-[3px] bg-ink px-4 py-2 text-small font-semibold text-bg">{message}</div>}
    </div>
  );
}
