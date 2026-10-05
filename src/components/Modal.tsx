'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
let open = 0;
// Swipe the top of a phone sheet down this far (or flick it) to close it.
const DISMISS = 110;
export default function Modal({
  title,
  children,
  onClose,
  wide = false,
  drawer = false,
  description,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
  description?: React.ReactNode;
  /** Actions that stay pinned below the scrolling content. */
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; at: number } | null>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    // Keep the page behind a sheet from scrolling on phones.
    if (open++ === 0) document.documentElement.classList.add('modal-open');
    return () => {
      dialog.close();
      if (--open === 0) document.documentElement.classList.remove('modal-open');
    };
  }, []);
  const sheet = () => window.matchMedia('(max-width: 700px)').matches;
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}${drawer ? ' drawer' : ''}${offset ? ' dragging' : ''}`}
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="modal-heading"
        onPointerDown={(e) => {
          if (
            !sheet() ||
            e.button !== 0 ||
            (e.target as Element).closest('button, a, input, select')
          )
            return;
          drag.current = { y: e.clientY, at: performance.now() };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) setOffset(Math.max(0, e.clientY - drag.current.y));
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          const moved = Math.max(0, e.clientY - drag.current.y),
            speed = moved / Math.max(1, performance.now() - drag.current.at);
          drag.current = null;
          if (moved > DISMISS || (moved > 40 && speed > 0.6)) onClose();
          else setOffset(0);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setOffset(0);
        }}
      >
        <div>
          <h2>{title}</h2>
          {description && <p className="modal-description">{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer modal-actions">{footer}</div>}
    </dialog>
  );
}
