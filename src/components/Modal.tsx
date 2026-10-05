'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
let open = 0;
export default function Modal({
  title,
  children,
  onClose,
  wide = false,
  drawer = false,
  description,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
  description?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}${drawer ? ' drawer' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
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
    </dialog>
  );
}
