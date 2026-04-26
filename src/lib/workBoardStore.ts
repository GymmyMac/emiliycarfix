// In-memory work board store.
// All cards (Queued/InProgress/Review/Approved/Live) and activity events live here.
// Components subscribe via the `useWorkBoard` and `useActivityFeed` hooks.

import { useEffect, useState } from 'react';
import type { TaskDefinition } from './taskPrompts';

export type WorkColumn = 'queued' | 'in_progress' | 'review' | 'approved' | 'live';

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

class WorkBoardStore {
  cards: WorkCardData[] = [];
  activity: ActivityEntry[] = [];
  private listeners = new Set<Listener>();

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() { this.listeners.forEach((l) => l()); }

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
    this.activity = [entry, ...this.activity].slice(0, 200);
    this.emit();
  }
}

export const workBoard = new WorkBoardStore();

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
