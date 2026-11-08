import { Menu, Modal, Notice, moment } from 'obsidian';
import classcat from 'classcat';
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
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { t } from 'src/lang/helpers';

import { KanbanContext, SearchContext } from '../context';
import { c } from '../helpers';
import { Board, Item } from '../types';
import { CardDetailModal } from '../Item/CardDetailModal';
import { getItemPeriod, setItemDates } from '../Item/period';
import { coverCss, getCardCoverFor } from '../cover';
import { generateInstanceId } from '../helpers';
import {
  CardDependency,
  DependencyType,
  findCardByBlockId,
  getDependencies,
  getDependencyFor,
  removeDependency,
  setDependency,
} from './dependencies';

export type TimelineScale = 'day' | 'week' | 'month' | 'year';

const PX_PER_DAY: Record<TimelineScale, number> = {
  day: 56,
  week: 28,
  month: 12,
  year: 4,
};

const LANE_WIDTH = 190;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 36;

const SCALE_LABEL: Record<TimelineScale, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

interface TimelineEntry {
  item: Item;
  path: Path;
  laneIndex: number;
  laneTitle: string;
  laneColor?: string;
  start: moment.Moment;
  end: moment.Moment;
  isRange: boolean;
}

function dateKey(m: moment.Moment): string {
  return m.format('YYYY-MM-DD');
}

