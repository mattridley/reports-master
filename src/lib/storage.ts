import { normalizeAppClasses } from "./classes";
import { defaultPronounSets } from "./pronouns";
import type { AppState } from "./types";

const STORAGE_KEY = "reports-master-state-v1";

export const initialState: AppState = {
  classes: [],
  subjects: [],
  teachers: [],
  students: [],
  statements: [],
  drafts: [],
  pronounSets: defaultPronounSets,
  scoreScale: {
    effort: ["1", "2", "3", "4"],
    attainment: ["Below", "Expected", "Above", "Exceptional"]
  },
  aiSettings: {
    enabled: false,
    apiKey: "",
    model: "gpt-5.4-mini"
  }
};

export async function loadState(): Promise<AppState> {
  const tauriState = await callTauri<string>("db_load_state");
  const raw = tauriState ?? localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;
  return normalizeAppClasses({ ...initialState, ...JSON.parse(raw) });
}

export async function saveState(state: AppState): Promise<void> {
  const encoded = JSON.stringify(normalizeAppClasses(state));
  localStorage.setItem(STORAGE_KEY, encoded);
  await callTauri("db_save_state", { state: encoded });
}

async function callTauri<T>(command: string, args?: Record<string, unknown>): Promise<T | undefined> {
  const invoke = (window as any).__TAURI_INTERNALS__ ? (await import("@tauri-apps/api/core")).invoke : undefined;
  if (!invoke) return undefined;
  return invoke<T>(command, args);
}
