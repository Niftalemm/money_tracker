'use client';
import { useEffect } from 'react';
// Marks whether the last interaction was a pointer (touch/mouse) or navigation
// keys, so focus rings show for keyboard users only. Nothing is stored.
const NAVIGATION = /^(?:Tab|Escape|Enter| |Arrow\w+|Home|End|PageUp|PageDown)$/;
export default function InputModality() {
  useEffect(() => {
    const root = document.documentElement;
    const pointer = () => (root.dataset.input = 'pointer');
    const keyboard = (e: KeyboardEvent) => {
      if (NAVIGATION.test(e.key)) root.dataset.input = 'keyboard';
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', keyboard, true);
    };
  }, []);
  return null;
}
