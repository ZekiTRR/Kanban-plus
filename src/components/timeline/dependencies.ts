import { Notice } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

import { Board, Item } from '../types';

export type DependencyType = 'FS' | 'SS' | 'FF';

export interface CardDependency {
  type: DependencyType;
  /** Block id of the card this card depends on. */
  dependsOn: string;
}

const VALID_TYPES: DependencyType[] = ['FS', 'SS', 'FF'];

/** Normalizes stored values; legacy stub values (bare type strings) are ignored. */
export function getDependencies(
  stateManager: StateManager
): Record<string, CardDependency> {
  const raw = stateManager.getSetting('dependencies') as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return {};

  const out: Record<string, CardDependency> = {};
  Object.entries(raw).forEach(([cardId, value]) => {
    if (value && typeof value === 'object') {
      const entry = value as Partial<CardDependency>;
      if (entry.dependsOn && VALID_TYPES.includes(entry.type as DependencyType)) {
        out[cardId] = { dependsOn: entry.dependsOn, type: entry.type as DependencyType };
      }
    }
  });
  return out;
}

export function getDependencyFor(
  stateManager: StateManager,
  blockId?: string
): CardDependency | null {
  if (!blockId) return null;
  return getDependencies(stateManager)[blockId] || null;
}

/** DFS cycle check: adding card -> dependsOn must not eventually lead back to card. */
export function wouldCreateCycle(
  deps: Record<string, CardDependency>,
  cardId: string,
  dependsOn: string
): boolean {
  if (dependsOn === cardId) return true;
  const seen = new Set<string>();
  const stack = [dependsOn];

  while (stack.length) {
    const current = stack.pop() as string;
    if (current === cardId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const next = deps[current]?.dependsOn;
    if (next) stack.push(next);
  }

  return false;
}

export function setDependency(
  stateManager: StateManager,
  blockId: string,
  dependsOn: string,
  type: DependencyType
): boolean {
  if (!blockId || !dependsOn) return false;

  const deps = getDependencies(stateManager);

  if (wouldCreateCycle(deps, blockId, dependsOn)) {
    new Notice(t('Dependency would create a cycle'));
    return false;
  }

  stateManager.setState((board: Board) => ({
    ...board,
    data: {
      ...board.data,
      settings: {
        ...board.data.settings,
        dependencies: {
          ...deps,
          [blockId]: { dependsOn, type },
        },
      },
    },
  }));
  return true;
}

export function removeDependency(stateManager: StateManager, blockId: string) {
  if (!blockId) return;
  const deps = getDependencies(stateManager);
  if (!(blockId in deps)) return;
  delete deps[blockId];

  stateManager.setState((board: Board) => ({
    ...board,
    data: {
      ...board.data,
      settings: {
        ...board.data.settings,
        dependencies: deps,
      },
    },
  }));
}

/** Finds a card by block id across all lanes. */
export function findCardByBlockId(
  board: Board,
  blockId: string
): { item: Item; path: number[]; laneIndex: number } | null {
  for (let laneIndex = 0; laneIndex < board.children.length; laneIndex++) {
    const lane = board.children[laneIndex];
    for (let itemIndex = 0; itemIndex < lane.children.length; itemIndex++) {
      if (lane.children[itemIndex].data.blockId === blockId) {
        return { item: lane.children[itemIndex], path: [laneIndex, itemIndex], laneIndex };
      }
    }
  }
  return null;
}
