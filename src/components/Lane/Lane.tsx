import animateScrollTo from 'animated-scroll-to';
import classcat from 'classcat';
import update from 'immutability-helper';
import {
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/compat';
import {
  DraggableProps,
  Droppable,
  StaticDroppable,
  useNestedEntityPath,
} from 'src/dnd/components/Droppable';
import { DndManagerContext } from 'src/dnd/components/context';
import { ScrollContainer } from 'src/dnd/components/ScrollContainer';
import { SortPlaceholder } from 'src/dnd/components/SortPlaceholder';
import { Sortable, StaticSortable } from 'src/dnd/components/Sortable';
import { useDragHandle } from 'src/dnd/managers/DragManager';
import type { DragEventData } from 'src/dnd/managers/DragManager';
import { getDropDuration } from 'src/dnd/util/animation';
import { frontmatterKey } from 'src/parsers/common';
import { getTaskStatusDone } from 'src/parsers/helpers/inlineMetadata';

import { Items } from '../Item/Item';
import { ItemForm } from '../Item/ItemForm';
import { KanbanContext, SearchContext, SortContext } from '../context';
import { c, clampZoom, generateInstanceId, noop } from '../helpers';
import { laneColorToCssVars, setLanePos } from '../colors';
import { DataTypes, EditState, EditingState, Item, Lane } from '../types';
import { LaneHeader } from './LaneHeader';

const laneAccepts = [DataTypes.Item];

export interface DraggableLaneProps {
  lane: Lane;
  laneIndex: number;
  isStatic?: boolean;
  collapseDir: 'horizontal' | 'vertical';
  isCollapsed?: boolean;
}

function DraggableLaneRaw({
  isStatic,
  lane,
  laneIndex,
  collapseDir,
  isCollapsed = false,
}: DraggableLaneProps) {
  const [editState, setEditState] = useState<EditState>(EditingState.cancel);
  const [isSorting, setIsSorting] = useState(false);

  const { stateManager, boardModifiers, view } = useContext(KanbanContext);
  const search = useContext(SearchContext);

  const boardView = view.useViewState(frontmatterKey);
  const path = useNestedEntityPath(laneIndex);
  const laneWidth = stateManager.useSetting('lane-width');
  const fullListWidthSetting = stateManager.useSetting('full-list-lane-width');
  const fullWidth = boardView === 'list' && fullListWidthSetting;
  const insertionMethod = stateManager.useSetting('new-card-insertion-method');
  const laneStylesSetting = stateManager.useSetting('lane-styles');
  const showLaneColors = stateManager.useSetting('show-lane-colors');
  const laneColorBody = stateManager.useSetting('lane-color-body');
  const enableFreeLanes = stateManager.useSetting('enable-free-lanes');
  const laneColor = showLaneColors !== false ? laneStylesSetting?.[laneIndex]?.color : undefined;
  const pos = enableFreeLanes ? laneStylesSetting?.[laneIndex]?.pos : undefined;
  const isFloating = !!pos;
  const laneStyles = useMemo(
    () =>
      !(isCollapsed && collapseDir === 'horizontal') && (fullWidth || laneWidth)
        ? { width: fullWidth ? '100%' : `${laneWidth}px` }
        : undefined,
    [fullWidth, laneWidth, isCollapsed]
  );
  const laneColorVars = useMemo(
    () => laneColorToCssVars(laneColor, { tintBody: laneColorBody !== false }),
    [laneColor, laneColorBody]
  );
  const floatingStyles = useMemo(
    () =>
      pos
        ? { position: 'absolute' as const, left: `${pos.x}px`, top: `${pos.y}px` }
        : undefined,
    [pos]
  );

  const elementRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const firstRectRef = useRef<DOMRect | null>(null);
  // Rect of the lane at the moment the drag started (before DnD hides it),
  // used so detaching can animate from the row position.
  const gripDownRectRef = useRef<DOMRect | null>(null);
  // Set right before a lane is detached so the layout effect knows to reveal it
  // immediately (without the "snap back to row" frame).
  const pendingDetachRef = useRef(false);
  // Timestamp until which click-to-magnet must be ignored (set after a free drag,
  // because pointerup is followed by a click event on the grip).
  const suppressSnapUntilRef = useRef(0);

  const recordGripRect = useCallback(() => {
    const el = measureRef.current;
    gripDownRectRef.current = el ? el.getBoundingClientRect() : null;
  }, []);

  const bindHandle = useDragHandle(measureRef, dragHandleRef);

  /** Kanban Plus: snap a floating lane back into the row with a FLIP animation. */
  const magnetBack = useCallback(() => {
    const el = measureRef.current;

    if (el) {
      firstRectRef.current = el.getBoundingClientRect();
    }

    setLanePos(stateManager, laneIndex, stateManager.state.children.length, null);
  }, [stateManager, laneIndex]);

  // FLIP / settle animations for docked <-> floating transitions.
  // Runs as a layout effect so it is set up before the browser paints.
  useLayoutEffect(() => {
    const el = measureRef.current;

    if (!el) return;

    // Detach: the lane must appear exactly where it was dropped (the drag ghost
    // was already following the cursor), so no flight animation — just make sure
    // it is visible and give it a subtle "settle" pop.
    if (pendingDetachRef.current) {
      pendingDetachRef.current = false;
      firstRectRef.current = null;

      // The sort manager may not have restored the lane from `display:none` yet.
      if (el.style.display === 'none') {
        el.style.display = '';
      }

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReduced && typeof (el as any).animate === 'function') {
        try {
          (el as any).animate(
            [
              { transform: 'scale(0.98)', opacity: 0.85 },
              { transform: 'scale(1)', opacity: 1 },
            ],
            { duration: 160, easing: 'cubic-bezier(0.2, 1, 0.3, 1)' }
          );
        } catch (e) {
          /* animations are optional */
        }
      }

      return;
    }

    const first = firstRectRef.current;
    firstRectRef.current = null;

    if (!first) return;

    const last = el.getBoundingClientRect();
    // Screen deltas -> layout deltas for the transform (zoom scales transforms)
    const zoom = clampZoom((view.viewSettings?.zoom as number | undefined) ?? 1) || 1;
    const dx = (first.left - last.left) / zoom;
    const dy = (first.top - last.top) / zoom;

    if (!dx && !dy) return;

    const duration = getDropDuration({
      position: { x: first.left, y: first.top },
      destination: { x: last.left, y: last.top },
    });

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    void (el as any).offsetWidth; // force reflow
    el.style.transition = `transform ${duration}ms cubic-bezier(.2,1,.1,1)`;
    el.style.transform = '';

    const cleanup = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', cleanup);
    };

    el.addEventListener('transitionend', cleanup);
    const win = ((el as any).win || activeWindow) as Window;
    win.setTimeout(cleanup, duration + 50);
  }, [pos, view]);

  const getDetachPos = useCallback((): { x: number; y: number } | null => {
    const el = measureRef.current;
    const board = el?.closest(`.${c('board')}`) as HTMLElement | null;

    if (!el || !board) return null;

    const laneRect = el.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const zoom = clampZoom((view.viewSettings?.zoom as number | undefined) ?? 1) || 1;

    return {
      x: (laneRect.left - boardRect.left + board.scrollLeft) / zoom,
      y: (laneRect.top - boardRect.top + board.scrollTop) / zoom,
    };
  }, [view]);

  /** Kanban Plus: pointer-based repositioning for floating lanes (bypasses the sort DnD). */
  const startFloatingDrag = useCallback(
    (e: PointerEvent) => {
      if (!pos) return;

      const el = measureRef.current;

      if (!el) return;

      e.preventDefault();
      e.stopPropagation();

      const zoom = clampZoom((view.viewSettings?.zoom as number | undefined) ?? 1) || 1;
      const win = ((el as any).win || activeWindow) as Window;
      const startPointer = { x: e.clientX, y: e.clientY };
      const startPos = { x: pos.x, y: pos.y };
      let delta = { x: 0, y: 0 };
      let didMove = false;

      el.addClass('is-free-dragging');
      // Keep the lane on the compositor during the drag: transform-only updates
      // are much smoother than repeatedly mutating left/top (layout thrash).
      el.style.transition = 'none';
      el.style.willChange = 'transform';

      const onMove = (ev: PointerEvent) => {
        delta = {
          x: (ev.clientX - startPointer.x) / zoom,
          y: (ev.clientY - startPointer.y) / zoom,
        };

        if (Math.abs(delta.x) > 2 || Math.abs(delta.y) > 2) didMove = true;
        el.style.transform = `translate3d(${delta.x}px, ${delta.y}px, 0)`;
      };

      const onUp = () => {
        win.removeEventListener('pointermove', onMove);
        win.removeEventListener('pointerup', onUp);
        win.removeEventListener('pointercancel', onUp);
        el.removeClass('is-free-dragging');
        el.style.willChange = '';
        el.style.transition = '';

        if (!didMove) {
          // Simple tap on the grip: leave the lane where it is.
          el.style.transform = '';
          return;
        }

        const finalPos = {
          x: Math.max(0, Math.round(startPos.x + delta.x)),
          y: Math.max(0, Math.round(startPos.y + delta.y)),
        };

        // Commit the final position to the DOM *before* React re-renders so the
        // lane never flashes back to its old spot.
        el.style.left = `${finalPos.x}px`;
        el.style.top = `${finalPos.y}px`;
        el.style.transform = '';

        // Suppress the click that follows pointerup, otherwise releasing
        // the grip would immediately magnet the lane back into the row.
        suppressSnapUntilRef.current = Date.now() + 600;
        setLanePos(stateManager, laneIndex, stateManager.state.children.length, finalPos);
      };

      win.addEventListener('pointermove', onMove);
      win.addEventListener('pointerup', onUp);
      win.addEventListener('pointercancel', onUp);
    },
    [pos, stateManager, laneIndex, view]
  );

  const onLaneClick = useCallback(
    (e: MouseEvent) => {
      if (!isFloating) return;
      if (Date.now() < suppressSnapUntilRef.current) return;

      const target = e.target as HTMLElement;

      if (
        target.closest(
          'input, a, button, textarea, .kanban-plugin__item, .kanban-plugin__item-input-wrapper, .kanban-plugin__lane-title, .kanban-plugin__lane-settings-button-wrapper, .kanban-plugin__lane-grip, .kanban-plugin__lane-collapse, .clickable-icon'
        )
      ) {
        return;
      }

      magnetBack();
    },
    [isFloating, magnetBack]
  );

  // Kanban Plus: drag a docked lane outside the row to detach it.
  // The sortable DnD only calls onDrop when a placeholder/lane is hit;
  // dropping on empty board space yields primaryIntersection === null,
  // which we turn into a floating position at the drop point (grab-aware).
  const dndManager = useContext(DndManagerContext);
  useEffect(() => {
    if (!dndManager || !enableFreeLanes || isFloating || isStatic) return;

    const emitter: any = (dndManager as any).dragManager?.emitter;
    if (!emitter?.on) return;

    const handleDragEnd = (data: DragEventData) => {
      const { dragEntity, dragPosition, dragOrigin, dragGrabOffset, primaryIntersection } = data;
      if (!dragEntity || !dragPosition || !dragOrigin) return;
      // Normal sortable drop takes precedence (reorder)
      if (primaryIntersection) return;

      try {
        const d = dragEntity.getData();
        if (!d || d.type !== 'lane') return;
        const p = dragEntity.getPath();
        if (!p || p.length !== 1 || p[0] !== laneIndex) return;
      } catch {
        return;
      }

      // Ignore micro-drags that failed to find an intersection
      const moved = Math.hypot(dragPosition.x - dragOrigin.x, dragPosition.y - dragOrigin.y);
      if (moved < 24) return;

      const el = measureRef.current;
      const board = el?.closest(`.${c('board')}`) as HTMLElement | null;
      if (!el || !board) return;

      const win: any = view.getWindow() || activeWindow;
      const scrollX = win?.scrollX || 0;
      const scrollY = win?.scrollY || 0;
      const zoom = clampZoom((view.viewSettings?.zoom as number | undefined) ?? 1) || 1;

      // Where the cursor is holding the lane (client coords), then convert into
      // the board's layout coordinate space (zoom + scroll compensated).
      const grab = dragGrabOffset || { x: 0, y: 0 };
      const laneClientX = dragPosition.x - scrollX - grab.x;
      const laneClientY = dragPosition.y - scrollY - grab.y;

      const boardRect = board.getBoundingClientRect();
      let x = (laneClientX - boardRect.left + board.scrollLeft) / zoom;
      let y = (laneClientY - boardRect.top + board.scrollTop) / zoom;
      x = Math.max(0, x);
      y = Math.max(0, y);

      // Commit the floating position immediately so the lane appears exactly
      // where it was dropped (the ghost already followed the cursor). The
      // layout effect reveals it and plays a subtle settle animation.
      pendingDetachRef.current = true;
      gripDownRectRef.current = null;
      firstRectRef.current = null;

      setLanePos(stateManager, laneIndex, stateManager.state.children.length, {
        x: Math.round(x),
        y: Math.round(y),
      });
    };

    emitter.on('dragEnd', handleDragEnd);
    return () => {
      emitter.off('dragEnd', handleDragEnd);
    };
  }, [dndManager, enableFreeLanes, isFloating, isStatic, laneIndex, stateManager, view]);

  const shouldMarkItemsComplete = !!lane.data.shouldMarkItemsComplete;
  const isCompactPrepend = insertionMethod === 'prepend-compact';
  const shouldPrepend = isCompactPrepend || insertionMethod === 'prepend';

  const toggleIsCollapsed = useCallback(() => {
    stateManager.setState((board) => {
      const collapseState = [...view.getViewState('list-collapse')];
      collapseState[laneIndex] = !collapseState[laneIndex];
      view.setViewState('list-collapse', collapseState);
      return update(board, {
        data: { settings: { 'list-collapse': { $set: collapseState } } },
      });
    });
  }, [stateManager, laneIndex]);

  const addItems = useCallback(
    (items: Item[]) => {
      boardModifiers[shouldPrepend ? 'prependItems' : 'appendItems'](
        [...path, lane.children.length - 1],
        items.map((item) =>
          update(item, {
            data: {
              checked: {
                // Mark the item complete if we're moving into a completed lane
                $set: shouldMarkItemsComplete,
              },
              checkChar: {
                $set: shouldMarkItemsComplete ? getTaskStatusDone() : ' ',
              },
            },
          })
        )
      );

      // TODO: can we find a less brute force way to do this?
      view.getWindow().setTimeout(() => {
        const laneItems = elementRef.current?.getElementsByClassName(c('lane-items'));

        if (laneItems.length) {
          animateScrollTo([0, shouldPrepend ? 0 : laneItems[0].scrollHeight], {
            elementToScroll: laneItems[0],
            speed: 200,
            minDuration: 150,
            easing: (x: number) => {
              return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
            },
          });
        }
      });
    },
    [boardModifiers, path, lane, shouldPrepend]
  );

  const DroppableComponent = isStatic ? StaticDroppable : Droppable;
  const SortableComponent = isStatic ? StaticSortable : Sortable;
  const CollapsedDropArea = !isCollapsed || isStatic ? Fragment : Droppable;
  const dropAreaProps: DraggableProps = useMemo(() => {
    if (!isCollapsed || isStatic) return {} as any;
    const data = {
      id: generateInstanceId(),
      type: 'lane',
      accepts: [DataTypes.Item],
      acceptsSort: [DataTypes.Lane],
    };
    return {
      elementRef: elementRef,
      measureRef: measureRef,
      id: data.id,
      index: laneIndex,
      data: data,
    };
  }, [isCollapsed, laneIndex, isStatic]);

  return (
    <SortContext.Provider value={lane.data.sorted ?? null}>
      <div
        ref={measureRef}
        onClick={onLaneClick}
        className={classcat([
          c('lane-wrapper'),
          {
            'is-sorting': isSorting,
            'has-lane-color': !!laneColor,
            'kp-floating': isFloating,
            'collapse-horizontal': isCollapsed && collapseDir === 'horizontal',
            'collapse-vertical': isCollapsed && collapseDir === 'vertical',
          },
        ])}
        style={{ ...(laneStyles || {}), ...laneColorVars, ...floatingStyles }}
      >
        <div
          data-count={lane.children.length}
          ref={elementRef}
          className={classcat([c('lane'), { 'will-prepend': shouldPrepend }])}
        >
          <CollapsedDropArea {...dropAreaProps}>
            <LaneHeader
              bindHandle={isFloating ? noop : bindHandle}
              onGripPointerDown={isFloating ? startFloatingDrag : recordGripRect}
              isFloating={isFloating}
              onMagnet={magnetBack}
              getDetachPos={getDetachPos}
              laneIndex={laneIndex}
              lane={lane}
              setIsItemInputVisible={isCompactPrepend ? setEditState : undefined}
              isCollapsed={isCollapsed}
              toggleIsCollapsed={toggleIsCollapsed}
            />

            {!search?.query && !isCollapsed && shouldPrepend && (
              <ItemForm
                addItems={addItems}
                hideButton={isCompactPrepend}
                editState={editState}
                setEditState={setEditState}
              />
            )}

            {!isCollapsed && (
              <DroppableComponent
                elementRef={elementRef}
                measureRef={measureRef}
                id={lane.id}
                index={laneIndex}
                data={lane}
              >
                <ScrollContainer
                  className={classcat([c('lane-items'), c('vertical')])}
                  id={lane.id}
                  index={laneIndex}
                  isStatic={isStatic}
                  triggerTypes={laneAccepts}
                >
                  <SortableComponent onSortChange={setIsSorting} axis="vertical">
                    <Items
                      items={lane.children}
                      isStatic={isStatic}
                      shouldMarkItemsComplete={shouldMarkItemsComplete}
                    />
                    <SortPlaceholder
                      accepts={laneAccepts}
                      index={lane.children.length}
                      isStatic={isStatic}
                    />
                  </SortableComponent>
                </ScrollContainer>
              </DroppableComponent>
            )}

            {!search?.query && !isCollapsed && !shouldPrepend && (
              <ItemForm addItems={addItems} editState={editState} setEditState={setEditState} />
            )}
          </CollapsedDropArea>
        </div>
      </div>
    </SortContext.Provider>
  );
}

export const DraggableLane = memo(DraggableLaneRaw);

export interface LanesProps {
  lanes: Lane[];
  collapseDir: 'horizontal' | 'vertical';
}

function LanesRaw({ lanes, collapseDir }: LanesProps) {
  const search = useContext(SearchContext);
  const { view } = useContext(KanbanContext);
  const boardView = view.useViewState(frontmatterKey) || 'board';
  const collapseState = view.useViewState('list-collapse') || [];

  return (
    <>
      {lanes.map((lane, i) => {
        return (
          <DraggableLane
            collapseDir={collapseDir}
            isCollapsed={(search?.isFiltering && !search.lanes.has(lane)) || !!collapseState[i]}
            key={boardView + lane.id}
            lane={lane}
            laneIndex={i}
          />
        );
      })}
    </>
  );
}

export const Lanes = memo(LanesRaw);
