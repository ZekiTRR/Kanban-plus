import classcat from 'classcat';
import { JSX, memo, useCallback, useContext, useMemo } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { getEntityFromPath, moveEntity } from 'src/dnd/util/data';
import { t } from 'src/lang/helpers';

import { KanbanContext, SearchContext } from '../context';
import { c, maybeCompleteForMove } from '../helpers';
import { Board, DataTypes } from '../types';
import { DraggableItem } from '../Item/Item';
import { Icon } from '../Icon/Icon';
import { getWipState } from '../../helpers/wipLimits';
import { canInsertIntoLane } from '../../helpers/wipGate';
import {
  SwimlaneEntry,
  SwimlaneGroup,
  buildSwimlanes,
  getSwimlaneConfig,
} from '../../helpers/swimlanes';

const MIME = 'application/x-kanban-plus-item';

interface SwimlanesProps {
  boardData: Board;
  stateManager: StateManager;
}

const SwimlaneCard = memo(function SwimlaneCard({
  entry,
}: {
  entry: SwimlaneEntry;
}) {
  const onDragStart = useCallback(
    (e: JSX.TargetedDragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(MIME, JSON.stringify([entry.laneIndex, entry.itemIndex]));
      e.dataTransfer.setData('text/plain', entry.item.data.title);
      e.dataTransfer.effectAllowed = 'move';
    },
    [entry.laneIndex, entry.itemIndex, entry.item.data.title]
  );

  return (
    <div
      className={c('swimlane-card')}
      draggable={true}
      onDragStart={onDragStart}
      data-lane={entry.laneIndex}
      data-item={entry.itemIndex}
    >
      <DraggableItem
        item={entry.item}
        itemIndex={entry.itemIndex}
        isStatic={true}
        shouldMarkItemsComplete={false}
      />
    </div>
  );
});

export const SwimlanesView = memo(function SwimlanesView({ boardData, stateManager }: SwimlanesProps) {
  const { view } = useContext(KanbanContext);
  const search = useContext(SearchContext);
  const config = getSwimlaneConfig(stateManager);
  const collapsed = view.useViewState('swimlane-collapse') || [];

  const groups = useMemo(() => buildSwimlanes(boardData, config), [boardData, config]);

  const toggleGroup = useCallback(
    (key: string) => {
      const next = (collapsed as string[]).includes(key)
        ? (collapsed as string[]).filter((value: string) => value !== key)
        : [...(collapsed as string[]), key];
      view.setViewState('swimlane-collapse', next);
    },
    [collapsed, view]
  );

  const insertionForCell = useCallback(
    (
      groupKey: string,
      laneIndex: number,
      targetEntry: SwimlaneEntry | null,
      after: boolean
    ): number => {
      const group = groups.find((row) => row.key === groupKey);
      const entries = group?.entries.filter((entry) => entry.laneIndex === laneIndex) || [];

      if (targetEntry) return targetEntry.itemIndex + (after ? 1 : 0);
      if (entries.length) return entries[entries.length - 1].itemIndex + 1;
      return 0;
    },
    [groups]
  );

  const onCellDrop = useCallback(
    (e: JSX.TargetedDragEvent<HTMLDivElement>, groupKey: string, laneIndex: number) => {
      e.stopPropagation();
      e.preventDefault();
      const raw = e.dataTransfer.getData(MIME);
      if (!raw) return;

      let path: Path;
      try {
        path = JSON.parse(raw) as Path;
      } catch {
        return;
      }

      if (!Array.isArray(path) || typeof path[0] !== 'number' || typeof path[1] !== 'number') return;

      const target = (e.target as HTMLElement).closest(
        `.${c('swimlane-card')}`
      ) as HTMLElement | null;
      const targetEntry = target
        ? groups
            .find((group) => group.key === groupKey)
            ?.entries.find(
              (entry) =>
                entry.laneIndex === Number(target.dataset.lane) &&
                entry.itemIndex === Number(target.dataset.item)
            ) || null
        : null;

      let after = false;
      if (target && targetEntry) {
        const rect = target.getBoundingClientRect();
        after = e.clientY > rect.top + rect.height / 2;
      }

      const dropPath: Path = [laneIndex, insertionForCell(groupKey, laneIndex, targetEntry, after)];
      if (path[0] !== laneIndex) {
        if (!canInsertIntoLane(stateManager, stateManager.state, laneIndex, 1)) return;
      }
      view.getWindow().setTimeout(() => {
        stateManager.setState((board) => {
          const entity = getEntityFromPath(board, path);
          if (entity.type !== DataTypes.Item) return board;

          return moveEntity(
            board,
            path,
            dropPath,
            (current) => {
              if (current.type === DataTypes.Item) {
                return maybeCompleteForMove(
                  stateManager,
                  board,
                  path,
                  stateManager,
                  board,
                  dropPath,
                  current
                ).next;
              }
              return current;
            },
            (current) => {
              if (current.type === DataTypes.Item) {
                return maybeCompleteForMove(
                  stateManager,
                  board,
                  path,
                  stateManager,
                  board,
                  dropPath,
                  current
                ).replacement;
              }
              return current;
            }
          );
        });
      }, 0);
    },
    [groups, insertionForCell, stateManager, view]
  );

  const onCellDragOver = useCallback((e: JSX.TargetedDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div
      className={c('swimlanes')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(MIME)) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes(MIME)) {
          e.stopPropagation();
        }
      }}
    >
      {groups.map((group: SwimlaneGroup) => {
        const isCollapsed = (collapsed as string[]).includes(group.key);
        return (
          <section key={group.key} className={c('swimlane')}>
            <header className={c('swimlane-header')}>
              <button
                className={c('swimlane-toggle')}
                onClick={() => toggleGroup(group.key)}
                aria-label={isCollapsed ? t('Expand') : t('Collapse')}
              >
                <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} />
              </button>
              <span className={c('swimlane-title')}>{group.label}</span>
              <span className={c('swimlane-count')}>{group.count}</span>
            </header>

            {!isCollapsed && (
              <div className={c('swimlane-columns')}>
                {boardData.children.map((lane, laneIndex) => {
                  const entries = group.entries.filter(
                    (entry) =>
                      entry.laneIndex === laneIndex &&
                      (!search?.isFiltering || search.items.has(entry.item))
                  );
                  const wip = getWipState(stateManager, lane);

                  return (
                    <div
                      key={lane.id}
                      className={classcat([c('swimlane-cell'), { 'is-collapsed': false }])}
                      data-lane={laneIndex}
                      onDragOver={onCellDragOver}
                      onDrop={(e) => onCellDrop(e, group.key, laneIndex)}
                    >
                      <header className={c('swimlane-cell-header')}>
                        <span>{lane.data.title}</span>
                        <span>
                          {entries.length}
                          {wip.limit ? `/${wip.limit}` : ''}
                        </span>
                      </header>
                      <div className={c('swimlane-cell-items')}>
                        {entries.map((entry) => (
                          <SwimlaneCard
                            key={`${entry.item.id}:${entry.itemIndex}`}
                            entry={entry}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
});
