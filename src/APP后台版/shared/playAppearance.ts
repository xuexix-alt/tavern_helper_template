import { ref, watch } from 'vue';
import { z } from 'zod';

// User-controlled appearance for the Play narrative panel.
// Stored in SillyTavern script variables when available; otherwise fallback to localStorage.

const StorageSchema = z
  .object({
    version: z.number().int().default(1),
    // "none" uses pure gradient; "placeholder" uses built-in placeholder; "url" uses custom url.
    logBgSource: z.enum(['none', 'placeholder', 'url']).default('placeholder'),
    logBgUrl: z.string().default(''),
    // A CSS color string like "rgba(0,0,0,0.55)".
    logTint: z.string().default('rgba(0, 0, 0, 0.55)'),
    // 0..1
    logTintStrength: z.number().min(0).max(1).default(0.6),
  })
  .prefault({});

export type PlayAppearance = z.infer<typeof StorageSchema>;

const STORAGE_KEY = 'app-backend-ui:play-appearance';

function getScriptIdSafe(): string {
  try {
    const fn = (window as any)?.getScriptId;
    if (typeof fn === 'function') return String(fn());
  } catch {
    // ignore
  }
  return 'app-backend-ui';
}

function loadFromLocalStorage(): PlayAppearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return StorageSchema.parse({});
    return StorageSchema.parse(JSON.parse(raw));
  } catch {
    return StorageSchema.parse({});
  }
}

function saveToLocalStorage(value: PlayAppearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function loadFromTavernVariables(): PlayAppearance | null {
  try {
    const getVariables = (window as any)?.getVariables;
    if (typeof getVariables !== 'function') return null;
    const vars = getVariables({ type: 'script', script_id: getScriptIdSafe() }) || {};
    return StorageSchema.parse(vars?.playAppearance ?? {});
  } catch {
    return null;
  }
}

function saveToTavernVariables(value: PlayAppearance) {
  try {
    const getVariables = (window as any)?.getVariables;
    const replaceVariables = (window as any)?.replaceVariables;
    if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') return;
    const scope = { type: 'script', script_id: getScriptIdSafe() };
    const vars = getVariables(scope) || {};
    replaceVariables({ ...vars, playAppearance: value }, scope);
  } catch {
    // ignore
  }
}

function loadInitial(): PlayAppearance {
  // Prefer Tavern variables when available, otherwise localStorage.
  return loadFromTavernVariables() ?? loadFromLocalStorage();
}

export const playAppearance = ref<PlayAppearance>(loadInitial());

// Persist changes (best-effort).
watch(
  playAppearance,
  next => {
    saveToLocalStorage(next);
    saveToTavernVariables(next);
  },
  { deep: true },
);

