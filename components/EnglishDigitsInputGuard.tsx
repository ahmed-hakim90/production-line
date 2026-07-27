import { useEffect } from 'react';
import {
  hasNonEnglishDigits,
  isEnglishDigitsInput,
  toEnglishDigits,
} from '@/lib/englishDigits';

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, next: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Project-wide: force Western digits (0–9) in numeric inputs, including Arabic keyboards.
 * Mount once near the app root.
 */
export function EnglishDigitsInputGuard() {
  useEffect(() => {
    const onBeforeInput = (event: Event) => {
      const e = event as InputEvent;
      const el = e.target;
      if (!isEnglishDigitsInput(el)) return;
      if (!e.data || !hasNonEnglishDigits(e.data)) return;

      e.preventDefault();
      const inserted = toEnglishDigits(e.data);
      if (!inserted) return;

      if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = el.value.slice(0, start) + inserted + el.value.slice(end);
        const caret = start + inserted.length;
        setNativeValue(el, next);
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* type=number may not support selection in some browsers */
        }
        return;
      }

      setNativeValue(el, toEnglishDigits(el.value + inserted));
    };

    const onInput = (event: Event) => {
      const el = event.target;
      if (!isEnglishDigitsInput(el)) return;
      if (!hasNonEnglishDigits(el.value)) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = toEnglishDigits(el.value);
      if (next === el.value) return;
      setNativeValue(el, next);
      if (typeof start === 'number' && typeof end === 'number') {
        try {
          const delta = el.value.length - next.length;
          el.setSelectionRange(Math.max(0, start - delta), Math.max(0, end - delta));
        } catch {
          /* ignore */
        }
      }
    };

    const onPaste = (event: Event) => {
      const e = event as ClipboardEvent;
      const el = e.target;
      if (!isEnglishDigitsInput(el)) return;
      const text = e.clipboardData?.getData('text');
      if (!text || !hasNonEnglishDigits(text)) return;

      e.preventDefault();
      const inserted = toEnglishDigits(text);
      if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = el.value.slice(0, start) + inserted + el.value.slice(end);
        const caret = start + inserted.length;
        setNativeValue(el, next);
        try {
          el.setSelectionRange(caret, caret);
        } catch {
          /* ignore */
        }
        return;
      }
      setNativeValue(el, toEnglishDigits(el.value + inserted));
    };

    document.addEventListener('beforeinput', onBeforeInput, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      document.removeEventListener('beforeinput', onBeforeInput, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, []);

  return null;
}
