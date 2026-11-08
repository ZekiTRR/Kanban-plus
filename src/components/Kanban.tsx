import animateScrollTo from 'animated-scroll-to';
import classcat from 'classcat';
import update from 'immutability-helper';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/compat';
import { KanbanView } from 'src/KanbanView';
import { StateManager } from 'src/StateManager';
import { useIsAnythingDragging } from 'src/dnd/components/DragOverlay';
import { ScrollContainer } from 'src/dnd/components/ScrollContainer';
import { SortPlaceholder } from 'src/dnd/components/SortPlaceholder';
import { Sortable } from 'src/dnd/components/Sortable';
import { createHTMLDndHandlers } from 'src/dnd/managers/DragManager';
import { t } from 'src/lang/helpers';

import { DndScope } from '../dnd/components/Scope';
import { getBoardModifiers } from '../helpers/boardModifiers';
import { frontmatterKey } from '../parsers/common';
import { backgroundToCss, fontToCss } from './appearance';
import { CalendarView } from './Calendar/Calendar';
import { FilterBar } from './FilterBar';
import { Icon } from './Icon/Icon';
import { Lanes } from './Lane/Lane';
import { LaneForm } from './Lane/LaneForm';
import { TableView } from './Table/Table';
import { DateFilter, KanbanContext, SearchContext } from './context';
import { baseClassName, c, clampZoom, useSearchValue } from './helpers';
import { DataTypes } from './types';

const boardScrollTiggers = [DataTypes.Item, DataTypes.Lane];
const boardAccepts = [DataTypes.Lane];

interface KanbanProps {
  stateManager: StateManager;
  view: KanbanView;
}

function getCSSClass(frontmatter: Record<string, any>): string[] {
  const classes = [];
  if (Array.isArray(frontmatter.cssclass)) {
    classes.push(...frontmatter.cssclass);
  } else if (typeof frontmatter.cssclass === 'string') {
    classes.push(frontmatter.cssclass);
  }
  if (Array.isArray(frontmatter.cssclasses)) {
    classes.push(...frontmatter.cssclasses);
  } else if (typeof frontmatter.cssclasses === 'string') {
    classes.push(frontmatter.cssclasses);
  }

  return classes;
}

