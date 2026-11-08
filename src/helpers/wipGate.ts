import { Notice } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

import { Board, Lane } from '../components/types';
import {
  getLaneKey,
  getWipState,
  shouldWarnOnWip,
  wipLimitPolicy,
} from './wipLimits';

export function laneOverflowNotice(stateManager: StateManager, lane: Lane) {
  const state = getWipState(stateManager, lane);

  if (!state.limit || state.current <= state.limit) return false;

  if (!shouldWarnOnWip(stateManager)) return false;

  new Notice(`${t('WIP limit exceeded')}: ${getLaneKey(lane)} (${state.current}/${state.limit})`);
  return true;
}

/**
 * Strict mode blocks, warn mode allows but notifies (unless warnings are off).
 * Returns false only when the move must be blocked.
 */
export function canInsertIntoLane(
  stateManager: StateManager,
  board: Board,
  laneIndex: number,
  count = 1
): boolean {
  const lane = board.children[laneIndex];

  if (!lane) return false;

  const state = getWipState(stateManager, lane);
  const policy = wipLimitPolicy(stateManager);

  if (!state.limit) return true;

  const nextCount = state.current + count;
  if (nextCount <= state.limit) return true;

  if (policy === 'strict') {
    new Notice(`${t('WIP limit reached')}: ${getLaneKey(lane)} (${state.current}/${state.limit})`);
    return false;
  }

  if (shouldWarnOnWip(stateManager)) {
    new Notice(`${t('WIP limit exceeded')}: ${getLaneKey(lane)} (${nextCount}/${state.limit})`);
  }

  return true;
}
