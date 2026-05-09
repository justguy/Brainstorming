/**
 * useIdeaOpenModes — orchestrates which ideas are "open" and in what mode.
 *
 * Two surfaces share the same identity-keyed slot:
 *   - bloom: a card that anchors at the idea's panel position on the canvas.
 *           Multiple blooms may be open simultaneously, so users can drag/drop
 *           conversation turns between them.
 *   - focus: a full-screen takeover. Only one focus at a time. When promoted,
 *           the idea's bloom is replaced by the focus overlay (state preserved).
 *           When focus closes, the idea returns to bloom mode.
 *
 * The hook also exposes guidance-note visibility — wired from the persisted
 * setting and toggleable via the header button.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSettings, setSettings } from '../../src/storage/settings';

export type IdeaOpenMode = 'bloom' | 'focus';

export interface IdeaOpenSlot {
  ideaId: string;
  mode: IdeaOpenMode;
  /** Set when the bloom was demoted from focus, so closing focus returns it here. */
  fromFocus?: boolean;
}

export interface UseIdeaOpenModesResult {
  openIdeas: IdeaOpenSlot[];
  bloomedIdeaIds: string[];
  focusedIdeaId: string | null;
  guidanceVisible: boolean;
  isOpen: (ideaId: string) => IdeaOpenMode | null;
  openInBloom: (ideaId: string) => void;
  promoteToFocus: (ideaId: string) => void;
  demoteToBloom: (ideaId: string) => void;
  closeIdea: (ideaId: string) => void;
  closeAll: () => void;
  toggleGuidance: () => void;
}

export function useIdeaOpenModes(): UseIdeaOpenModesResult {
  const [openIdeas, setOpenIdeas] = useState<IdeaOpenSlot[]>([]);
  const [guidanceVisible, setGuidanceVisible] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    void getSettings().then(s => {
      if (!cancelled) setGuidanceVisible(s.guidanceNotesEnabled);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const openInBloom = useCallback((ideaId: string) => {
    setOpenIdeas(current => {
      const existing = current.find(s => s.ideaId === ideaId);
      if (existing) {
        if (existing.mode === 'bloom') return current;
        // Already focused — no-op, focus dominates bloom.
        return current;
      }
      return [...current, { ideaId, mode: 'bloom' }];
    });
  }, []);

  const promoteToFocus = useCallback((ideaId: string) => {
    setOpenIdeas(current => {
      // Demote any existing focus to bloom (only one focus at a time).
      const next = current.map<IdeaOpenSlot>(slot => (
        slot.mode === 'focus' && slot.ideaId !== ideaId
          ? { ideaId: slot.ideaId, mode: 'bloom' }
          : slot
      ));
      const existing = next.find(s => s.ideaId === ideaId);
      if (existing) {
        return next.map<IdeaOpenSlot>(slot => (
          slot.ideaId === ideaId ? { ideaId, mode: 'focus', fromFocus: true } : slot
        ));
      }
      return [...next, { ideaId, mode: 'focus', fromFocus: true }];
    });
  }, []);

  const demoteToBloom = useCallback((ideaId: string) => {
    setOpenIdeas(current => current.map<IdeaOpenSlot>(slot => (
      slot.ideaId === ideaId ? { ideaId, mode: 'bloom' } : slot
    )));
  }, []);

  const closeIdea = useCallback((ideaId: string) => {
    setOpenIdeas(current => current.filter(slot => slot.ideaId !== ideaId));
  }, []);

  const closeAll = useCallback(() => setOpenIdeas([]), []);

  const isOpen = useCallback((ideaId: string): IdeaOpenMode | null => {
    const slot = openIdeas.find(s => s.ideaId === ideaId);
    return slot?.mode ?? null;
  }, [openIdeas]);

  const toggleGuidance = useCallback(() => {
    setGuidanceVisible(current => {
      const next = !current;
      void setSettings({ guidanceNotesEnabled: next }).catch(() => {});
      return next;
    });
  }, []);

  const focusedIdeaId = openIdeas.find(s => s.mode === 'focus')?.ideaId ?? null;
  const bloomedIdeaIds = openIdeas.filter(s => s.mode === 'bloom').map(s => s.ideaId);

  return {
    openIdeas,
    bloomedIdeaIds,
    focusedIdeaId,
    guidanceVisible,
    isOpen,
    openInBloom,
    promoteToFocus,
    demoteToBloom,
    closeIdea,
    closeAll,
    toggleGuidance,
  };
}
