import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  canEditVisit,
  newVisitId,
  type ContextTags,
  type Visit,
  type WouldGoAgain,
} from '../domain/diary';
import { deleteVisitPhoto } from '../services/photoStore';

/**
 * The visit log — the diary's system of record (PRD §3A).
 *
 * Local-only and private by default (§3A.6). Nothing here is uploaded,
 * shared, or aggregated off-device in Phase 1; sharing a recap is an
 * explicit user action that composes from this data, never a sync of it.
 *
 * Only the raw log is persisted. Every aggregate (visit counts, recency,
 * would-go-again trends) is derived on read by `domain/diary.ts`, so there
 * is exactly one source of truth and no counter that can drift out of sync
 * with the visits it claims to count.
 */

/** Everything a stamp can carry beyond the required answer. */
export interface StampDraft {
  placeId: string;
  /**
   * Carried so the visit stays readable if the place ever stops existing.
   * The screen has it in hand; asking later may find nothing.
   */
  placeName: string;
  wouldGoAgain: WouldGoAgain;
  rating?: number;
  note?: string;
  photoUri?: string;
  contextTags?: ContextTags;
}

interface DiaryState {
  visits: Visit[];
  /** The visit just added, so the wall can animate and focus its card. */
  lastStampedVisitId: string | null;
  /** Records a visit and returns it. Timestamp is captured here, not by UI. */
  stamp: (draft: StampDraft) => Visit;
  /** Edit the optional fields of an existing visit. */
  updateVisit: (id: string, patch: Partial<Omit<Visit, 'id' | 'placeId'>>) => void;
  removeVisit: (id: string) => void;
  clearLastStamped: () => void;
  /** Replaces the log after a restore. Merging is decided by the caller. */
  replaceVisits: (visits: Visit[]) => void;
}

export const useDiaryStore = create<DiaryState>()(
  persist(
    (set, get) => ({
      visits: [],
      lastStampedVisitId: null,

      stamp: (draft) => {
        const visit: Visit = {
          id: newVisitId(),
          placeId: draft.placeId,
          placeName: draft.placeName,
          timestamp: Date.now(),
          wouldGoAgain: draft.wouldGoAgain,
          ...(draft.rating != null ? { rating: draft.rating } : {}),
          ...(draft.note ? { note: draft.note } : {}),
          ...(draft.photoUri ? { photoUri: draft.photoUri } : {}),
          ...(draft.contextTags ? { contextTags: draft.contextTags } : {}),
        };
        set((s) => ({
          visits: [...s.visits, visit],
          lastStampedVisitId: visit.id,
        }));
        return visit;
      },

      /**
       * Edits are refused once the window has passed. Enforced here rather
       * than only in the UI: a rule that lives in a screen is a suggestion.
       */
      updateVisit: (id, patch) =>
        set((s) => ({
          visits: s.visits.map((v) =>
            v.id === id && canEditVisit(v) ? { ...v, ...patch } : v
          ),
        })),

      removeVisit: (id) => {
        // Drop the visit's photo with it, or the document directory fills up
        // with files nothing references.
        deleteVisitPhoto(get().visits.find((v) => v.id === id)?.photoUri);
        set((s) => ({
          visits: s.visits.filter((v) => v.id !== id),
          lastStampedVisitId:
            get().lastStampedVisitId === id ? null : get().lastStampedVisitId,
        }));
      },

      clearLastStamped: () => set({ lastStampedVisitId: null }),

      replaceVisits: (visits) => set({ visits }),
    }),
    {
      /**
       * Keeps the old name on purpose. This is the AsyncStorage key the diary
       * lives under, not a label: renaming it does not migrate anything, it
       * points the app at an empty key and every visit already on a device
       * silently disappears. The backup format string was renamed to
       * TripCircle because a file carries its own name and old names can stay
       * readable; a storage key has no such escape.
       *
       * If this ever has to change, it needs a migration that reads the old
       * key first, not an edit.
       */
      name: 'pirt-diary',
      storage: createJSONStorage(() => AsyncStorage),
      // lastStampedVisitId is a UI cue for the current session, not history:
      // a restart should not replay the drop animation for an old stamp.
      partialize: (s) => ({ visits: s.visits }),
    }
  )
);
