import update from 'immutability-helper';
import type { StateManager } from 'src/StateManager';

import type { KanbanView } from '../KanbanView';
import { laneStylesAfterInsertLane } from '../components/colors';
import { generateInstanceId } from '../components/helpers';
import { Board, Item, Lane, LaneTemplate } from '../components/types';
import { insertEntity, prependEntities } from '../dnd/util/data';

export const defaultInboxTitle = 'Inbox';

/** Configured inbox list title (falls back to “Inbox”). */
export function getInboxTitle(stateManager: StateManager): string {
  const value = stateManager.getSetting('inbox-title');
  if (typeof value === 'string' && value.trim()) return value.trim();
  return defaultInboxTitle;
}

export function isInboxEnabled(stateManager: StateManager): boolean {
  return stateManager.getSetting('inbox') !== false;
}

export function isInboxLane(lane: Lane, title: string): boolean {
  return lane.data.title.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase();
}

export function getInboxLaneIndex(board: Board, title: string): number {
  return board.children.findIndex((lane) => isInboxLane(lane, title));
}

export function countInbox(board: Board, title: string): number {
  const index = getInboxLaneIndex(board, title);
  return index === -1 ? 0 : board.children[index].children.length;
}

function newInboxLane(title: string): Lane {
  return {
    ...LaneTemplate,
    id: generateInstanceId(),
    children: [],
    data: {
      title,
      shouldMarkItemsComplete: false,
    },
  };
}

/**
 * Returns the index of the inbox lane, creating it as the first lane when it
 * does not exist yet. Keeping the inbox first is the whole point — new cards
 * land there and get triaged into the rest of the board.
 */
export function ensureInboxLaneIndex(stateManager: StateManager, view: KanbanView): number {
  const title = getInboxTitle(stateManager);
  const existing = getInboxLaneIndex(stateManager.state, title);

  if (existing !== -1) return existing;

  const collapseState = view.getViewState('list-collapse') || [];
  const updateCollapse = (state: boolean[]) => {
    const next = [...state];
    next.unshift(false);
    return next;
  };

  view.setViewState('list-collapse', undefined, updateCollapse);

  stateManager.setState((board) =>
    laneStylesAfterInsertLane(
      update<Board>(insertEntity(board, [0], [newInboxLane(title)]), {
        data: { settings: { 'list-collapse': { $set: updateCollapse(collapseState) } } },
      }),
      0
    )
  );

  return 0;
}

export interface AddToInboxParams {
  stateManager: StateManager;
  view: KanbanView;
  text: string;
}

/**
 * Adds a card to the inbox (creating the list when needed). Returns true when
 * anything was added.
 */
export function addToInbox({ stateManager, view, text }: AddToInboxParams): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return false;

  const index = ensureInboxLaneIndex(stateManager, view);

  const items: Item[] = lines.map((line) =>
    update(stateManager.getNewItem(line, ' '), {
      data: { justAdded: { $set: true } },
    })
  );

  // Make sure the inbox is expanded so freshly captured cards are visible.
  const collapseState = [...(view.getViewState('list-collapse') || [])];
  const shouldExpand = !!collapseState[index];

  if (shouldExpand) {
    collapseState[index] = false;
    view.setViewState('list-collapse', collapseState);
  }

  stateManager.setState((board) => {
    let next = board;

    if (shouldExpand) {
      next = update(next, {
        data: { settings: { 'list-collapse': { $set: collapseState } } },
      });
    }

    return prependEntities(next, [index, 0], items);
  });

  return true;
}
