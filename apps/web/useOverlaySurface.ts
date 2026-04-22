import { useEffect, useRef, type RefObject } from 'react';

export function useOverlaySurface<T extends HTMLElement>(
  onClose: () => void,
): {
  surfaceRef: RefObject<T>;
  closeButtonRef: RefObject<HTMLButtonElement>;
} {
  const surfaceRef = useRef<T>(null!);
  const closeButtonRef = useRef<HTMLButtonElement>(null!);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus() ?? surfaceRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return { surfaceRef, closeButtonRef };
}
