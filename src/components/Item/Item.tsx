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
import { Droppable, useNestedEntityPath } from 'src/dnd/components/Droppable';
import { DndManagerContext } from 'src/dnd/components/context';
import { useDragHandle } from 'src/dnd/managers/DragManager';
import { frontmatterKey } from 'src/parsers/common';

import { KanbanContext, SearchContext } from '../context';
import { backgroundToCss, fontToCss } from '../appearance';
import { itemColorToCssVars } from '../colors';
import { c } from '../helpers';
import { EditState, EditingState, Item, isEditing } from '../types';
import { CardDetailModal } from './CardDetailModal';
import { ItemCheckbox } from './ItemCheckbox';
import { ItemContent } from './ItemContent';
import { useItemMenu } from './ItemMenu';
import { ItemMenuButton } from './ItemMenuButton';
import { ItemMetadata } from './MetadataTable';
import { getItemClassModifiers } from './helpers';

export interface DraggableItemProps {
  item: Item;
  itemIndex: number;
  isStatic?: boolean;
  shouldMarkItemsComplete?: boolean;
}

export interface ItemInnerProps {
  item: Item;
  isStatic?: boolean;
  shouldMarkItemsComplete?: boolean;
  isMatch?: boolean;
  searchQuery?: string;
}

const ItemInner = memo(function ItemInner({
  item,
  shouldMarkItemsComplete,
  isMatch,
  searchQuery,
  isStatic,
}: ItemInnerProps) {
  const { stateManager, boardModifiers, view } = useContext(KanbanContext);
  const [editState, setEditState] = useState<EditState>(EditingState.cancel);
  const clickTimer = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const dndManager = useContext(DndManagerContext);
  const lastDragEndRef = useRef(0);

  useEffect(() => {
    const { emitter } = dndManager.dragManager;
    const onDragEnd = () => {
      lastDragEndRef.current = Date.now();
    };

    emitter.on('dragEnd', onDragEnd);
    return () => {
      emitter.off('dragEnd', onDragEnd);
    };
  }, [dndManager]);

  useEffect(() => {
    const handler = () => {
      if (isEditing(editState)) setEditState(EditingState.cancel);
    };

    dndManager.dragManager.emitter.on('dragStart', handler);
    return () => {
      dndManager.dragManager.emitter.off('dragStart', handler);
    };
  }, [dndManager, editState]);

  useEffect(() => {
    if (item.data.forceEditMode) {
      setEditState({ x: 0, y: 0 });
    }
  }, [item.data.forceEditMode]);

  const path = useNestedEntityPath();

  const showItemMenu = useItemMenu({
    boardModifiers,
    item,
    setEditState: setEditState,
    stateManager,
    path,
  });

  const onContextMenu: JSX.MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (isEditing(editState)) return;
      if (
        e.targetNode.instanceOf(HTMLAnchorElement) &&
        (e.targetNode.hasClass('internal-link') || e.targetNode.hasClass('external-link'))
      ) {
        return;
      }
      showItemMenu(e);
    },
    [showItemMenu, editState]
  );

  const onDoubleClick: JSX.MouseEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      view.getWindow().clearTimeout(clickTimer.current);
      setEditState({ x: e.clientX, y: e.clientY });
    },
    [setEditState, view]
  );

  // Kanban Plus: click/tap on a card opens the Trello-style detail modal.
  // We can't use `click` here because the drag handle calls preventDefault()
  // on pointerdown, which suppresses the synthetic click event.
  const scheduleOpen = useCallback(
    (target: HTMLElement | null) => {
      if (
        target?.closest(
          'a, input, textarea, button, select, .kanban-plugin__item-label, .kanban-plugin__item-metadata, .kanban-plugin__item-input-wrapper, .kanban-plugin__item-prefix-button, .kanban-plugin__item-postfix-button'
        )
      ) {
        return;
      }

      view.getWindow().clearTimeout(clickTimer.current);
      clickTimer.current = view.getWindow().setTimeout(() => {
        if (view.getWindow().getSelection?.()?.toString()) return;
        new CardDetailModal(view, stateManager, item).open();
      }, 180);
    },
    [item, stateManager, view]
  );

  const onPointerDown: JSX.PointerEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (e.button !== 0 || isEditing(editState)) return;
      pointerStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    },
    [editState]
  );

  const onPointerUp: JSX.PointerEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;

      if (!start || isEditing(editState)) return;
      if (e.button !== 0) return;

      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > 6 || Date.now() - start.t > 700) return;
      if (Date.now() - lastDragEndRef.current < 350) return;

      scheduleOpen(e.target as HTMLElement);
    },
    [editState, lastDragEndRef, scheduleOpen]
  );

  useEffect(() => {
    return () => view.getWindow().clearTimeout(clickTimer.current);
  }, [view]);

  const ignoreAttr = useMemo(() => {
    if (isEditing(editState)) {
      return {
        'data-ignore-drag': true,
      };
    }

    return {};
  }, [editState]);

  return (
    <div
      // eslint-disable-next-line react/no-unknown-property
      onDblClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
      className={c('item-content-wrapper')}
      {...ignoreAttr}
    >
      <div className={c('item-title-wrapper')} {...ignoreAttr}>
        <ItemCheckbox
          boardModifiers={boardModifiers}
          item={item}
          path={path}
          shouldMarkItemsComplete={shouldMarkItemsComplete}
          stateManager={stateManager}
        />
        <ItemContent
          item={item}
          searchQuery={isMatch ? searchQuery : undefined}
          setEditState={setEditState}
          editState={editState}
          isStatic={isStatic}
        />
        <ItemMenuButton editState={editState} setEditState={setEditState} showMenu={showItemMenu} />
      </div>
      <ItemMetadata searchQuery={isMatch ? searchQuery : undefined} item={item} />
    </div>
  );
});

