import { useEffect } from "react";

/**
 * Fires `callback` whenever a mousedown or touchstart event occurs
 * outside the element referenced by `ref`.
 */
export function useOutsideClick(
  ref: React.RefObject<HTMLDivElement | null>,
  callback: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    function listener(event: MouseEvent | TouchEvent) {
      const el = ref?.current;
      if (!el || el.contains(event.target as Node)) return;
      callback(event);
    }

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, callback]);
}
