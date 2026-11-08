import { JSX } from 'preact';
import { CSSProperties, createPortal, useContext, useEffect, useState } from 'preact/compat';

import { DragEventData } from '../managers/DragManager';
import { Coordinates, Entity, Hitbox } from '../types';
import { getDropDuration, transitions } from '../util/animation';
import { DndManagerContext } from './context';

export interface DragOverlayProps {
  children(entity: Entity, styles: CSSProperties): JSX.Element;
  animationsEnabled?: (entity: Entity) => boolean;
}

const maxTilt = 6;
const tiltFactor = 4;
const dragScale = 1.03;

interface OverlayGeometry {
  grab: Coordinates;
  size: { width: number; height: number };
  margin: Hitbox;
  viewport: Coordinates;
}

const defaultGeometry: OverlayGeometry = {
  grab: { x: 0, y: 0 },
  size: { width: 0, height: 0 },
  margin: [0, 0, 0, 0],
  viewport: { x: 0, y: 0 },
};

/**
 * Position the floating drag copy so that the exact point the user grabbed
 * stays glued to the cursor. Using the *measured grab offset* (instead of
 * cached hitboxes) keeps the overlay aligned even when the board was scrolled
 * or zoomed since the entity was measured.
 */
function getDragOverlayStyles(
  position: Coordinates,
  geometry: OverlayGeometry,
  options: { transition?: string; transform?: string } = {}
): CSSProperties {
  const { grab, size, margin, viewport } = geometry;
  const x = position.x - viewport.x - grab.x - margin[0];
  const y = position.y - viewport.y - grab.y - margin[1];

  const transform =
    options.transform || `translate3d(${x}px, ${y}px, 0px)`;

  return {
    transform,
    width: `${size.width + margin[0] + margin[2]}px`,
    height: `${size.height + margin[1] + margin[3]}px`,
    transition: options.transition,
    willChange: 'transform',
  };
}