export const DraggableItem = memo(function DraggableItem(props: DraggableItemProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const search = useContext(SearchContext);
  const { stateManager } = useContext(KanbanContext);

  const { itemIndex, ...innerProps } = props;

  const bindHandle = useDragHandle(measureRef, measureRef);

  const showItemColors = stateManager.useSetting('show-item-colors');
  const itemColorStyle = stateManager.useSetting('item-color-style') || 'strip';
  const itemStyles = stateManager.useSetting('item-styles');
  const blockId = innerProps.item.data.blockId;
  const itemColor = showItemColors !== false && blockId ? itemStyles?.[blockId]?.color : undefined;
  const itemColorVars = useMemo(
    () => itemColorToCssVars(itemColor, itemColorStyle),
    [itemColor, itemColorStyle]
  );
  const itemEntry = blockId ? itemStyles?.[blockId] : undefined;
  const itemBg = useMemo(
    () => backgroundToCss(stateManager.app, itemEntry?.background),
    [stateManager, itemEntry?.background]
  );
  const itemFontStyle = useMemo(() => fontToCss(itemEntry?.font), [itemEntry?.font]);

  const isMatch = search?.query ? innerProps.item.data.titleSearch.includes(search.query) : false;
  const classModifiers: string[] = getItemClassModifiers(innerProps.item);

  return (
    <div
      ref={(el) => {
        measureRef.current = el;
        bindHandle(el);
      }}
      className={c('item-wrapper')}
    >
      <div
        ref={elementRef}
        className={classcat([
          c('item'),
          ...classModifiers,
          {
            'has-item-color': !!itemColor,
            'item-color-full': !!itemColor && itemColorStyle === 'full',
            'item-color-strip': !!itemColor && itemColorStyle !== 'full',
            'kp-pop-in': !!innerProps.item.data.justAdded,
          },
          itemBg.className,
        ])}
        style={{
          ...itemColorVars,
          ...itemBg.vars,
          ...itemFontStyle,
          ...(itemEntry?.textColor ? { color: itemEntry.textColor } : {}),
        }}
      >
        {props.isStatic ? (
          <ItemInner
            {...innerProps}
            isMatch={isMatch}
            searchQuery={search?.query}
            isStatic={true}
          />
        ) : (
          <Droppable
            elementRef={elementRef}
            measureRef={measureRef}
            id={props.item.id}
            index={itemIndex}
            data={props.item}
          >
            <ItemInner {...innerProps} isMatch={isMatch} searchQuery={search?.query} />
          </Droppable>
        )}
      </div>
    </div>
  );
});

interface ItemsProps {
  isStatic?: boolean;
  items: Item[];
  shouldMarkItemsComplete: boolean;
}

export const Items = memo(function Items({ isStatic, items, shouldMarkItemsComplete }: ItemsProps) {
  const search = useContext(SearchContext);
  const { view } = useContext(KanbanContext);
  const boardView = view.useViewState(frontmatterKey);

  return (
    <>
      {items.map((item, i) => {
        return search?.isFiltering && !search.items.has(item) ? null : (
          <DraggableItem
            key={boardView + item.id}
            item={item}
            itemIndex={i}
            shouldMarkItemsComplete={shouldMarkItemsComplete}
            isStatic={isStatic}
          />
        );
      })}
    </>
  );
});
