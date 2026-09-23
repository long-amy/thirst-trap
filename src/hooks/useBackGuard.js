import { useEffect, useRef } from 'react';

/**
 * Makes the Android back gesture close a layer instead of closing the app.
 *
 * The app is a single page that never navigates, so in a standalone PWA there's
 * nothing on the history stack and the very first back swipe exits. Every open
 * layer (a screen, a modal, a selection mode) registers here; while at least one
 * is open we keep exactly one throwaway history entry, so back pops that entry
 * and we close the innermost layer instead.
 *
 * Layers unwind innermost-first, so a modal opened over the plant detail screen
 * takes one back to close the modal and another to leave the plant. With nothing
 * open, back exits the app as it should.
 *
 * One shared sentinel rather than an entry per layer keeps the history stack flat
 * and makes the hook indifferent to React StrictMode's double-mounting in dev.
 *
 * @param active  whether the layer is currently open
 * @param onBack  called when the user backs out of it
 */

const guards = [];      // innermost last
let sentinel = false;   // do we currently own a history entry?
let listening = false;

function sync() {
  if (guards.length > 0 && !sentinel) {
    sentinel = true;
    window.history.pushState({ backGuard: true }, '');
  } else if (guards.length === 0 && sentinel) {
    sentinel = false;
    window.history.back();
  }
}

function handlePopState() {
  sentinel = false; // the gesture consumed our entry
  const top = guards[guards.length - 1];
  if (!top) return;
  top.onBack();
  // Closing that layer unregisters it; re-arm once React has committed, so any
  // layer still underneath keeps its own protection.
  queueMicrotask(sync);
}

export function useBackGuard(active, onBack) {
  const onBackRef = useRef(onBack);

  // Kept fresh in an effect rather than during render, so the registered guard
  // always calls the latest closure without re-registering on every render.
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!active) return undefined;

    const entry = { onBack: () => onBackRef.current?.() };
    guards.push(entry);
    if (!listening) {
      listening = true;
      window.addEventListener('popstate', handlePopState);
    }
    sync();

    return () => {
      const i = guards.indexOf(entry);
      if (i !== -1) guards.splice(i, 1);
      // Deferred so closing one layer while another opens in the same commit
      // doesn't drop and immediately re-add the sentinel.
      queueMicrotask(sync);
    };
  }, [active]);
}
