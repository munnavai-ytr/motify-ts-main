import {
  ACTIVE_PROJECT_STORAGE,
  AUTO_BUILD_STORAGE,
  DAILY_REQUEST_LIMITS_STORAGE,
  DEFAULT_FORMAT_STORAGE,
  EXPORT_MODE_STORAGE,
  GEMINI_API_KEY_STORAGE,
  GEMINI_BACKUP_MODEL_STORAGE,
  GEMINI_MODEL_STORAGE,
  PROJECT_FORMAT_STORAGE_PREFIX,
  THEME_STORAGE,
} from './constants';
import type { ExportMode, FormatPreference, ThemePreference } from './types';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

export function normalizeModelStorageKey(modelName: string): string {
  return modelName.trim().replace(/^models\//i, '').toLowerCase();
}

export function getStoredApiKey(): string {
  return readStorage(GEMINI_API_KEY_STORAGE)?.trim() ?? '';
}

export function setStoredApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    removeStorage(GEMINI_API_KEY_STORAGE);
    return;
  }
  writeStorage(GEMINI_API_KEY_STORAGE, trimmed);
}

export function clearStoredApiKey(): void {
  removeStorage(GEMINI_API_KEY_STORAGE);
}

export function getStoredModel(): string {
  return readStorage(GEMINI_MODEL_STORAGE)?.trim() ?? '';
}

export function setStoredModel(modelName: string): void {
  const trimmed = modelName.trim();
  if (!trimmed) {
    removeStorage(GEMINI_MODEL_STORAGE);
    return;
  }
  writeStorage(GEMINI_MODEL_STORAGE, trimmed);
}

export function clearStoredModel(): void {
  removeStorage(GEMINI_MODEL_STORAGE);
}

export function getStoredBackupModel(): string {
  return readStorage(GEMINI_BACKUP_MODEL_STORAGE)?.trim() ?? '';
}

export function setStoredBackupModel(modelName: string): void {
  const trimmed = modelName.trim();
  if (!trimmed) {
    removeStorage(GEMINI_BACKUP_MODEL_STORAGE);
    return;
  }
  writeStorage(GEMINI_BACKUP_MODEL_STORAGE, trimmed);
}

export function clearStoredBackupModel(): void {
  removeStorage(GEMINI_BACKUP_MODEL_STORAGE);
}

export function getStoredDailyRequestLimits(): Record<string, number> {
  const raw = readStorage(DAILY_REQUEST_LIMITS_STORAGE);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        result[normalizeModelStorageKey(k)] = Math.floor(v);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getStoredDailyRequestLimit(modelName: string): number | undefined {
  const key = normalizeModelStorageKey(modelName);
  if (!key) return undefined;
  const limits = getStoredDailyRequestLimits();
  return limits[key];
}

export function setStoredDailyRequestLimit(
  modelName: string,
  limit: number | null
): Record<string, number> {
  const key = normalizeModelStorageKey(modelName);
  const current = getStoredDailyRequestLimits();
  if (!key) return current;

  if (limit === null || !Number.isFinite(limit) || limit <= 0) {
    delete current[key];
  } else {
    current[key] = Math.floor(limit);
  }

  if (Object.keys(current).length === 0) {
    removeStorage(DAILY_REQUEST_LIMITS_STORAGE);
  } else {
    writeStorage(DAILY_REQUEST_LIMITS_STORAGE, JSON.stringify(current));
  }
  return current;
}

export function getStoredTheme(): ThemePreference {
  const raw = readStorage(THEME_STORAGE);
  if (raw === 'system' || raw === 'dark' || raw === 'light') {
    return raw;
  }
  return 'dark';
}

export function setStoredTheme(theme: ThemePreference): void {
  writeStorage(THEME_STORAGE, theme);
}

export function getStoredExportMode(): ExportMode {
  const raw = readStorage(EXPORT_MODE_STORAGE);
  if (raw === 'standard' || raw === 'compatibility') {
    return raw;
  }
  return 'standard';
}

export function setStoredExportMode(mode: ExportMode): void {
  writeStorage(EXPORT_MODE_STORAGE, mode);
}

export function getStoredActiveProjectId(): string | null {
  return readStorage(ACTIVE_PROJECT_STORAGE);
}

export function setStoredActiveProjectId(id: string | null): void {
  if (!id) {
    removeStorage(ACTIVE_PROJECT_STORAGE);
    return;
  }
  writeStorage(ACTIVE_PROJECT_STORAGE, id);
}

export function getStoredAutoBuild(): boolean {
  const raw = readStorage(AUTO_BUILD_STORAGE);
  if (raw === 'false') {
    return false;
  }
  return true;
}

export function setStoredAutoBuild(enabled: boolean): void {
  writeStorage(AUTO_BUILD_STORAGE, enabled ? 'true' : 'false');
}

function isFormatPreference(value: string | null): value is FormatPreference {
  return (
    value === '9:16' ||
    value === '16:9' ||
    value === '1:1' ||
    value === 'auto'
  );
}

export function getStoredDefaultFormat(): FormatPreference {
  const raw = readStorage(DEFAULT_FORMAT_STORAGE);
  return isFormatPreference(raw) ? raw : 'auto';
}

export function setStoredDefaultFormat(format: FormatPreference): void {
  writeStorage(DEFAULT_FORMAT_STORAGE, format);
}

export function getStoredProjectFormat(
  projectId: string
): FormatPreference | null {
  if (!projectId) return null;
  const raw = readStorage(`${PROJECT_FORMAT_STORAGE_PREFIX}${projectId}`);
  return isFormatPreference(raw) ? raw : null;
}

export function setStoredProjectFormat(
  projectId: string,
  format: FormatPreference
): void {
  if (!projectId) return;
  writeStorage(`${PROJECT_FORMAT_STORAGE_PREFIX}${projectId}`, format);
}

export function clearStoredProjectFormat(projectId: string): void {
  if (!projectId) return;
  removeStorage(`${PROJECT_FORMAT_STORAGE_PREFIX}${projectId}`);
}