export function DragOverlay({ children, animationsEnabled }: DragOverlayProps) {
  const dndManager = useContext(DndManagerContext);

  const [dragEntity, setDragEntity] = useState<Entity | undefined>();
  const [styles, setStyles] = useState<CSSProperties | undefined>();

  useEffect(() => {
    if (!dndManager) return;

    let geometry: OverlayGeometry = defaultGeometry;
    let lastPosition: Coordinates | null = null;
    let lastTimestamp = 0;
    let velocityX = 0;
    let isAnimated = false;

    const computeTilt = (position: Coordinates): number => {
      const now = Date.now();

      if (lastPosition) {
        const dt = Math.max(1, now - lastTimestamp);
        const vx = (position.x - lastPosition.x) / dt;
        velocityX = velocityX * 0.75 + vx * 0.25;
      }

      lastPosition = position;
      lastTimestamp = now;

      return Math.max(-maxTilt, Math.min(maxTilt, velocityX * tiltFactor));
    };

    const dragStart = ({
      dragEntity,
      dragOrigin,
      dragPosition,
      dragEntityMargin,
      dragGrabOffset,
      dragOriginSize,
    }: DragEventData) => {
      if (!dragEntity || !dragPosition || !dragOrigin) {
        return;
      }

      const win = dragEntity.getData().win as any;

      let grab = dragGrabOffset;
      let size = dragOriginSize;

      // Fallbacks (e.g. HTML5 drags): derive from the hitbox/pointer origin
      if (!grab || !size) {
        const hitbox = dragEntity.getHitbox();
        grab = grab || { x: dragOrigin.x - hitbox[0], y: dragOrigin.y - hitbox[1] };
        size = size || { width: hitbox[2] - hitbox[0], height: hitbox[3] - hitbox[1] };
      }

      geometry = {
        grab,
        size,
        margin: dragEntityMargin || [0, 0, 0, 0],
        viewport: { x: win?.scrollX || 0, y: win?.scrollY || 0 },
      };

      lastPosition = null;
      lastTimestamp = 0;
      velocityX = 0;

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      isAnimated = !prefersReduced && (animationsEnabled ? animationsEnabled(dragEntity) : false);

      setDragEntity(dragEntity);
      setStyles(getDragOverlayStyles(dragPosition, geometry));
    };

    let moveFrame = 0;
    let pendingPosition: Coordinates | null = null;

    const renderMove = () => {
      moveFrame = 0;
      const dragPosition = pendingPosition;
      pendingPosition = null;

      if (!dragPosition) return;

      const suffix = isAnimated
        ? ` rotate(${computeTilt(dragPosition).toFixed(2)}deg) scale(${dragScale})`
        : undefined;

      const { grab, margin, viewport } = geometry;
      const x = dragPosition.x - viewport.x - grab.x - margin[0];
      const y = dragPosition.y - viewport.y - grab.y - margin[1];

      setStyles(
        getDragOverlayStyles(dragPosition, geometry, {
          transform: `translate3d(${x}px, ${y}px, 0px)${suffix || ''}`,
        })
      );
    };

    const dragMove = ({ dragPosition }: DragEventData) => {
      if (!dragPosition) {
        return;
      }

      // Coalesce multiple pointer events into one render per animation frame.
      pendingPosition = dragPosition;
      if (!moveFrame) {
        moveFrame = activeWindow.requestAnimationFrame(renderMove);
      }
    };

    const dragEnd = ({
      primaryIntersection,
      dragPosition,
      dragEntity,
      dragEntityMargin,
    }: DragEventData) => {
      if (moveFrame) {
        activeWindow.cancelAnimationFrame(moveFrame);
        moveFrame = 0;
        pendingPosition = null;
      }

      if (primaryIntersection && dragPosition) {
        if (dragEntityMargin) geometry = { ...geometry, margin: dragEntityMargin };

        // The target may have been shifted (transform) by the sort manager
        // during the drag, so re-measure it before computing the landing point.
        try {
          primaryIntersection.recalcInitial();
        } catch (e) {
          /* entity may be detached */
        }

        const dropHitbox = primaryIntersection.getHitbox();
        const dropDestination = { x: dropHitbox[0], y: dropHitbox[1] };
        const dropDuration = getDropDuration({
          position: dragPosition,
          destination: dropDestination,
        });

        // Animate the floating card so its *content* lands exactly on the drop
        // slot. Margins are part of the overlay box, so only they are offset —
        // subtracting the grab point here would leave the card shifted at the
        // end of the flight (it would "snap" when the real card appears).
        const { grab, margin, viewport } = geometry;
        const currentX = dragPosition.x - viewport.x - grab.x - margin[0];
        const currentY = dragPosition.y - viewport.y - grab.y - margin[1];
        const destX = dropDestination.x - margin[0];
        const destY = dropDestination.y - margin[1];
        const rotate = isAnimated ? ' rotate(0deg)' : '';

        const win = ((dragEntity?.getData() as any)?.win || activeWindow) as Window;
        const containerEl = win.document.querySelector<HTMLElement>(
          '.kanban-plugin__drag-container'
        );

        if (containerEl && typeof containerEl.animate === 'function') {
          // Imperative WAAPI animation: guaranteed to animate (setting
          // `transition` and `transform` in the same React commit can be
          // swallowed, leaving the card stuck under the cursor).
          containerEl.style.transition = 'none';
          containerEl.style.transform = `translate3d(${currentX}px, ${currentY}px, 0px)`;

          try {
            containerEl.animate(
              [
                { transform: `translate3d(${currentX}px, ${currentY}px, 0px)` },
                { transform: `translate3d(${destX}px, ${destY}px, 0px)${rotate}` },
              ],
              {
                duration: Math.max(120, dropDuration),
                easing: 'cubic-bezier(.2,1,.1,1)',
                fill: 'forwards',
              }
            );
          } catch (e) {
            /* ignore */
          }
        } else {
          setStyles({
            transform: `translate3d(${destX}px, ${destY}px, 0px)${rotate}`,
            transition: transitions.drop(dropDuration),
            width: `${geometry.size.width + margin[0] + margin[2]}px`,
            height: `${geometry.size.height + margin[1] + margin[3]}px`,
            willChange: 'transform',
          } as any);
        }

        activeWindow.setTimeout(() => {
          setDragEntity(undefined);
          setStyles(undefined);
        }, dropDuration + 30);
      } else {
        setDragEntity(undefined);
        setStyles(undefined);
      }
    };

    const { emitter } = dndManager.dragManager;
    emitter.on('dragStart', dragStart);
    emitter.on('dragMove', dragMove);
    emitter.on('dragEnd', dragEnd);

    return () => {
      emitter.off('dragStart', dragStart);
      emitter.off('dragMove', dragMove);
      emitter.off('dragEnd', dragEnd);
    };
  }, [dndManager]);

  if (!dragEntity || !styles) {
    return null;
  }

  return createPortal(children(dragEntity, styles), dragEntity.getData().win.document.body);
}

export function useIsAnythingDragging() {
  const dndManager = useContext(DndManagerContext);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!dndManager) return;

    const onDragStart = () => setIsDragging(true);
    const onDragEnd = ({ primaryIntersection, dragPosition }: DragEventData) => {
      const dropHitbox = primaryIntersection?.getHitbox() || [0, 0];
      const dropDestination = {
        x: dropHitbox[0],
        y: dropHitbox[1],
      };
      const dropDuration = getDropDuration({
        position: dragPosition || dropDestination,
        destination: dropDestination,
      });

      activeWindow.setTimeout(() => setIsDragging(false), dropDuration);
    };

    const { emitter } = dndManager.dragManager;

    emitter.on('dragStart', onDragStart);
    emitter.on('dragEnd', onDragEnd);

    return () => {
      emitter.off('dragStart', onDragStart);
      emitter.off('dragEnd', onDragEnd);
    };
  }, [dndManager]);

  return isDragging;
}