class DependencyModal extends Modal {
  constructor(
    app: any,
    private board: Board,
    private currentId: string,
    private onPick: (dependsOn: string, type: DependencyType) => void
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: t('Add dependency') });

    const typeSelect = contentEl.createEl('select');
    typeSelect.createEl('option', { text: 'Finish → Start (FS)', value: 'FS' });
    typeSelect.createEl('option', { text: 'Start → Start (SS)', value: 'SS' });
    typeSelect.createEl('option', { text: 'Finish → Finish (FF)', value: 'FF' });

    const cardSelect = contentEl.createEl('select');
    cardSelect.style.marginTop = '8px';
    this.board.children.forEach((lane) =>
      lane.children.forEach((item) => {
        if (item.data.blockId === this.currentId) return;
        const opt = cardSelect.createEl('option', {
          text: `${lane.data.title}: ${item.data.title || item.data.titleRaw.split('\n')[0]}`,
          value: item.data.blockId || item.id,
        });
        opt.dataset.itemId = item.id;
      })
    );

    const row = contentEl.createDiv({ cls: 'modal-button-container' });
    const cancel = row.createEl('button', { text: t('Cancel') });
    cancel.addEventListener('click', () => this.close());
    const apply = row.createEl('button', { text: t('Apply') });
    apply.addClass('mod-cta');
    apply.addEventListener('click', () => {
      const value = cardSelect.value;
      if (!value) return;
      const found = findCardByBlockId(this.board, value);
      const blockId = found?.item.data.blockId || value;
      this.onPick(blockId, typeSelect.value as DependencyType);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export const TimelineView = memo(function TimelineView({
  boardData,
  stateManager,
}: {
  boardData: Board;
  stateManager: StateManager;
}) {
  const { view, boardModifiers } = useContext(KanbanContext);
  const search = useContext(SearchContext);

  const storedScale = stateManager.getSetting('timeline-scale') as unknown as TimelineScale;
  const [scale, setScale] = useState<TimelineScale>(() =>
    storedScale === 'day' || storedScale === 'week' || storedScale === 'month' || storedScale === 'year'
      ? storedScale
      : 'week'
  );

  useEffect(() => {
    stateManager.setState((board: Board) => ({
      ...board,
      data: {
        ...board.data,
        settings: { ...board.data.settings, 'timeline-scale': scale },
      },
    }));
  }, [scale, stateManager]);

  const pxPerDay = PX_PER_DAY[scale];
  const dragRef = useRef<{
    path: Path;
    mode: 'move' | 'left' | 'right';
    startX: number;
    origStart: moment.Moment;
    origEnd: moment.Moment;
    origLeft: number;
    origWidth: number;
    moved: boolean;
    el: HTMLElement | null;
  } | null>(null);

  const collect = useCallback((): { dated: TimelineEntry[]; undated: { item: Item; path: Path; laneTitle: string }[] } => {
    const dated: TimelineEntry[] = [];
    const undated: { item: Item; path: Path; laneTitle: string }[] = [];

    boardData.children.forEach((lane, laneIndex) => {
      const laneStyles = stateManager.getSetting('lane-styles') as
        | Array<{ color?: string }>
        | undefined;
      lane.children.forEach((item, itemIndex) => {
        if (search?.isFiltering && !search.items.has(item)) return;
        const path: Path = [laneIndex, itemIndex];
        const period = getItemPeriod(item);

        if (!period.start || !period.end || !period.start.isValid() || !period.end.isValid()) {
          undated.push({ item, path, laneTitle: lane.data.title });
          return;
        }

        dated.push({
          item,
          path,
          laneIndex,
          laneTitle: lane.data.title,
          laneColor: laneStyles?.[laneIndex]?.color,
          start: period.start.clone().startOf('day'),
          end: period.end.clone().startOf('day'),
          isRange: period.isRange,
        });
      });
    });

    dated.sort((a, b) => a.start.diff(b.start) || a.end.diff(b.end));
    return { dated, undated };
  }, [boardData, search, stateManager]);

  const { dated, undated } = useMemo(collect, [collect]);

  const range = useMemo(() => {
    const today = moment().startOf('day');
    if (!dated.length) {
      return { start: today.clone().subtract(30, 'days'), end: today.clone().add(30, 'days') };
    }

    let min = today.clone().subtract(30, 'days');
    let max = today.clone().add(30, 'days');

    dated.forEach((entry) => {
      if (entry.start.isBefore(min, 'day')) min = entry.start.clone();
      if (entry.end.isAfter(max, 'day')) max = entry.end.clone();
    });

    return { start: min, end: max.add(1, 'day') };
  }, [dated]);

  const totalDays = Math.max(1, range.end.diff(range.start, 'days'));
  const totalWidth = totalDays * pxPerDay;

  const xFor = useCallback(
    (date: moment.Moment) => LANE_WIDTH + date.startOf('day').diff(range.start, 'days') * pxPerDay,
    [pxPerDay, range.start]
  );

  const BAR_HEIGHT = 28;
  const BAR_GAP = 4;

  /** Greedy stacking: overlapping bars in the same list get separate slots. */
  const slotsByItemId = useMemo(() => {
    const map = new Map<string, number>();
    boardData.children.forEach((_, laneIndex) => {
      const entries = dated
        .filter((entry) => entry.laneIndex === laneIndex)
        .sort((a, b) => a.start.diff(b.start) || a.end.diff(b.end));
      const slotEnds: moment.Moment[] = [];

      entries.forEach((entry) => {
        let slot = slotEnds.findIndex((end) => entry.start.isAfter(end, 'day'));
        if (slot === -1) {
          slot = slotEnds.length;
          slotEnds.push(entry.end.clone());
        } else {
          slotEnds[slot] = entry.end.clone();
        }
        map.set(entry.item.id, slot);
      });
    });
    return map;
  }, [boardData, dated]);

  const laneSlotCounts = useMemo(() => {
    const counts = new Map<number, number>();
    slotsByItemId.forEach((slot, itemId) => {
      const entry = dated.find((candidate) => candidate.item.id === itemId);
      if (!entry) return;
      counts.set(entry.laneIndex, Math.max(1, (counts.get(entry.laneIndex) || 0), slot + 1));
    });
    return counts;
  }, [dated, slotsByItemId]);

  const laneHeights = useMemo(() => {
    return boardData.children.map((_, laneIndex) => {
      const slots = laneSlotCounts.get(laneIndex) || 1;
      return Math.max(ROW_HEIGHT, slots * (BAR_HEIGHT + BAR_GAP) + 8);
    });
  }, [boardData, laneSlotCounts]);

  const laneTops = useMemo(() => {
    const tops: number[] = [];
    let y = HEADER_HEIGHT;
    laneHeights.forEach((height) => {
      tops.push(y);
      y += height;
    });
    return tops;
  }, [laneHeights]);

  const yForEntry = useCallback(
    (entry: TimelineEntry) =>
      (laneTops[entry.laneIndex] ?? HEADER_HEIGHT) + (slotsByItemId.get(entry.item.id) ?? 0) * (BAR_HEIGHT + BAR_GAP) + 4,
    [laneTops, slotsByItemId]
  );

  const yForLane = useCallback((laneIndex: number) => laneTops[laneIndex] ?? HEADER_HEIGHT, [laneTops]);
  const rowsHeight = HEADER_HEIGHT + laneHeights.reduce((sum, height) => sum + height, 0);

  const layoutByBlockId = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; laneIndex: number }>();
    dated.forEach((entry) => {
      const blockId = entry.item.data.blockId;
      if (!blockId) return;
      const x = xFor(entry.start);
      const w = Math.max(pxPerDay, (entry.end.diff(entry.start, 'days') + 1) * pxPerDay);
      map.set(blockId, { x, y: yForEntry(entry), w, laneIndex: entry.laneIndex });
    });
    return map;
  }, [dated, pxPerDay, xFor, yForEntry]);

  const dependencies = getDependencies(stateManager);

  const depPaths = useMemo(() => {
    const paths: { d: string; label: string; key: string }[] = [];

    Object.entries(dependencies).forEach(([cardId, dep]) => {
      const from = layoutByBlockId.get(dep.dependsOn);
      const to = layoutByBlockId.get(cardId);
      if (!from || !to) return;

      const fromX = dep.type === 'SS' ? from.x : from.x + from.w;
      const toX = dep.type === 'FF' ? to.x + to.w : to.x;
      const fromY = from.y + 14;
      const toY = to.y + 14;
      const midX = fromX + 18;

      paths.push({
        key: `${cardId}->${dep.dependsOn}`,
        d: `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`,
        label: dep.type,
      });
    });

    return paths;
  }, [dependencies, layoutByBlockId]);

  const ticks = useMemo(() => {
    const out: { x: number; label: string; isMajor: boolean }[] = [];
    const cursor = range.start.clone();

    while (cursor.isBefore(range.end, 'day')) {
      let label = '';
      let isMajor = false;

      if (scale === 'year') {
        if (cursor.date() === 1 && cursor.month() === 0) {
          label = cursor.format('YYYY');
          isMajor = true;
        }
      } else if (scale === 'month') {
        if (cursor.date() === 1) {
          label = cursor.format('MMM');
          isMajor = true;
        }
      } else if (scale === 'week') {
        if (cursor.day() === 1) {
          label = cursor.format('D MMM');
          isMajor = true;
        }
      } else {
        label = cursor.format('D');
        isMajor = true;
      }

      if (label) out.push({ x: xFor(cursor), label, isMajor });
      cursor.add(1, 'day');
    }

    return out;
  }, [range, scale, xFor]);

  const todayX = xFor(moment().startOf('day'));

  const getItemAtPath = useCallback(
    (path: Path) => boardData.children[path[0]]?.children[path[1]],
    [boardData]
  );

  const ensureBlockId = useCallback(
    (path: Path, item: Item): string | null => {
      if (item.data.blockId) return item.data.blockId;
      const id = generateInstanceId(6);
      boardModifiers.updateItem(
        path,
        stateManager.updateItemContent(
          { ...item, data: { ...item.data, blockId: id } },
          item.data.titleRaw
        )
      );
      return id;
    },
    [boardModifiers, stateManager]
  );

  const commitMove = useCallback(
    (path: Path, deltaDays: number) => {
      const item = getItemAtPath(path);
      if (!item || !deltaDays) return;

      const startDate = item.data.metadata.startDate;
      const dueDate = item.data.metadata.date;

      if (startDate && dueDate) {
        const period = getItemPeriod(item);
        setItemDates({
          stateManager,
          boardModifiers,
          path,
          item,
          start: period.start!.clone().add(deltaDays, 'day'),
          due: period.end!.clone().add(deltaDays, 'day'),
        });
        return;
      }

      if (dueDate) {
        setItemDates({
          stateManager,
          boardModifiers,
          path,
          item,
          start: null,
          due: dueDate.clone().add(deltaDays, 'day'),
        });
        return;
      }

      if (startDate) {
        setItemDates({
          stateManager,
          boardModifiers,
          path,
          item,
          start: startDate.clone().add(deltaDays, 'day'),
          due: null,
        });
      }
    },
    [getItemAtPath, stateManager, boardModifiers]
  );

  const commitResize = useCallback(
    (path: Path, mode: 'left' | 'right', newStart: moment.Moment, newEnd: moment.Moment) => {
      const item = getItemAtPath(path);
      if (!item) return;

      const startDate = item.data.metadata.startDate;
      const dueDate = item.data.metadata.date;

      if (mode === 'left') {
        if (newStart.isAfter(newEnd, 'day')) newStart = newEnd.clone();
        setItemDates({
          stateManager,
          boardModifiers,
          path,
          item,
          start: newStart,
          due: dueDate || (startDate ? newEnd : newEnd),
        });
      } else {
        if (newEnd.isBefore(newStart, 'day')) newEnd = newStart.clone();
        setItemDates({
          stateManager,
          boardModifiers,
          path,
          item,
          start: startDate || (dueDate ? newStart : newStart),
          due: newEnd,
        });
      }
    },
    [getItemAtPath, stateManager, boardModifiers]
  );

  const onBarPointerDown = useCallback(
    (e: JSX.TargetedPointerEvent<HTMLDivElement>, entry: TimelineEntry, mode: 'move' | 'left' | 'right') => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        path: entry.path,
        mode,
        startX: e.clientX,
        origStart: entry.start.clone(),
        origEnd: entry.end.clone(),
        origLeft: el.offsetLeft,
        origWidth: el.offsetWidth,
        moved: false,
        el,
      };
    },
    []
  );

  const onBarPointerMove = useCallback(
    (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || !drag.el) return;
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 3) drag.moved = true;

      if (drag.mode === 'move') {
        drag.el.style.transform = `translateX(${dx}px)`;
      } else if (drag.mode === 'left') {
        drag.el.style.left = `${drag.origLeft + dx}px`;
        drag.el.style.width = `${Math.max(pxPerDay, drag.origWidth - dx)}px`;
      } else {
        drag.el.style.width = `${Math.max(pxPerDay, drag.origWidth + dx)}px`;
      }
    },
    [pxPerDay]
  );

  const onBarPointerUp = useCallback(
    (e: JSX.TargetedPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const dx = e.clientX - drag.startX;

      if (!drag.moved) {
        const entry = dated.find(
          (candidate) => candidate.path[0] === drag.path[0] && candidate.path[1] === drag.path[1]
        );
        if (entry) new CardDetailModal(view, stateManager, entry.item).open();
        return;
      }

      const deltaDays = Math.round(dx / pxPerDay);

      if (!deltaDays) return;

      if (drag.mode === 'move') {
        commitMove(drag.path, deltaDays);
      } else if (drag.mode === 'left') {
        commitResize(drag.path, 'left', drag.origStart.clone().add(deltaDays, 'day'), drag.origEnd.clone());
      } else {
        commitResize(drag.path, 'right', drag.origStart.clone(), drag.origEnd.clone().add(deltaDays, 'day'));
      }
    },
    [commitMove, commitResize, dated, pxPerDay, stateManager, view]
  );

  const onBarContextMenu = useCallback(
    (e: JSX.TargetedMouseEvent<HTMLDivElement>, entry: TimelineEntry) => {
      e.preventDefault();
      e.stopPropagation();

      const menu = new Menu();
      const blockId = entry.item.data.blockId;

      (['FS', 'SS', 'FF'] as DependencyType[]).forEach((type) => {
        menu.addItem((item) =>
          item.setTitle(`${t('Add dependency')} (${type})`).onClick(() => {
            const currentId = ensureBlockId(entry.path, entry.item);
            if (!currentId) return;
            new DependencyModal(stateManager.app, boardData, currentId, (dependsOn, chosenType) => {
              const targetType = chosenType || type;
              if (dependsOn !== currentId && findCardByBlockId(boardData, dependsOn)) {
                setDependency(stateManager, currentId, dependsOn, targetType);
              }
            }).open();
          })
        );
      });

      if (blockId && getDependencyFor(stateManager, blockId)) {
        menu.addItem((item) =>
          item.setTitle(t('Remove dependency')).onClick(() => removeDependency(stateManager, blockId))
        );
      }

      menu.addItem((item) =>
        item.setTitle(t('Open card')).onClick(() => {
          new CardDetailModal(view, stateManager, entry.item).open();
        })
      );

      menu.showAtMouseEvent(e as unknown as MouseEvent);
    },
    [boardData, ensureBlockId, stateManager, view]
  );

  const onSetScale = useCallback(
    (next: TimelineScale) => {
      setScale(next);
    },
    []
  );

  const onUndatedClick = useCallback(
    (item: Item) => {
      new CardDetailModal(view, stateManager, item).open();
    },
    [stateManager, view]
  );

  const onUndatedAssignToday = useCallback(
    (item: Item, path: Path) => {
      const today = moment();
      setItemDates({ stateManager, boardModifiers, path, item, start: null, due: today });
    },
    [stateManager, boardModifiers]
  );

  const itemStyles = stateManager.getSetting('item-styles') as
    | Record<string, { color?: string }>
    | undefined;

  return (
    <div className={c('timeline')}>
      <div className={c('timeline-toolbar')}>
        <span className={c('timeline-toolbar-title')}>{t('Timeline')}</span>
        <div className={c('timeline-scale-group')}>
          {(Object.keys(SCALE_LABEL) as TimelineScale[]).map((key) => (
            <button
              key={key}
              className={classcat([c('timeline-scale-button'), { 'is-active': scale === key }])}
              onClick={() => onSetScale(key)}
            >
              {t(SCALE_LABEL[key] as any)}
            </button>
          ))}
        </div>
        <span className={c('timeline-range-label')}>
          {range.start.format('D MMM YYYY')} — {range.end.format('D MMM YYYY')}
        </span>
      </div>

      <div className={c('timeline-scroll')}>
        <div
          className={c('timeline-canvas')}
          style={{ width: `${LANE_WIDTH + totalWidth}px`, height: `${rowsHeight + 8}px` }}
        >
          <div
            className={c('timeline-header')}
            style={{ width: `${LANE_WIDTH + totalWidth}px`, height: `${HEADER_HEIGHT}px` }}
          >
            <div className={c('timeline-lane-corner')} style={{ width: `${LANE_WIDTH}px` }}>
              {t('List')}
            </div>
            {ticks.map((tick, index) => (
              <div
                key={`${tick.label}-${index}`}
                className={classcat([c('timeline-tick'), { 'is-major': tick.isMajor }])}
                style={{ left: `${tick.x}px` }}
              >
                {tick.label}
              </div>
            ))}
          </div>

          <div
            className={c('timeline-today-line')}
            style={{ left: `${todayX}px`, top: `${HEADER_HEIGHT}px`, bottom: '0' }}
          >
            <span className={c('timeline-today-label')}>{moment().format('D MMM')}</span>
          </div>

          <svg
            className={c('timeline-deps')}
            width={LANE_WIDTH + totalWidth}
            height={rowsHeight}
            style={{ top: '0', left: '0' }}
          >
            <defs>
              <marker
                id="kp-dep-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--interactive-accent)" />
              </marker>
            </defs>
            {depPaths.map((path) => (
              <g key={path.key}>
                <path
                  d={path.d}
                  fill="none"
                  stroke="var(--interactive-accent)"
                  strokeWidth="1.5"
                  markerEnd="url(#kp-dep-arrow)"
                />
                <text x="0" y="0" className={c('timeline-dep-label')} />
              </g>
            ))}
          </svg>

          {boardData.children.map((lane, laneIndex) => {
            const laneEntries = dated.filter((entry) => entry.laneIndex === laneIndex);
            return (
              <div
                key={lane.id}
                className={c('timeline-row')}
                style={{ top: `${yForLane(laneIndex)}px`, height: `${laneHeights[laneIndex] || ROW_HEIGHT}px` }}
              >
                <div
                  className={c('timeline-lane-label')}
                  style={{ width: `${LANE_WIDTH}px` }}
                >
                  <span
                    className={c('timeline-lane-dot')}
                    style={{ backgroundColor: laneEntries[0]?.laneColor || 'var(--interactive-accent)' }}
                  />
                  <span className={c('timeline-lane-title')}>{lane.data.title}</span>
                </div>
                <div className={c('timeline-row-track')}>
                  {laneEntries.map((entry) => {
                    const x = xFor(entry.start);
                    const w = Math.max(pxPerDay, (entry.end.diff(entry.start, 'days') + 1) * pxPerDay);
                    const entryBlockId = entry.item.data.blockId;
                    const color = entryBlockId ? itemStyles?.[entryBlockId]?.color : undefined;
                    const cover = getCardCoverFor(stateManager, entryBlockId);
                    const dep = getDependencyFor(stateManager, entryBlockId);

                    return (
                      <div
                        key={entry.item.id}
                        className={classcat([c('timeline-bar'), { 'is-range': entry.isRange }])}
                        style={{
                          left: `${x - LANE_WIDTH}px`,
                          top: `${(slotsByItemId.get(entry.item.id) ?? 0) * 32 + 4}px`,
                          height: '28px',
                          width: `${w}px`,
                          ...(color ? { backgroundColor: color } : {}),
                          ...(cover && cover.source !== 'color' && cover.source !== 'gradient'
                            ? (coverCss(stateManager.app, cover) as any)
                            : {}),
                        }}
                        data-path={`${entry.path.join(',')}`}
                        onPointerDown={(e) => onBarPointerDown(e, entry, 'move')}
                        onPointerMove={onBarPointerMove}
                        onPointerUp={onBarPointerUp}
                        onContextMenu={(e) => onBarContextMenu(e, entry)}
                      >
                        <span
                          className={c('timeline-bar-resize-left')}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onBarPointerDown(e as any, entry, 'left');
                          }}
                        />
                        <span className={c('timeline-bar-title')}>
                          {entry.item.data.title || entry.item.data.titleRaw.split('\n')[0]}
                        </span>
                        <span className={c('timeline-bar-dates')}>
                          {entry.start.format('D MMM')} → {entry.end.format('D MMM')}
                        </span>
                        {dep && <span className={c('timeline-bar-dep')}>{dep.type}</span>}
                        <span
                          className={c('timeline-bar-resize-right')}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onBarPointerDown(e as any, entry, 'right');
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className={c('timeline-undated')}>
          <div className={c('timeline-undated-title')}>
            {t('No date')} ({undated.length})
          </div>
          <div className={c('timeline-undated-list')}>
            {undated.map(({ item, path, laneTitle }) => (
              <div key={item.id} className={c('timeline-undated-chip')}>
                <span
                  className={c('timeline-undated-chip-title')}
                  onClick={() => onUndatedClick(item)}
                >
                  {laneTitle}: {item.data.title || item.data.titleRaw.split('\n')[0]}
                </span>
                <button
                  className={c('timeline-undated-chip-assign')}
                  onClick={() => onUndatedAssignToday(item, path)}
                >
                  {t('Add date')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
