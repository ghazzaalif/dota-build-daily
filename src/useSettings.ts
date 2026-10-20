// Shared settings (F10) for both modes: one dbd:v1:settings key, applied to <html> as
// data-theme / data-colorblind / data-motion.
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSettings, saveSettings, type Settings } from './game/storage';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedMotion = settings.reducedMotion === 'on' || (settings.reducedMotion === 'system' && prefersReduced);

  useEffect(() => {
    const el = document.documentElement;
    // Only clear a theme we set ourselves; a host page may set data-theme too.
    if (settings.theme === 'system') {
      if (el.dataset.themeOwner === 'app') {
        el.removeAttribute('data-theme');
        delete el.dataset.themeOwner;
      }
    } else {
      el.setAttribute('data-theme', settings.theme);
      el.dataset.themeOwner = 'app';
    }
    el.setAttribute('data-colorblind', String(settings.colorblind));
    el.setAttribute('data-motion', reducedMotion ? 'reduced' : 'full');
    saveSettings(settings);
  }, [settings, reducedMotion]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return { settings, setSettings, updateSettings, reducedMotion };
}

/** Small shared toast state (one message at a time, auto-hides). */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>();
  const toast = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 1800);
  }, []);
  return { message, toast };
}
