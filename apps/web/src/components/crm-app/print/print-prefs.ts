import {
  type PrintEntityType,
  type PrintSection,
  defaultSelection,
  filterValidSections,
} from "./print-config";

/**
 * localStorage-backed persistence for the user's last print configurator
 * choices. Stored as a single JSON blob under `STORAGE_KEY` so that a
 * corrupt/legacy entry can be wiped atomically.
 */
const STORAGE_KEY = "crm.printPrefs";

type StoredPref = {
  sections: string[];
  includeDocuments: boolean;
};

type PrintPrefsBlob = {
  customer?: StoredPref;
  project?: StoredPref;
  reports?: StoredPref;
  tasks?: StoredPref;
};

function readBlob(): PrintPrefsBlob {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as PrintPrefsBlob;
    }
    return {};
  } catch {
    return {};
  }
}

function writeBlob(blob: PrintPrefsBlob): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    // Quota exceeded / private mode — silently ignore.
  }
}

/**
 * Load preferences for an entity type. Unknown section keys (renamed/removed
 * since last write) are filtered out. Returns sensible defaults if nothing is
 * stored yet.
 */
export function loadPrintPrefs(
  entityType: PrintEntityType,
  available: PrintSection[],
): { sections: string[]; includeDocuments: boolean } {
  const blob = readBlob();
  const stored = blob[entityType];
  if (!stored) {
    return { sections: defaultSelection(available), includeDocuments: true };
  }
  const sections = filterValidSections(entityType, stored.sections, available);
  return {
    sections: sections.length > 0 ? sections : defaultSelection(available),
    includeDocuments: stored.includeDocuments ?? true,
  };
}

export function savePrintPrefs(
  entityType: PrintEntityType,
  pref: StoredPref,
): void {
  const blob = readBlob();
  blob[entityType] = {
    sections: [...pref.sections],
    includeDocuments: pref.includeDocuments,
  };
  writeBlob(blob);
}