export const Kanban = ({ view, stateManager }: KanbanProps) => {
  const boardData = stateManager.useState();
  const isAnythingDragging = useIsAnythingDragging();

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateFilter | null>(null);

  const [isLaneFormVisible, setIsLaneFormVisible] = useState<boolean>(
    boardData?.children.length === 0
  );

  const filePath = stateManager.file.path;
  const maxArchiveLength = stateManager.useSetting('max-archive-size');
  const dateColors = stateManager.useSetting('date-colors');
  const tagColors = stateManager.useSetting('tag-colors');
  const enableAnimations = stateManager.useSetting('enable-animations');
  const enableZoomSetting = stateManager.useSetting('enable-zoom');
  const boardBackground = stateManager.useSetting('board-background');
  const boardFont = stateManager.useSetting('board-font');
  const boardView = view.useViewState(frontmatterKey);

  const boardBg = useMemo(
    () => backgroundToCss(stateManager.app, boardBackground),
    [stateManager, boardBackground]
  );
  const boardFontStyle = useMemo(() => fontToCss(boardFont), [boardFont]);

  // ---- Kanban Plus: board zoom (Ctrl + wheel, pinch, +/- buttons) ----
  // Stored per-view (workspace layout) so scrolling / wheel ticks never
  // rewrite the board file. Falls back to 100% when disabled.
  const enableZoom = enableZoomSetting !== false;
  const [zoomState, setZoomState] = useState<number>(() => clampZoom(view.viewSettings.zoom ?? 1));
  const zoomRef = useRef(zoomState);
  zoomRef.current = zoomState;

  const setZoom = useCallback(
    (z: number) => {
      const v = clampZoom(z);
      zoomRef.current = v;
      setZoomState(v);
      view.setViewState('zoom', v);
    },
    [view]
  );

  const zoomIn = useCallback(() => setZoom(zoomRef.current * 1.2), [setZoom]);
  const zoomOut = useCallback(() => setZoom(zoomRef.current / 1.2), [setZoom]);
  const resetZoom = useCallback(() => setZoom(1), [setZoom]);
  const zoom = enableZoom ? zoomState : 1;
  const isZoomed = zoom !== 1;

  // Wheel (Ctrl/Cmd + wheel), trackpad pinch and two-finger touch pinch.
  // Bound on the window in the capture phase so Obsidian/Chromium don't steal
  // the gesture first; only events inside this board are handled.
  useEffect(() => {
    if (!enableZoom) return;

    const win = view.getWindow() as Window & typeof globalThis;
    const container = view.containerEl;

    const isOnBoard = (target: EventTarget | null) => {
      const t = target as any;
      return !!t && typeof t.nodeType === 'number' && container.contains(t);
    };
    const isEditable = (target: EventTarget | null) => {
      const t = target as HTMLElement | null;
      return !!t?.closest?.(
        'input, textarea, select, [contenteditable="true"], .cm-editor, .markdown-source-view'
      );
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (!isOnBoard(e.target) || isEditable(e.target)) return;

      e.preventDefault();
      e.stopPropagation();
      // deltaY < 0 => zoom in. Normalize line/page deltas.
      const delta =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      setZoom(zoomRef.current * factor);
    };

    // Two-finger pinch (touch screens). One finger keeps native scrolling.
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchActive = false;

    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      if (!isOnBoard(e.target) || isEditable(e.target)) return;
      pinchStartDist = dist(e.touches[0], e.touches[1]);
      pinchStartZoom = zoomRef.current;
      pinchActive = pinchStartDist > 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchActive || e.touches.length !== 2) return;
      if (!isOnBoard(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const d = dist(e.touches[0], e.touches[1]);
      if (pinchStartDist > 0 && d > 0) {
        setZoom(pinchStartZoom * (d / pinchStartDist));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchActive = false;
    };

    win.addEventListener('wheel', onWheel, { capture: true, passive: false });
    win.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    win.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    win.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    win.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });

    return () => {
      win.removeEventListener('wheel', onWheel, { capture: true } as any);
      win.removeEventListener('touchstart', onTouchStart, { capture: true } as any);
      win.removeEventListener('touchmove', onTouchMove, { capture: true } as any);
      win.removeEventListener('touchend', onTouchEnd, { capture: true } as any);
      win.removeEventListener('touchcancel', onTouchEnd, { capture: true } as any);
    };
  }, [enableZoom, setZoom, view]);

  const closeLaneForm = useCallback(() => {
    if (boardData?.children.length > 0) {
      setIsLaneFormVisible(false);
    }
  }, [boardData?.children.length]);

  useEffect(() => {
    if (boardData?.children.length === 0 && !stateManager.hasError()) {
      setIsLaneFormVisible(true);
    }
  }, [boardData?.children.length, stateManager]);

  const onNewLane = useCallback(() => {
    rootRef.current?.win.setTimeout(() => {
      const board = rootRef.current?.getElementsByClassName(c('board'));

      if (board?.length) {
        animateScrollTo([board[0].scrollWidth, 0], {
          elementToScroll: board[0],
          speed: 300,
          minDuration: 150,
          easing: (x: number) => {
            return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
          },
        });
      }
    });
  }, []);

  useEffect(() => {
    const onSearchHotkey = (data: { commandId: string; data: string }) => {
      if (data.commandId === 'editor:open-search') {
        if (typeof data.data === 'string') {
          setIsSearching(true);
          setSearchQuery(data.data);
          setDebouncedSearchQuery(data.data);
        } else {
          setIsSearching((val) => !val);
        }
      }
    };

    const showLaneForm = () => {
      setIsLaneFormVisible(true);
    };

    const onZoom = (data: { action: 'in' | 'out' | 'reset' }) => {
      if (data?.action === 'in') zoomIn();
      else if (data?.action === 'out') zoomOut();
      else resetZoom();
    };

    view.emitter.on('hotkey', onSearchHotkey);
    view.emitter.on('showLaneForm', showLaneForm);
    view.emitter.on('zoom', onZoom);

    return () => {
      view.emitter.off('hotkey', onSearchHotkey);
      view.emitter.off('showLaneForm', showLaneForm);
      view.emitter.off('zoom', onZoom);
    };
  }, [view, zoomIn, zoomOut, resetZoom]);

  useEffect(() => {
    if (isSearching) {
      searchRef.current?.focus();
    }
  }, [isSearching]);

  useEffect(() => {
    const win = view.getWindow();
    const trimmed = searchQuery.trim();
    let id: number;

    if (trimmed) {
      id = win.setTimeout(() => {
        setDebouncedSearchQuery(trimmed);
      }, 250);
    } else {
      setDebouncedSearchQuery('');
    }

    return () => {
      win.clearTimeout(id);
    };
  }, [searchQuery, view]);

  useEffect(() => {
    if (maxArchiveLength === undefined || maxArchiveLength === -1) {
      return;
    }

    if (typeof maxArchiveLength === 'number' && boardData?.data.archive.length > maxArchiveLength) {
      stateManager.setState((board) =>
        update(board, {
          data: {
            archive: {
              $set: board.data.archive.slice(maxArchiveLength * -1),
            },
          },
        })
      );
    }
  }, [boardData?.data.archive.length, maxArchiveLength]);

  const boardModifiers = useMemo(() => {
    return getBoardModifiers(view, stateManager);
  }, [stateManager, view]);

  const kanbanContext = useMemo(() => {
    return {
      view,
      stateManager,
      boardModifiers,
      filePath,
    };
  }, [view, stateManager, boardModifiers, filePath, dateColors, tagColors]);

  const html5DragHandlers = createHTMLDndHandlers(stateManager);

  if (boardData === null || boardData === undefined)
    return (
      <div className={c('loading')}>
        <div className="sk-pulse"></div>
      </div>
    );

  if (boardData.data.errors.length > 0) {
    return (
      <div>
        <div>Error:</div>
        {boardData.data.errors.map((e, i) => {
          return (
            <div key={i}>
              <div>{e.description}</div>
              <pre>{e.stack}</pre>
            </div>
          );
        })}
      </div>
    );
  }

  const axis = boardView === 'list' ? 'vertical' : 'horizontal';
  const showFiltersBar = stateManager.useSetting('show-filters-bar');
  const enableFreeLanes = stateManager.useSetting('enable-free-lanes');
  const laneStylesForFree = stateManager.useSetting('lane-styles');
  const hasFloatingLanes =
    !!enableFreeLanes && !!laneStylesForFree?.some((s) => !!s?.pos);
  const showFiltersBarEnabled = showFiltersBar !== false;
  // CSS `zoom` scales layout + scroll correctly in Electron/Chromium.
  // Fall back to transform scale where `zoom` is unsupported (rare).
  const supportsZoom = (() => {
    try {
      return typeof document !== 'undefined' && 'zoom' in (document.body?.style || {});
    } catch {
      return false;
    }
  })();
  const zoomStyle = (
    isZoomed ? (supportsZoom ? { zoom } : undefined) : undefined
  ) as any;
  const zoomTransformStyle = (
    isZoomed && !supportsZoom
      ? { transform: `scale(${zoom})`, transformOrigin: 'top left' }
      : undefined
  ) as any;
  const boardInnerStyle = zoomStyle || zoomTransformStyle;
  const viewZoomStyle = isZoomed ? boardInnerStyle : undefined;
  const searchValue = useSearchValue(
    boardData,
    debouncedSearchQuery,
    setSearchQuery,
    setDebouncedSearchQuery,
    setIsSearching,
    tagFilter,
    setTagFilter,
    dateFilter,
    setDateFilter
  );

  return (
    <DndScope id={view.id}>
      <KanbanContext.Provider value={kanbanContext}>
        <SearchContext.Provider value={searchValue}>
          <div
            ref={rootRef}
            className={classcat([
              baseClassName,
              {
                'something-is-dragging': isAnythingDragging,
                'kp-anim': enableAnimations !== false,
              },
              boardBg.className,
              ...getCSSClass(boardData.data.frontmatter),
            ])}
            style={{ ...boardFontStyle, ...boardBg.vars }}
            {...html5DragHandlers}
          >
            {(isLaneFormVisible || boardData.children.length === 0) && (
              <LaneForm onNewLane={onNewLane} closeLaneForm={closeLaneForm} />
            )}
            {showFiltersBarEnabled && <FilterBar board={boardData} stateManager={stateManager} />}
            {isSearching && (
              <div className={c('search-wrapper')}>
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery((e.target as HTMLInputElement).value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                      (e.target as HTMLInputElement).blur();
                      setIsSearching(false);
                    }
                  }}
                  type="text"
                  className={c('filter-input')}
                  placeholder={t('Search...')}
                />
                <a
                  className={`${c('search-cancel-button')} clickable-icon`}
                  onClick={() => {
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                    setIsSearching(false);
                  }}
                  aria-label={t('Cancel')}
                >
                  <Icon name="lucide-x" />
                </a>
              </div>
            )}
            {boardView === 'table' ? (
              <div className={c('view-zoom-content')} style={viewZoomStyle}>
                <TableView boardData={boardData} stateManager={stateManager} />
              </div>
            ) : boardView === 'calendar' ? (
              <div className={c('view-zoom-content')} style={viewZoomStyle}>
                <CalendarView boardData={boardData} stateManager={stateManager} />
              </div>
            ) : (
              <ScrollContainer
                id={view.id}
                className={classcat([
                  c('board'),
                  {
                    [c('horizontal')]: boardView !== 'list',
                    [c('vertical')]: boardView === 'list',
                    'is-adding-lane': isLaneFormVisible,
                    'kp-free-layout': hasFloatingLanes,
                    'kp-zoomed': isZoomed,
                  },
                ])}
                triggerTypes={boardScrollTiggers}
              >
                <div className={c('board-zoom-content')} style={boardInnerStyle}>
                  <Sortable axis={axis}>
                    <Lanes lanes={boardData.children} collapseDir={axis} />
                    <SortPlaceholder
                      accepts={boardAccepts}
                      className={c('lane-placeholder')}
                      index={boardData.children.length}
                    />
                  </Sortable>
                </div>
              </ScrollContainer>
            )}
            {enableZoom && (
              <div className={c('zoom-controls')}>
                <a
                  className={`clickable-icon ${c('zoom-button')}`}
                  onClick={zoomOut}
                  aria-label={t('Zoom out')}
                  title={t('Zoom out')}
                >
                  <Icon name="lucide-minus" />
                </a>
                <a
                  className={`clickable-icon ${c('zoom-level')}`}
                  onClick={resetZoom}
                  aria-label={t('Reset zoom')}
                  title={t('Reset zoom')}
                >
                  {Math.round(zoom * 100)}%
                </a>
                <a
                  className={`clickable-icon ${c('zoom-button')}`}
                  onClick={zoomIn}
                  aria-label={t('Zoom in')}
                  title={t('Zoom in')}
                >
                  <Icon name="lucide-plus" />
                </a>
              </div>
            )}
          </div>
        </SearchContext.Provider>
      </KanbanContext.Provider>
    </DndScope>
  );
};
