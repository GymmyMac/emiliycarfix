// In-memory work board store, mirrored to localStorage so cards + activity
// survive page refreshes, accidental tab closes, and laptop sleeps.
//
// All cards (Queued/InProgress/Review/Approved/Live) and activity events live here.
// Components subscribe via the `useWorkBoard` and `useActivityFeed` hooks.
//
// Persistence model:
// - Every mutation writes the full state to localStorage under STORAGE_KEY.
// - On module load, we hydrate from localStorage (best-effort — bad JSON is ignored).
// - Wiki batch cards persist their in-flight `progress`, `results`, and `wikiBatchState`
//   (vehicles + cursor + samples) so the WikiBriefPanel can resume after a refresh.

import { useEffect, useState } from 'react';
import type { TaskDefinition } from './taskPrompts';

export type WorkColumn = 'queued' | 'in_progress' | 'review' | 'approved' | 'live';

// Subset of DeployResult / SamplePreview / PriorityVehicle kept loose to avoid
// pulling the wiki workflow types into this shared store.
export interface WikiBatchState {
  vehicles: any[];           // PriorityVehicle[]
  samples: any[];            // SamplePreview[]
  cursor: number;            // index into vehicles for next deploy
  approved: boolean;         // true once user clicked "Approve & Run"
  results: any[];            // DeployResult[]
}

export interface WorkCardData {
  id: string;
  taskType: string;
  task: TaskDefinition;
  title: string;
  briefText: string;
  column: WorkColumn;
  createdAt: number;
  // Wiki-specific batch state
  batchLimit?: number;
  progress?: { current: number; total: number; currentLabel?: string };
  results?: { live: number; skipped: number; failed: number };
  wikiBatchState?: WikiBatchState; // durable in-flight state for resume
  // Generic content state
  resultText?: string;
  errorText?: string;
}

export type ActivityIcon = '✓' | '✗' | '⟳' | '▶' | '👁' | '✏' | '📋' | '⏹';

export interface ActivityEntry {
  id: string;
  ts: number;
  icon: ActivityIcon;
  text: string;
}

type Listener = () => void;

const STORAGE_KEY = 'emily.workBoard.v1';
const ACTIVITY_LIMIT = 200;

interface PersistedState {
  cards: WorkCardData[];
  activity: ActivityEntry[];
}

function loadFromStorage(): PersistedState {
  if (typeof window === 'undefined') return { cards: [], activity: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { cards: [], activity: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    };
  } catch (e) {
    console.warn('[workBoard] failed to hydrate from localStorage', e);
    return { cards: [], activity: [] };
  }
}

class WorkBoardStore {
  cards: WorkCardData[] = [];
  activity: ActivityEntry[] = [];
  private listeners = new Set<Listener>();
  private saveScheduled = false;

  constructor() {
    const { cards, activity } = loadFromStorage();
    this.cards = cards;
    this.activity = activity;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
    this.scheduleSave();
  }

  // Coalesce rapid bursts of mutations (e.g. batch loop) into a single write.
  private scheduleSave() {
    if (this.saveScheduled || typeof window === 'undefined') return;
    this.saveScheduled = true;
    queueMicrotask(() => {
      this.saveScheduled = false;
      try {
        const payload: PersistedState = { cards: this.cards, activity: this.activity };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn('[workBoard] failed to persist to localStorage', e);
      }
    });
  }

  addCard(card: Omit<WorkCardData, 'id' | 'createdAt'>) {
    const full: WorkCardData = { id: crypto.randomUUID(), createdAt: Date.now(), ...card };
    this.cards = [full, ...this.cards];
    this.emit();
    return full;
  }
  updateCard(id: string, patch: Partial<WorkCardData>) {
    this.cards = this.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
    this.emit();
  }
  removeCard(id: string) {
    this.cards = this.cards.filter((c) => c.id !== id);
    this.emit();
  }
  moveCard(id: string, column: WorkColumn) {
    this.updateCard(id, { column });
  }

  pushActivity(icon: ActivityIcon, text: string) {
    const entry: ActivityEntry = { id: crypto.randomUUID(), ts: Date.now(), icon, text };
    this.activity = [entry, ...this.activity].slice(0, ACTIVITY_LIMIT);
    this.emit();
  }

  /** Hard reset — useful for debugging from the console: `workBoard.reset()` */
  reset() {
    this.cards = [];
    this.activity = [];
    this.emit();
  }
}

export const workBoard = new WorkBoardStore();

// Expose for ad-hoc debugging from the browser console.
if (typeof window !== 'undefined') {
  (window as any).workBoard = workBoard;
}

export function useWorkBoard(): WorkCardData[] {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = workBoard.subscribe(() => force((n) => n + 1));
    return () => { unsub(); };
  }, []);
  return workBoard.cards;
}

export function useActivityFeed(): ActivityEntry[] {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = workBoard.subscribe(() => force((n) => n + 1));
    return () => { unsub(); };
  }, []);
  return workBoard.activity;
}
