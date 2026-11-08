import { moment } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';

import { Board } from '../components/types';

export interface CardComment {
  ts: number;
  text: string;
  author?: string;
}

export interface CardEvent {
  ts: number;
  text: string;
}

export interface CardMeta {
  comments: CardComment[];
  events: CardEvent[];
  created?: number;
}

export interface ChecklistItem {
  text: string;
  checkChar: string;
  checked: boolean;
  indent: string;
  comment?: string;
}

export interface CardParts {
  firstLine: string;
  description: string;
  checklist: ChecklistItem[];
}

export function getCardMeta(stateManager: StateManager, blockId?: string): CardMeta {
  if (!blockId) return { comments: [], events: [] };

  const all = stateManager.getSetting('card-meta') || {};
  const meta = all[blockId];

  return {
    comments: meta?.comments || [],
    events: meta?.events || [],
    created: meta?.created,
  };
}

export function saveCardMeta(stateManager: StateManager, blockId: string, meta: CardMeta) {
  if (!blockId) return;

  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    const all = { ...(settings['card-meta'] || {}) };

    if (!meta.comments.length && !meta.events.length && !meta.created) {
      delete all[blockId];
    } else {
      all[blockId] = meta;
    }

    if (!Object.keys(all).length) delete settings['card-meta'];
    else settings['card-meta'] = all;

    return {
      ...board,
      data: {
        ...board.data,
        settings,
      },
    };
  });
}

const checklistLineRe = /^(\s*)([-+*])\s+\[(.)\]\s?(.*)$/;
const checklistCommentRe = /^\s{2,}>\s?(.*)$/;

export function parseCardParts(titleRaw: string): CardParts {
  const lines = titleRaw.split(/\r?\n/);
  const firstLine = lines.shift() || '';
  const description: string[] = [];
  const checklist: ChecklistItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(checklistLineRe);

    if (match) {
      const item: ChecklistItem = {
        indent: match[1] || '',
        checkChar: match[3],
        checked: match[3] !== ' ',
        text: match[4] || '',
      };

      const next = lines[i + 1];

      if (next && checklistCommentRe.test(next)) {
        item.comment = next.match(checklistCommentRe)[1];
        i++;
      }

      checklist.push(item);
      continue;
    }

    description.push(line);
  }

  return {
    firstLine,
    description: description.join('\n').trim(),
    checklist,
  };
}

export function buildCardBody(parts: CardParts): string {
  const blocks: string[] = [parts.firstLine];
  const description = parts.description.trim();

  if (description) blocks.push('', description);

  if (parts.checklist.length) {
    const lines: string[] = [];

    parts.checklist.forEach((item) => {
      const indent = item.indent || '';
      const check = item.checked ? (item.checkChar === ' ' ? 'x' : item.checkChar) : ' ';

      lines.push(`${indent}- [${check}] ${item.text}`.trimEnd());

      if (item.comment) {
        lines.push(`    > ${item.comment.replace(/\r?\n/g, ' ')}`);
      }
    });

    blocks.push('', lines.join('\n'));
  }

  return blocks.join('\n').trimEnd();
}

export function formatCardTime(ts: number): string {
  return moment(ts).fromNow();
}

export function appendCardEvent(meta: CardMeta, text: string) {
  meta.events.push({ ts: Date.now(), text });
}

export function findItemById(board: Board, id: string) {
  for (let laneIndex = 0; laneIndex < board.children.length; laneIndex++) {
    const lane = board.children[laneIndex];

    for (let itemIndex = 0; itemIndex < lane.children.length; itemIndex++) {
      const item = lane.children[itemIndex];

      if (item.id === id) {
        return { item, path: [laneIndex, itemIndex] as Path };
      }
    }
  }

  return null;
}
