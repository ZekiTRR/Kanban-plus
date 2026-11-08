import classcat from 'classcat';
import update from 'immutability-helper';
import {
  Component,
  MarkdownRenderer as ObsidianMarkdownRenderer,
  Menu,
  getLinkpath,
  moment,
} from 'obsidian';
import {
  JSX,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/compat';
import { KanbanView } from 'src/KanbanView';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { getTaskStatusDone, toggleTask } from 'src/parsers/helpers/inlineMetadata';
import { t } from 'src/lang/helpers';

import { constructDatePicker, constructMenuDatePickerOnChange } from '../Item/helpers';
import { openPeriodEditor } from '../Item/PeriodModal';
import { getItemPeriod, setItemDates, shiftItemPeriodByDays } from '../Item/period';
import { KanbanContext } from '../context';
import { c, escapeRegExpStr } from '../helpers';
import { Icon } from '../Icon/Icon';
import { Board, Item } from '../types';

const MIME_TYPE = 'application/x-kanban-plus-item';
const MAX_RANGE_DAYS = 366;

const markdownSyntaxRe = /\[\[|\]\(|(^|\s)[*_`#>~]/;

/**
 * Renders a calendar chip title with Obsidian's markdown renderer so wiki
 * links ([[note]]), aliases and markdown links behave like real links.
 * Falls back to plain text for the common case (no markdown syntax) to keep
 * the calendar fast.
 */
const CalendarChipTitle = memo(function CalendarChipTitle({
  markdown,
  view,
}: {
  markdown: string;
  view: KanbanView;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<Component | null>(null);
  const hasMarkdown = markdownSyntaxRe.test(markdown);

  useEffect(() => {
    const el = elRef.current;

    if (!el || !hasMarkdown) return;

    const component = new Component();
    componentRef.current = component;
    view.addChild(component);

    el.empty();

    const renderPromise = ObsidianMarkdownRenderer.render(
      view.app,
      markdown,
      el,
      view.file.path,
      component
    );

    if (renderPromise && typeof renderPromise.then === 'function') {
      renderPromise
        .then(() => {
          // Mark unresolved links the same way Obsidian does.
          el.findAll('a.internal-link').forEach((a) => {
            const href = a.getAttr('data-href') || a.getAttr('href');
            if (!href) return;
            const path = getLinkpath(href);
            const file = view.app.metadataCache.getFirstLinkpathDest(path, view.file.path);
            a.toggleClass('is-unresolved', !file);
          });
        })
        .catch(() => {
          /* ignore render errors (malformed markdown, missing embeds) */
        });
    }

    return () => {
      componentRef.current = null;
      view.removeChild(component);
    };
  }, [markdown, hasMarkdown, view]);

  if (!hasMarkdown) {
    return <span className={c('calendar-item-title')}>{markdown || '…'}</span>;
  }

  return (
    <div
      ref={elRef}
      className={classcat([c('calendar-item-title'), c('calendar-item-markdown')])}
    />
  );
});

interface CalendarViewProps {
  boardData: Board;
  stateManager: StateManager;
}

interface CalendarItem {
  item: Item;
  path: Path;
  laneTitle?: string;
  laneColor?: string;
  /** Day offset inside the item's range (0 = first day). */
  rangeIndex?: number;
  rangeLength?: number;
}

interface CalItemProps {
  entry: CalendarItem;
  stateManager: StateManager;
  onEditDate: (entry: CalendarItem, coordinates: { x: number; y: number }) => void;
}

/** Compact card representation inside a calendar cell. */
const CalendarItemCard = memo(function CalendarItemCard({
  entry,
  stateManager,
  onEditDate,
}: CalItemProps) {
  const { item, path } = entry;
  const { boardModifiers, view } = useContext(KanbanContext);

  const onCheckboxChange = useCallback(() => {
    const updates = toggleTask(item, stateManager.file);

    if (updates) {
      const [itemStrings, checkChars, thisIndex] = updates;
      const replacements: Item[] = itemStrings.map((str, i) => {
        const next = stateManager.getNewItem(str, checkChars[i]);
        if (i === thisIndex) next.id = item.id;
        return next;
      });

      boardModifiers.replaceItem(path, replacements);
    } else {
      const isCompleting = item.data.checkChar === ' ';
      let titleRaw = item.data.titleRaw;

      if (isCompleting) {
        const doneDate = moment().format(stateManager.getSetting('date-format') as string);
        const nlMatch = titleRaw.match(/\r?\n/);

        if (nlMatch) {
          const idx = titleRaw.indexOf(nlMatch[0]);
          titleRaw = `${titleRaw.slice(0, idx)} ✅ ${doneDate}${titleRaw.slice(idx)}`;
        } else {
          titleRaw = `${titleRaw} ✅ ${doneDate}`;
        }
      } else {
        titleRaw = titleRaw.replace(/(^|\s)✅\s*\S+/, '$1').replace(/ {2,}/g, ' ');
      }

      const base = update(item, {
        data: {
          checkChar: { $set: isCompleting ? getTaskStatusDone() : ' ' },
          checked: { $set: isCompleting },
        },
      });

      boardModifiers.updateItem(path, stateManager.updateItemContent(base, titleRaw));
    }
  }, [item, path, stateManager, boardModifiers]);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      const menu = new Menu();

      menu.addItem((i) => {
        i.setIcon('lucide-calendar-range')
          .setTitle(t('Set period'))
          .onClick(() => openPeriodEditor(stateManager, boardModifiers, item, path));
      });

      menu.addItem((i) => {
        i.setIcon('lucide-calendar-check')
          .setTitle(t('Edit date'))
          .onClick(() => onEditDate(entry, { x: e.clientX, y: e.clientY }));
      });

      if (item.data.metadata.date || item.data.metadata.startDate) {
        menu.addItem((i) => {
          i.setIcon('lucide-calendar-x')
            .setTitle(t('Clear period'))
            .onClick(() =>
              setItemDates({
                stateManager,
                boardModifiers,
                path,
                item,
                start: null,
                due: null,
              })
            );
        });
      }

      menu.addSeparator();

      menu.addItem((i) => {
        i.setIcon('lucide-archive')
          .setTitle(t('Archive card'))
          .onClick(() => boardModifiers.archiveItem(path));
      });

      menu.addItem((i) => {
        i.setIcon('lucide-trash-2')
          .setTitle(t('Delete card'))
          .onClick(() => boardModifiers.deleteEntity(path));
      });

      menu.showAtPosition({ x: e.clientX, y: e.clientY });
    },
    [entry, item, path, stateManager, boardModifiers, onEditDate]
  );

  const title = useMemo(() => {
    const dateTrigger = stateManager.getSetting('date-trigger');
    const timeTrigger = stateManager.getSetting('time-trigger');
    const dt = escapeRegExpStr(dateTrigger as string);
    const tt = escapeRegExpStr(timeTrigger as string);
    const firstLine = (item.data.titleRaw.split(/\r?\n/)[0] || '').trim();

    return firstLine
      .replace(new RegExp(`(^|\\s)${dt}\\[[^\\]]+\\]`, 'g'), '')
      .replace(new RegExp(`(^|\\s)${dt}\\[[^\\]]+\\]\\([^)]+\\)`, 'g'), '')
      .replace(new RegExp(`(^|\\s)${dt}\\{[^}]+\\}`, 'g'), '')
      .replace(new RegExp(`(^|\\s)${tt}\\{[^}]+\\}`, 'g'), '')
      .replace(/(^|\s)[📅📆🗓⏳⌛]\s*\d{4}-\d{2}-\d{2}/g, '$1')
      .replace(/(^|\s)✅\s*\S+/g, '$1')
      .replace(/(^|\s)🛫\s*\d{4}-\d{2}-\d{2}/g, '$1')
      .replace(/\s+\^[a-zA-Z0-9-]+$/, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  }, [item.data.titleRaw, stateManager]);

  const onDragStart = useCallback(
    (e: JSX.TargetedDragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(MIME_TYPE, JSON.stringify(path));
      e.dataTransfer.setData('text/plain', title);
      e.dataTransfer.effectAllowed = 'move';
    },
    [path, title]
  );

  const isRange = (entry.rangeLength ?? 1) > 1;
  const isRangeStart = isRange && entry.rangeIndex === 0;
  const isRangeEnd = isRange && entry.rangeIndex === (entry.rangeLength ?? 1) - 1;

  return (
    <div
      className={classcat([
        c('calendar-item'),
        {
          'is-complete': item.data.checked,
          'is-range': isRange,
          'is-range-start': isRangeStart,
          'is-range-end': isRangeEnd,
          'is-range-middle': isRange && !isRangeStart && !isRangeEnd,
        },
      ])}
      draggable={true}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      data-path={path.join(',')}
      title={entry.laneTitle || undefined}
    >
      {entry.laneColor && (
        <span
          className={c('calendar-item-dot')}
          style={`background:${entry.laneColor}`}
          aria-hidden="true"
        />
      )}
      {(!isRange || isRangeStart) && (
        <input
          type="checkbox"
          className="task-list-item-checkbox"
          checked={item.data.checked}
          data-task={item.data.checkChar}
          onChange={onCheckboxChange}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {isRangeStart && <span className={c('calendar-range-arrow')}>→</span>}
      <CalendarChipTitle markdown={title} view={view} />
    </div>
  );
});

interface DaySelection {
  start: moment.Moment;
  end: moment.Moment;
}

function normalizeSelection(a: moment.Moment, b: moment.Moment): DaySelection {
  return a.isAfter(b, 'day') ? { start: b.clone(), end: a.clone() } : { start: a.clone(), end: b.clone() };
}

export const CalendarView = memo(function CalendarView({
  boardData,
  stateManager,
}: CalendarViewProps) {
  const { view, boardModifiers } = useContext(KanbanContext);
  const weekStart = stateManager.useSetting('date-picker-week-start') ?? 0;
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState<moment.Moment>(() => moment().startOf('month'));

  // ---- Kanban Plus: drag-select a range of days, then drop a card on it ----
  const [selection, setSelection] = useState<DaySelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectAnchor = useRef<moment.Moment | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setIsSelecting(false);
    selectAnchor.current = null;
  }, []);

  useEffect(() => {
    if (!isSelecting) return;

    const win = view.getWindow();
    const onUp = () => {
      setIsSelecting(false);
      selectAnchor.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    win.addEventListener('mouseup', onUp);
    win.addEventListener('blur', onUp);
    win.addEventListener('keydown', onKey);

    return () => {
      win.removeEventListener('mouseup', onUp);
      win.removeEventListener('blur', onUp);
      win.removeEventListener('keydown', onKey);
    };
  }, [isSelecting, clearSelection, view]);

  const onCellMouseDown = useCallback(
    (e: MouseEvent, day: moment.Moment) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest(`.${c('calendar-item')}`)) return;

      e.preventDefault();
      selectAnchor.current = day.clone().startOf('day');
      // Selection only appears once the pointer moves to another day, so a
      // plain click doesn't leave a stray one-day selection around.
      setSelection(null);
      setIsSelecting(true);
    },
    []
  );

  const onCellMouseEnter = useCallback(
    (day: moment.Moment) => {
      if (!isSelecting || !selectAnchor.current) return;
      if (day.isSame(selectAnchor.current, 'day') && !selection) return;
      setSelection(normalizeSelection(selectAnchor.current, day));
    },
    [isSelecting, selection]
  );

  const flattenItems = useCallback((): {
    byDate: Map<string, CalendarItem[]>;
    unscheduled: CalendarItem[];
  } => {
    const byDate = new Map<string, CalendarItem[]>();
    const unscheduled: CalendarItem[] = [];
    const laneStyles = stateManager.getSetting('lane-styles') as
      | Array<{ color?: string }>
      | undefined;

    boardData.children.forEach((lane, laneIdx) => {
      lane.children.forEach((item, itemIdx) => {
        const path: Path = [laneIdx, itemIdx];
        const laneTitle = lane.data.title;
        const laneColor = laneStyles?.[laneIdx]?.color;
        const period = getItemPeriod(item);

        if (!period.start || !period.end || !period.start.isValid() || !period.end.isValid()) {
          unscheduled.push({ item, path, laneTitle, laneColor });
          return;
        }

        const start = period.start.clone().startOf('day');
        const end = period.end.clone().startOf('day');
        const span = Math.max(0, Math.min(end.diff(start, 'days'), MAX_RANGE_DAYS));
        const rangeLength = span + 1;

        for (let i = 0; i <= span; i++) {
          const day = start.clone().add(i, 'day');
          const key = day.format('YYYY-MM-DD');
          if (!byDate.has(key)) byDate.set(key, []);
          byDate.get(key).push({
            item,
            path,
            laneTitle,
            laneColor,
            rangeIndex: i,
            rangeLength,
          });
        }
      });
    });

    return { byDate, unscheduled };
  }, [boardData, stateManager]);

  const { byDate, unscheduled } = useMemo(flattenItems, [flattenItems]);

  const weekdays = useMemo(() => {
    const names = moment.weekdaysShort();
    return Array.from({ length: 7 }, (_, i) => names[(weekStart + i) % 7]);
  }, [weekStart]);

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = anchor.clone();
      const dow = (start.day() - weekStart + 7) % 7;
      start.subtract(dow, 'days');

      return Array.from({ length: 7 }, (_, i) => start.clone().add(i, 'days'));
    }

    const first = anchor.clone().startOf('month');
    const gridStart = first.clone().subtract((first.day() - weekStart + 7) % 7, 'days');

    return Array.from({ length: 42 }, (_, i) => gridStart.clone().add(i, 'days'));
  }, [anchor, mode, weekStart]);

  const onEditDate = useCallback(
    (entry: CalendarItem, coordinates: { x: number; y: number }) => {
      constructDatePicker(
        view.getWindow(),
        stateManager,
        coordinates,
        constructMenuDatePickerOnChange({
          stateManager,
          boardModifiers,
          item: entry.item,
          hasDate: !!entry.item.data.metadata.date,
          path: entry.path,
        }),
        entry.item.data.metadata.date?.toDate()
      );
    },
    [view, stateManager, boardModifiers]
  );

  const getItemAtPath = useCallback(
    (path: Path) => {
      const lane = boardData.children[path[0]];
      return lane?.children[path[1]];
    },
    [boardData]
  );

  /** Moves (or creates) a card's deadline so the dropped day is the period end. */
  const applyDropToDay = useCallback(
    (path: Path, day: moment.Moment) => {
      const item = getItemAtPath(path);
      if (!item) return;

      const startDate = item.data.metadata.startDate;
      const dueDate = item.data.metadata.date;
      const target = day.clone().startOf('day');

      if (startDate && dueDate) {
        // Preserve the duration: shift the whole span so it ends on the drop day.
        const period = getItemPeriod(item);
        const delta = target.diff(period.end, 'days');
        shiftItemPeriodByDays(
          {
            stateManager,
            boardModifiers,
            path,
            item,
            start: period.start,
            due: period.end,
          },
          delta
        );
        return;
      }

      setItemDates({
        stateManager,
        boardModifiers,
        path,
        item,
        start: startDate && startDate.isBefore(target, 'day') ? startDate : null,
        due: target,
      });
    },
    [getItemAtPath, stateManager, boardModifiers]
  );

  const applySelectionAsPeriod = useCallback(
    (path: Path, range: DaySelection) => {
      const item = getItemAtPath(path);
      if (!item) return;

      setItemDates({
        stateManager,
        boardModifiers,
        path,
        item,
        start: range.start.clone().startOf('day'),
        due: range.end.clone().startOf('day'),
      });
    },
    [getItemAtPath, stateManager, boardModifiers]
  );

  const isInsideSelection = useCallback(
    (day: moment.Moment) => {
      if (!selection) return false;
      return day.isBetween(selection.start, selection.end, 'day', '[]');
    },
    [selection]
  );

  const onCellDrop = useCallback(
    (e: JSX.TargetedDragEvent<HTMLDivElement>, day: moment.Moment) => {
      // internal calendar drag: don't let the root HTML5 drop handler create a duplicate card
      e.stopPropagation();
      e.preventDefault();
      const raw = e.dataTransfer.getData(MIME_TYPE);

      if (!raw) return;

      let path: Path;

      try {
        path = JSON.parse(raw) as Path;
      } catch (err) {
        return;
      }

      if (!Array.isArray(path) || typeof path[0] !== 'number' || typeof path[1] !== 'number') {
        return;
      }

      const range = selection;
      const targetDay = day.clone();
      // Defer the (relatively heavy) board update to the next tick so the
      // browser can release the native drag ghost immediately. Otherwise the
      // card visually hangs under the cursor until the re-render finishes.
      view.getWindow().setTimeout(() => {
        if (range && targetDay.isBetween(range.start, range.end, 'day', '[]')) {
          applySelectionAsPeriod(path, range);
        } else {
          applyDropToDay(path, targetDay);
        }

        clearSelection();
      }, 0);
    },
    [
      selection,
      applySelectionAsPeriod,
      applyDropToDay,
      clearSelection,
      view,
    ]
  );

  const onUnscheduledDrop = useCallback(
    (e: JSX.TargetedDragEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const raw = e.dataTransfer.getData(MIME_TYPE);

      if (!raw) return;

      let path: Path;

      try {
        path = JSON.parse(raw) as Path;
      } catch (err) {
        return;
      }

      const item = getItemAtPath(path);
      if (!item) return;

      view.getWindow().setTimeout(() => {
        setItemDates({ stateManager, boardModifiers, path, item, start: null, due: null });
      }, 0);
    },
    [getItemAtPath, stateManager, boardModifiers, view]
  );

  const onCellDragOver = useCallback((e: JSX.TargetedDragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(MIME_TYPE)) {
      e.stopPropagation();
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const today = moment().startOf('day');
  // In week mode the header must describe the *visible* week (derived from the
  // aligned week start), and use the ISO week number — moment's locale `week()`
  // uses Sunday-based numbering and can be off by one.
  const calendarLabel = useMemo(() => {
    if (mode !== 'week') {
      return anchor.format('MMMM YYYY');
    }

    const first = days[0];
    const last = days[6];
    // Number the week by its first day (ISO weeks) — this matches what users
    // expect for "the week of <date>" and stays stable across the week even
    // when the week starts on Sunday.
    const weekNumber = first.clone().isoWeek();

    return `${t('Week')} ${weekNumber} · ${first.format('D MMM')} — ${last.format('D MMM YYYY')}`;
  }, [mode, anchor, days]);
  const showHint = !!selection;

  return (
    <div
      className={classcat([c('calendar'), `is-${mode}`])}
      onDragOver={(e) => {
        // Keep internal calendar drags away from the board-level HTML5 drop
        // handler (it would start its own drag session and leave the native
        // ghost/overlay hanging until its timeout).
        if (e.dataTransfer.types.includes(MIME_TYPE)) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes(MIME_TYPE)) {
          e.stopPropagation();
        }
      }}
    >
      <div className={c('calendar-header')}>
        <div className={c('calendar-nav')}>
          <a
            className={`${c('calendar-nav-button')} clickable-icon`}
            onClick={() => {
              clearSelection();
              setAnchor(anchor.clone().subtract(1, mode === 'month' ? 'month' : 'week'));
            }}
            aria-label={t('Previous')}
          >
            <Icon name="lucide-chevron-left" />
          </a>
          <a
            className={`${c('calendar-nav-button')} clickable-icon`}
            onClick={() => {
              clearSelection();
              setAnchor(moment().startOf(mode === 'month' ? 'month' : 'day'));
            }}
            aria-label={t('Today')}
          >
            <span>{t('Today')}</span>
          </a>
          <a
            className={`${c('calendar-nav-button')} clickable-icon`}
            onClick={() => {
              clearSelection();
              setAnchor(anchor.clone().add(1, mode === 'month' ? 'month' : 'week'));
            }}
            aria-label={t('Next')}
          >
            <Icon name="lucide-chevron-right" />
          </a>
          <span className={c('calendar-title')}>{calendarLabel}</span>
        </div>
        <div className={c('calendar-modes')}>
          <a
            className={classcat([
              c('calendar-mode-button'),
              'clickable-icon',
              { 'is-active': mode === 'month' },
            ])}
            onClick={() => {
              clearSelection();
              setMode('month');
              setAnchor(anchor.clone().startOf('month'));
            }}
          >
            {t('Month')}
          </a>
          <a
            className={classcat([
              c('calendar-mode-button'),
              'clickable-icon',
              { 'is-active': mode === 'week' },
            ])}
            onClick={() => {
              clearSelection();
              setMode('week');
              // Show the current week rather than the week of the 1st of the month.
              setAnchor(moment().startOf('day'));
            }}
          >
            {t('Week')}
          </a>
        </div>
      </div>

      {showHint && selection && (
        <div className={c('calendar-range-hint')}>
          <Icon name="lucide-calendar-range" />
          <span>
            {t('Period')}: {selection.start.format('D MMM')} — {selection.end.format('D MMM')}
          </span>
          <span className={c('calendar-range-hint-tip')}>
            {t('Drop a card here to set it as the period')}
          </span>
          <a
            className={`clickable-icon ${c('calendar-range-hint-clear')}`}
            onClick={clearSelection}
            aria-label={t('Clear filters')}
          >
            <Icon name="lucide-x" />
          </a>
        </div>
      )}

      <div className={c('calendar-body')}>
        <div className={c('calendar-grid')}>
          <div className={c('calendar-weekdays')}>
            {weekdays.map((d) => (
              <div key={d} className={c('calendar-weekday')}>
                {d}
              </div>
            ))}
          </div>

          <div className={classcat([c('calendar-days'), mode === 'week' ? 'is-week' : 'is-month'])}>
            {days.map((day) => {
              const key = day.format('YYYY-MM-DD');
              const dayItems = byDate.get(key) || [];
              const isOutside = mode === 'month' && day.month() !== anchor.month();
              const isToday = day.isSame(today, 'day');
              const inSelection = isInsideSelection(day);

              return (
                <div
                  key={key}
                  className={classcat([
                    c('calendar-cell'),
                    {
                      'is-outside': isOutside,
                      'is-today': isToday,
                      'is-weekend': day.day() === 0 || day.day() === 6,
                      'is-selected': inSelection,
                      'is-selection-start':
                        !!selection && day.isSame(selection.start, 'day'),
                      'is-selection-end': !!selection && day.isSame(selection.end, 'day'),
                      'is-selecting': isSelecting,
                    },
                  ])}
                  onMouseDown={(e) => onCellMouseDown(e, day)}
                  onMouseEnter={() => onCellMouseEnter(day)}
                  onDragOver={onCellDragOver}
                  onDrop={(e) => onCellDrop(e, day)}
                >
                  <div className={c('calendar-cell-date')}>
                    <span>{day.format('D')}</span>
                    {isToday && <span className={c('calendar-today-label')}>{t('today')}</span>}
                  </div>
                  <div className={c('calendar-cell-items')}>
                    {dayItems.map((entry) => (
                      <CalendarItemCard
                        key={entry.item.id}
                        entry={entry}
                        stateManager={stateManager}
                        onEditDate={onEditDate}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={c('calendar-unscheduled')}
          onDragOver={onCellDragOver}
          onDrop={onUnscheduledDrop}
        >
          <div className={c('calendar-unscheduled-title')}>{t('Unscheduled')}</div>
          {unscheduled.map((entry) => (
            <CalendarItemCard
              key={entry.item.id}
              entry={entry}
              stateManager={stateManager}
              onEditDate={onEditDate}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
