import { moment } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { buildLinkToDailyNote } from 'src/helpers';

import { BoardModifiers } from '../../helpers/boardModifiers';
import { escapeRegExpStr } from '../helpers';
import { Item } from '../types';

export const EMOJI_DATE_ISO_REGEX = /(^|\s)(?:🛫|📅|📆|🗓|⏳|⌛)\s*\d{4}-\d{2}-\d{2}/g;

export interface ItemPeriod {
  /** First day of the period (start date, or the due date when there is no start). */
  start?: moment.Moment;
  /** Last day of the period (due date, or the start date when there is no due). */
  end?: moment.Moment;
  /** True when the card has both a start and a (different) due date. */
  isRange: boolean;
}

/** Resolve the effective period of a card from its start/due metadata. */
export function getItemPeriod(item: Item): ItemPeriod {
  const startDate = item.data.metadata.startDate;
  const dueDate = item.data.metadata.date;

  if (startDate && dueDate) {
    const start = startDate.isBefore(dueDate, 'day') ? startDate : dueDate;
    const end = startDate.isBefore(dueDate, 'day') ? dueDate : startDate;
    return { start, end, isRange: !start.isSame(end, 'day') };
  }

  if (startDate) return { start: startDate, end: startDate, isRange: false };
  if (dueDate) return { start: dueDate, end: dueDate, isRange: false };

  return { isRange: false };
}

export function hasPeriod(item: Item): boolean {
  return !!(item.data.metadata.startDate || item.data.metadata.date);
}

function regExpEscape(str: string) {
  return escapeRegExpStr(str);
}

/** Remove every date representation (date trigger and task emoji dates) from a card body. */
export function stripDates(stateManager: StateManager, titleRaw: string): string {
  const dateTrigger = regExpEscape(stateManager.getSetting('date-trigger') as string);
  // Match all supported date encodings regardless of the current link setting,
  // so switching settings never leaves stray dates behind.
  const contentMatch = '(?:\\{[^}]+\\}|\\[[^\\]]+\\]\\([^\\)]+\\)|\\[\\[[^\\]]+\\]\\])';

  let out = titleRaw;

  if (dateTrigger) {
    out = out.replace(new RegExp(`(^|\\s)${dateTrigger}${contentMatch}`, 'g'), '$1');
  }

  out = out.replace(EMOJI_DATE_ISO_REGEX, '$1');
  out = out.replace(/ {2,}/g, ' ').trim();

  return out;
}

/** Appends metadata text to the first line of a card body. */
function appendToFirstLine(titleRaw: string, text: string): string {
  const nl = titleRaw.search(/\r?\n/);

  if (nl === -1) {
    return `${titleRaw} ${text}`.trim();
  }

  const firstLine = titleRaw.slice(0, nl).trimEnd();
  return `${firstLine} ${text}${titleRaw.slice(nl)}`;
}

export interface SetItemDatesParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  path: Path;
  item: Item;
  /** Start of the period. Falsy clears the start date. */
  start?: moment.Moment | null;
  /** Due/end of the period. Falsy clears the due date. */
  due?: moment.Moment | null;
  /** Existing task check state, to keep emoji fields on the first line. */
}

/**
 * Writes a card's start/due dates back into its markdown:
 * - a single date uses the board's date trigger (`@{...}`) for compatibility;
 * - a period uses the Tasks emoji syntax (`🛫 start … 📅 due`) which the
 *   plugin already parses natively (no Tasks plugin required).
 */
export function setItemDates({
  stateManager,
  boardModifiers,
  path,
  item,
  start,
  due,
}: SetItemDatesParams) {
  const titleRaw = stripDates(stateManager, item.data.titleRaw);
  const parts: string[] = [];

  if (start && due) {
    parts.push(`🛫 ${start.format('YYYY-MM-DD')}`);
    parts.push(`📅 ${due.format('YYYY-MM-DD')}`);
  } else if (due) {
    const dateFormat = stateManager.getSetting('date-format') as string;
    const dateTrigger = stateManager.getSetting('date-trigger') as string;
    const shouldLinkDates = stateManager.getSetting('link-date-to-daily-note');
    const formatted = due.format(dateFormat);
    const wrapped = shouldLinkDates
      ? buildLinkToDailyNote(stateManager.app, formatted)
      : `{${formatted}}`;

    parts.push(`${dateTrigger}${wrapped}`);
  } else if (start) {
    parts.push(`🛫 ${start.format('YYYY-MM-DD')}`);
  }

  const nextTitle = parts.length ? appendToFirstLine(titleRaw, parts.join(' ')) : titleRaw;

  boardModifiers.updateItem(path, stateManager.updateItemContent(item, nextTitle));
}

/** Shifts a card's existing period by a number of days (calendar drags). */
export function shiftItemPeriodByDays(
  params: SetItemDatesParams,
  days: number
) {
  const { start, due } = params;

  if (!start && !due) return;

  setItemDates({
    ...params,
    start: start ? start.clone().add(days, 'day') : null,
    due: due ? due.clone().add(days, 'day') : null,
  });
}
