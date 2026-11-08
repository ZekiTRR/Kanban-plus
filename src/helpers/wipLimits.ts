import { StateManager } from 'src/StateManager';

import { Lane } from '../components/types';

export type WipLimitPolicy = 'warn' | 'soft' | 'strict';

/** Lane titles are persisted in markdown without the "(n)" suffix. */
export function getLaneKey(lane: Lane): string {
  return lane.data.title.trim();
}

/** Stored title with the classic "(n)" WIP suffix used by the parser. */
export function laneTitleStoredValue(title: string, maxItems = 0): string {
  return maxItems > 0 ? `${title} (${maxItems})` : title;
}

/**
 * Parses a candidate lane title. Returns null when the text is not a valid
 * lane title (currently: empty after trimming).
 */
export function parseLaneTitleValue(str: string): { title: string; maxItems: number } | null {
  const value = str.trim();

  if (!value) return null;

  const match = value.match(/^(.*?)\s*\((\d+)\)$/);

  if (match) {
    return { title: match[1].trim(), maxItems: Number(match[2]) };
  }

  return { title: value, maxItems: 0 };
}

export interface WipState {
  current: number;
  limit: number | null;
  atLimit: boolean;
  exceeded: boolean;
}

function explicitLimit(
  stateManager: StateManager,
  lane: Lane
): number | null {
  const key = getLaneKey(lane);
  const limit = stateManager.getSetting('wip-limits')?.movable?.[key];

  if (typeof limit === 'number' && limit >= 0) return limit;
  if (lane.data.maxItems !== undefined) return lane.data.maxItems === 0 ? null : lane.data.maxItems;
  return lane.data.maxItems > 0 ? lane.data.maxItems : null;
}

export function getWipState(stateManager: StateManager, lane: Lane): WipState {
  const limit = explicitLimit(stateManager, lane);
  const current = lane.children.length;

  return {
    current,
    limit,
    atLimit: !!limit && current >= limit,
    exceeded: !!limit && current > limit,
  };
}

export function wipLimitPolicy(stateManager: StateManager): WipLimitPolicy {
  const enforced =
    stateManager.getSetting('wip-enforced') ??
    stateManager.getSetting('wip-limits')?.enforced;
  if (enforced) return 'strict';
  return 'warn';
}

export function shouldWarnOnWip(stateManager: StateManager): boolean {
  const warn =
    stateManager.getSetting('wip-warn') ??
    stateManager.getSetting('wip-limits')?.warn;
  return warn !== false;
}
