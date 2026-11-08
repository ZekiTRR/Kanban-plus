import { memo, useCallback, useEffect, useRef, useState } from 'preact/compat';
import { StateManager } from 'src/StateManager';

import { c } from '../helpers';

export type MinimapPosition = 'tl' | 'tr' | 'bl' | 'br';

interface LaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MinimapProps {
  stateManager: StateManager;
  rootEl: HTMLElement | null;
  boardDataRevision: unknown;
}

const MINIMAP_W = 220;
const MINIMAP_H = 152;

function getBoardEl(rootEl: HTMLElement | null): HTMLElement | null {
  if (!rootEl) return null;
  return rootEl.querySelector(`.${c('board')}`) as HTMLElement | null;
}

function measure(boardEl: HTMLElement): {
  lanes: LaneRect[];
  content: { w: number; h: number };
  viewport: { x: number; y: number; w: number; h: number };
} | null {
  const inner = boardEl.firstElementChild as HTMLElement | null;
  const scope: HTMLElement = inner || boardEl;
  const wrappers = Array.from(
    scope.querySelectorAll(`.${c('lane-wrapper')}`)
  ) as HTMLElement[];

  const lanes: LaneRect[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  wrappers.forEach((wrapper) => {
    const r = wrapper.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const boardRect = boardEl.getBoundingClientRect();
    const x = r.left - boardRect.left + boardEl.scrollLeft;
    const y = r.top - boardRect.top + boardEl.scrollTop;
    const w = r.width;
    const h = r.height;
    lanes.push({ x, y, w, h });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  if (!lanes.length) return null;

  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);

  return {
    lanes: lanes.map((lane) => ({
      x: lane.x - minX,
      y: lane.y - minY,
      w: lane.w,
      h: lane.h,
    })),
    content: { w: contentW, h: contentH },
    viewport: {
      x: boardEl.scrollLeft - minX,
      y: boardEl.scrollTop - minY,
      w: boardEl.clientWidth,
      h: boardEl.clientHeight,
    },
  };
}

export const MiniMap = memo(function MiniMap({
  stateManager,
  rootEl,
  boardDataRevision,
}: MinimapProps) {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof measure>>(null);
  const [position, setPosition] = useState<MinimapPosition>(() =>
    (stateManager.getSetting('minimap-position') as MinimapPosition) || 'br'
  );
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  const refresh = useCallback(() => {
    const boardEl = getBoardEl(rootEl);
    if (!boardEl) {
      setSnapshot(null);
      return;
    }
    setSnapshot(measure(boardEl));
  }, [rootEl, boardDataRevision]);

  useEffect(() => {
    refresh();
    const boardEl = getBoardEl(rootEl);
    if (!boardEl) return;

    const onScroll = () => {
      // Re-measure viewport cheaply without full state churn at 60hz via rAF.
      requestAnimationFrame(refresh);
    };
    const onResize = () => refresh();

    boardEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    const mutation = new MutationObserver(() => refresh());
    mutation.observe(boardEl, { childList: true, subtree: false, attributes: true });

    const timer = window.setInterval(refresh, 800);

    return () => {
      boardEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      mutation.disconnect();
      window.clearInterval(timer);
    };
  }, [rootEl, boardDataRevision, refresh]);

  useEffect(() => {
    const stored = (stateManager.getSetting('minimap-position') as MinimapPosition) || 'br';
    if (stored !== positionRef.current) setPosition(stored);
  }, [stateManager, boardDataRevision]);

  const persistPosition = useCallback(
    (next: MinimapPosition) => {
      setPosition(next);
      stateManager.setState((board) => ({
        ...board,
        data: {
          ...board.data,
          settings: { ...board.data.settings, 'minimap-position': next },
        },
      }));
    },
    [stateManager]
  );

  const hide = useCallback(() => {
    stateManager.setState((board) => ({
      ...board,
      data: {
        ...board.data,
        settings: { ...board.data.settings, minimap: false },
      },
    }));
  }, [stateManager]);

  if (!snapshot) return null;

  const scale = Math.min(
    (MINIMAP_W - 12) / Math.max(1, snapshot.content.w),
    (MINIMAP_H - 26) / Math.max(1, snapshot.content.h)
  );

  const toMapX = (value: number) => 6 + value * scale;
  const toMapY = (value: number) => 22 + value * scale;

  const viewportW = Math.max(18, snapshot.viewport.w * scale);
  const viewportH = Math.max(14, snapshot.viewport.h * scale);
  const viewportX = Math.min(
    Math.max(6, toMapX(snapshot.viewport.x)),
    MINIMAP_W - 6 - viewportW
  );
  const viewportY = Math.min(
    Math.max(22, toMapY(snapshot.viewport.y)),
    MINIMAP_H - 6 - viewportH
  );

  const jumpTo = useCallback(
    (clientX: number, clientY: number) => {
      const boardEl = getBoardEl(rootEl);
      const mapRect = bodyRef.current?.getBoundingClientRect();
      if (!boardEl || !snapshot || !mapRect) return;

      const mx = clientX - mapRect.left;
      const my = clientY - mapRect.top;
      const contentX = (mx - 6) / scale;
      const contentY = (my - 22) / scale;
      const boardRect = boardEl.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      const wrappers = boardEl.querySelectorAll(`.${c('lane-wrapper')}`);
      wrappers.forEach((wrapper) => {
        const r = (wrapper as HTMLElement).getBoundingClientRect();
        minX = Math.min(minX, r.left - boardRect.left + boardEl.scrollLeft);
        minY = Math.min(minY, r.top - boardRect.top + boardEl.scrollTop);
      });
      if (!isFinite(minX)) return;

      boardEl.scrollLeft = Math.max(0, minX + contentX - boardEl.clientWidth / 2);
      boardEl.scrollTop = Math.max(0, minY + contentY - boardEl.clientHeight / 2);
    },
    [rootEl, snapshot, scale]
  );

  const onBodyPointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
      jumpTo(e.clientX, e.clientY);
    },
    [jumpTo]
  );

  const onBodyPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return;
      if (Math.abs(e.clientX - dragRef.current.startX) > 2) dragRef.current.moved = true;
      jumpTo(e.clientX, e.clientY);
    },
    [jumpTo]
  );

  const onBodyPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onHeaderPointerDown = useCallback(
    (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(`.${c('minimap-close')}`)) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    },
    []
  );

  const onHeaderPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return;
      if (Math.abs(e.clientX - dragRef.current.startX) + Math.abs(e.clientY - dragRef.current.startY) > 12) {
        dragRef.current.moved = true;
      }
    },
    []
  );

  const onHeaderPointerUp = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag?.moved || !rootEl) return;

      const rootRect = rootEl.getBoundingClientRect();
      const cx = e.clientX - rootRect.left;
      const cy = e.clientY - rootRect.top;
      const horizontal = cx < rootRect.width / 2 ? 'l' : 'r';
      const vertical = cy < rootRect.height / 2 ? 't' : 'b';
      persistPosition(`${vertical}${horizontal}` as MinimapPosition);
    },
    [persistPosition, rootEl]
  );

  const positionClass =
    position === 'tl'
      ? c('minimap-position-tl')
      : position === 'tr'
        ? c('minimap-position-tr')
        : position === 'bl'
          ? c('minimap-position-bl')
          : c('minimap-position-br');

  return (
    <div className={`${c('minimap')} ${positionClass}`}>
      <div
        className={c('minimap-header')}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span>{'Map'}</span>
        <button
          className={c('minimap-close')}
          onClick={(e) => {
            e.stopPropagation();
            hide();
          }}
          aria-label="Hide minimap"
        >
          ×
        </button>
      </div>
      <div
        ref={bodyRef}
        className={c('minimap-body')}
        style={{ width: `${MINIMAP_W}px`, height: `${MINIMAP_H}px` }}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
      >
        {snapshot.lanes.map((lane, index) => (
          <div
            key={index}
            className={c('minimap-lane')}
            style={{
              left: `${toMapX(lane.x)}px`,
              top: `${toMapY(lane.y)}px`,
              width: `${Math.max(4, lane.w * scale)}px`,
              height: `${Math.max(4, lane.h * scale)}px`,
            }}
          />
        ))}
        <div
          className={c('minimap-viewport')}
          style={{
            left: `${viewportX}px`,
            top: `${viewportY}px`,
            width: `${viewportW}px`,
            height: `${viewportH}px`,
          }}
        />
      </div>
    </div>
  );
});
