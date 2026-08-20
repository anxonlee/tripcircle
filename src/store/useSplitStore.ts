import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { SplitExpense, SplitPerson } from '../lib/costSplit';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Splitting the cost of the day (PRD F16, §3.7).
 *
 * One split at a time, matching every other thing this app calls "the day":
 * the selection, the arrangement, the pins and the Start day step are all
 * singular and persisted, because a person has one day out at a time. There
 * is no trip object to hang a history off, and inventing one to store old
 * splits would be a bigger change than the feature is worth.
 *
 * People here are names typed on this phone. There are no accounts, so
 * nobody is invited, notified, or able to disagree from their own device —
 * the split is one person's record of what happened, shared as text if it
 * is shared at all.
 */

export type { SplitExpense, SplitPerson } from '../lib/costSplit';

interface SplitState {
  people: SplitPerson[];
  expenses: SplitExpense[];
  addPerson: (name: string) => void;
  renamePerson: (id: string, name: string) => void;
  /** Removes the person and everything they paid for. */
  removePerson: (id: string) => void;
  addExpense: (expense: Omit<SplitExpense, 'id'>) => void;
  removeExpense: (id: string) => void;
  /** Back to nothing, for the next day out. */
  clearSplit: () => void;
  hydrated: boolean;
}

let counter = 0;
/** Local-only ids. Not cryptographic and never leave the device. */
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export const useSplitStore = create<SplitState>()(
  persist(
    (set) => ({
      people: [],
      expenses: [],
      addPerson: (name) =>
        set((s) => ({
          people: [...s.people, { id: newId('p'), name: name.trim() || 'Someone' }],
        })),
      renamePerson: (id, name) =>
        set((s) => ({
          people: s.people.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name } : p
          ),
        })),
      removePerson: (id) =>
        set((s) => ({
          people: s.people.filter((p) => p.id !== id),
          /*
           * Their expenses go too. An expense whose payer is gone would be
           * money in the total that belongs to nobody, and the settle-up
           * would silently redistribute it — the total on screen would stop
           * matching the sum of what anyone put in.
           */
          expenses: s.expenses.filter((e) => e.payerId !== id),
        })),
      addExpense: (expense) =>
        set((s) => ({ expenses: [...s.expenses, { ...expense, id: newId('e') }] })),
      removeExpense: (id) =>
        set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),
      clearSplit: () => set({ people: [], expenses: [] }),
      hydrated: false,
    }),
    {
      name: 'tripcircle-split',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ people: s.people, expenses: s.expenses }),
      onRehydrateStorage: () => () => {
        useSplitStore.setState({ hydrated: true });
      },
    }
  )
);
