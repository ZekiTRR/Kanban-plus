import update from 'immutability-helper';
import { Menu, Platform } from 'obsidian';
import { Dispatch, StateUpdater, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { Path } from 'src/dnd/types';
import { defaultSort } from 'src/helpers/util';
import { getInboxTitle, isInboxEnabled, isInboxLane } from 'src/helpers/inbox';
import { getSwimlaneConfig, setSwimlaneConfig, swimlaneModes } from 'src/helpers/swimlanes';
import { t } from 'src/lang/helpers';
import { lableToName } from 'src/parsers/helpers/inlineMetadata';

import { anyToString } from '../Item/MetadataTable';
import { BackgroundModal } from '../Appearance/BackgroundModal';
import { FontModal } from '../Appearance/FontModal';
import { TextColorModal } from '../Appearance/TextColorModal';
import { KanbanContext } from '../context';
import { addColorMenu, setLaneAppearance, setLaneColor, setLanePos } from '../colors';
import { c, generateInstanceId } from '../helpers';
import { EditState, Lane, LaneSort, LaneStyle, LaneTemplate } from '../types';

export type LaneAction = 'delete' | 'archive' | 'archive-items' | null;

const actionLabels = {
  delete: {
    description: t('Are you sure you want to delete this list and all its cards?'),
    confirm: t('Yes, delete list'),
  },
  archive: {
    description: t('Are you sure you want to archive this list and all its cards?'),
    confirm: t('Yes, archive list'),
  },
  'archive-items': {
    description: t('Are you sure you want to archive all cards in this list?'),
    confirm: t('Yes, archive cards'),
  },
};

export interface ConfirmActionProps {
  lane: Lane;
  action: LaneAction;
  cancel: () => void;
  onAction: () => void;
}

export function ConfirmAction({ action, cancel, onAction, lane }: ConfirmActionProps) {
  useEffect(() => {
    // Immediately execute action if lane is empty
    if (action && lane.children.length === 0) {
      onAction();
    }
  }, [action, lane.children.length]);

  if (!action || (action && lane.children.length === 0)) return null;

  return (
    <div className={c('action-confirm-wrapper')}>
      <div className={c('action-confirm-text')}>{actionLabels[action].description}</div>
      <div>
        <button onClick={onAction} className={c('confirm-action-button')}>
          {actionLabels[action].confirm}
        </button>
        <button onClick={cancel} className={c('cancel-action-button')}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export interface UseSettingsMenuParams {
  setEditState: Dispatch<StateUpdater<EditState>>;
  path: Path;
  lane: Lane;
  isFloating?: boolean;
  onMagnet?: () => void;
  getDetachPos?: () => { x: number; y: number } | null;
}

export function useSettingsMenu({
  setEditState,
  path,
  lane,
  isFloating,
  onMagnet,
  getDetachPos,
}: UseSettingsMenuParams) {
  const { stateManager, boardModifiers } = useContext(KanbanContext);
  const [confirmAction, setConfirmAction] = useState<LaneAction>(null);

  const settingsMenu = useMemo(() => {
    const metadataSortOptions = new Set<string>();
    let canSortDate = false;
    let canSortTags = false;

    lane.children.forEach((item) => {
      const taskData = item.data.metadata.inlineMetadata;
      if (taskData) {
        taskData.forEach((m) => {
          if (m.key === 'repeat') return;
          if (!metadataSortOptions.has(m.key)) metadataSortOptions.add(m.key);
        });
      }

      if (!canSortDate && item.data.metadata.date) canSortDate = true;
      if (!canSortTags && item.data.metadata.tags?.length) canSortTags = true;
    });

    const menu = new Menu().addItem((item) => {
      item
        .setIcon('lucide-edit-3')
        .setTitle(t('Edit list'))
        .onClick(() => setEditState({ x: 0, y: 0 }));
    });

    addColorMenu(menu, {
      currentColor: (stateManager.getSetting('lane-styles') as LaneStyle[] | undefined)?.[
        path.last()
      ]?.color,
      onPick: (color) =>
        setLaneColor(stateManager, path.last(), stateManager.state.children.length, color),
      onClear: () => setLaneColor(stateManager, path.last(), stateManager.state.children.length, null),
    });

    const laneStyle = (stateManager.getSetting('lane-styles') as LaneStyle[] | undefined)?.[
      path.last()
    ];

    menu.addItem((i) => {
      i.setIcon('lucide-image')
        .setTitle(t('Lane background'))
        .onClick(() => {
          new BackgroundModal(stateManager.app, laneStyle?.background, (background) => {
            setLaneAppearance(stateManager, path.last(), stateManager.state.children.length, {
              background,
            });
          }, 'lane').open();
        });
    });

    menu.addItem((i) => {
      i.setIcon('lucide-type')
        .setTitle(t('Lane font'))
        .onClick(() => {
          new FontModal(stateManager.app, laneStyle?.font, (font) => {
            setLaneAppearance(stateManager, path.last(), stateManager.state.children.length, {
              font,
            });
          }).open();
        });
    });

    menu.addItem((i) => {
      i.setIcon('lucide-baseline')
        .setTitle(t('Text color'))
        .onClick(() => {
          new TextColorModal(
            stateManager.app,
            'lane',
            laneStyle?.textColor,
            laneStyle?.background,
            laneStyle?.font,
            (textColor) =>
              setLaneAppearance(stateManager, path.last(), stateManager.state.children.length, {
                textColor,
              })
          ).open();
        });
    });

    // Kanban Plus: free-floating lanes
    if (stateManager.getSetting('enable-free-lanes')) {
      if (isFloating) {
        menu.addItem((i) => {
          i.setIcon('lucide-magnet')
            .setTitle(t('Snap lane back'))
            .onClick(() => onMagnet?.());
        });
      } else if (getDetachPos) {
        menu.addItem((i) => {
          i.setIcon('lucide-pin')
            .setTitle(t('Detach lane'))
            .onClick(() => {
              const pos = getDetachPos();

              if (pos) {
                setLanePos(stateManager, path.last(), stateManager.state.children.length, pos);
              }
            });
        });
      }
    }

    // Kanban Plus: inbox triage helpers
    const inboxEnabled = isInboxEnabled(stateManager);
    const inboxTitle = getInboxTitle(stateManager);

    if (inboxEnabled && isInboxLane(lane, inboxTitle)) {
      const lanes = stateManager.state.children;

      if (lanes.length > 1 && lane.children.length > 0) {
        menu.addItem((i) => {
          const submenu = (i as any)
            .setTitle(t('Move all cards to'))
            .setIcon('lucide-corner-up-right')
            .setSubmenu() as Menu;

          lanes.forEach((targetLane, targetIndex) => {
            if (targetIndex === path.last()) return;

            submenu.addItem((mi) =>
              mi
                .setTitle(targetLane.data.title)
                .setIcon('lucide-square-kanban')
                .onClick(() => boardModifiers.moveLaneItemsTo(path, targetIndex))
            );
          });
        });
      }

      menu.addItem((i) => {
        i.setIcon('lucide-eye-off')
          .setTitle(t('Hide inbox'))
          .onClick(() =>
            stateManager.setState((board) =>
              update(board, {
                data: { settings: { inbox: { $set: false } } },
              })
            )
          );
      });
    }

    menu
      .addItem((item) => {
        item
          .setIcon('lucide-archive')
          .setTitle(t('Archive cards'))
          .onClick(() => setConfirmAction('archive-items'));
      })
      .addItem((item) => {
        item
          .setIcon('gauge')
          .setTitle(t('Set WIP limit'))
          .onClick(() => {
            boardModifiers.updateLane(
              path,
              update(lane, {
                data: {
                  wipLimit: { $set: true },
                },
              })
            );
            setEditState({ x: 0, y: 0 });
          });
      })
      .addItem((item) => {
        item
          .setIcon('lucide-x')
          .setTitle(t('Remove WIP limit'))
          .onClick(() =>
            boardModifiers.updateLane(
              path,
              update(lane, {
                data: {
                  wipLimit: { $set: false },
                  maxItems: { $set: 0 },
                },
              })
            )
          );
      })
      .addSeparator()
      .addItem((i) => {
        i.setIcon('arrow-left-to-line')
          .setTitle(t('Insert list before'))
          .onClick(() =>
            boardModifiers.insertLane(path, {
              ...LaneTemplate,
              id: generateInstanceId(),
              children: [],
              data: {
                title: '',
                shouldMarkItemsComplete: false,
                forceEditMode: true,
              },
            })
          );
      })
      .addItem((i) => {
        i.setIcon('arrow-right-to-line')
          .setTitle(t('Insert list after'))
          .onClick(() => {
            const newPath = [...path];

            newPath[newPath.length - 1] = newPath[newPath.length - 1] + 1;

            boardModifiers.insertLane(newPath, {
              ...LaneTemplate,
              id: generateInstanceId(),
              children: [],
              data: {
                title: '',
                shouldMarkItemsComplete: false,
                forceEditMode: true,
              },
            });
          });
      })
      .addSeparator()
      .addItem((item) => {
        item
          .setIcon('lucide-archive')
          .setTitle(t('Archive list'))
          .onClick(() => setConfirmAction('archive'));
      })
      .addItem((item) => {
        item
          .setIcon('lucide-trash-2')
          .setTitle(t('Delete list'))
          .onClick(() => setConfirmAction('delete'));
      })
      .addSeparator();

    const addSortOptions = (menu: Menu) => {
      menu.addItem((item) => {
        item
          .setIcon('arrow-down-up')
          .setTitle(t('Sort by card text'))
          .onClick(() => {
            const children = lane.children.slice();
            const isAsc = lane.data.sorted === LaneSort.TitleAsc;

            children.sort((a, b) => {
              if (isAsc) {
                return b.data.title.localeCompare(a.data.title);
              }

              return a.data.title.localeCompare(b.data.title);
            });

            boardModifiers.updateLane(
              path,
              update(lane, {
                children: {
                  $set: children,
                },
                data: {
                  sorted: {
                    $set:
                      lane.data.sorted === LaneSort.TitleAsc
                        ? LaneSort.TitleDsc
                        : LaneSort.TitleAsc,
                  },
                },
              })
            );
          });
      });

      if (canSortDate) {
        menu.addItem((item) => {
          item
            .setIcon('arrow-down-up')
            .setTitle(t('Sort by date'))
            .onClick(() => {
              const children = lane.children.slice();
              const mod = lane.data.sorted === LaneSort.DateAsc ? -1 : 1;

              children.sort((a, b) => {
                const aDate: moment.Moment | undefined =
                  a.data.metadata.time || a.data.metadata.date;
                const bDate: moment.Moment | undefined =
                  b.data.metadata.time || b.data.metadata.date;

                if (aDate && !bDate) return -1 * mod;
                if (bDate && !aDate) return 1 * mod;
                if (!aDate && !bDate) return 0;

                return (aDate.isBefore(bDate) ? -1 : 1) * mod;
              });

              boardModifiers.updateLane(
                path,
                update(lane, {
                  children: {
                    $set: children,
                  },
                  data: {
                    sorted: {
                      $set:
                        lane.data.sorted === LaneSort.DateAsc ? LaneSort.DateDsc : LaneSort.DateAsc,
                    },
                  },
                })
              );
            });
        });
      }

      if (canSortTags) {
        menu.addItem((item) => {
          item
            .setIcon('arrow-down-up')
            .setTitle(t('Sort by tags'))
            .onClick(() => {
              const tagSortOrder = stateManager.getSetting('tag-sort');
              const children = lane.children.slice();
              const desc = lane.data.sorted === LaneSort.TagsAsc ? true : false;

              children.sort((a, b) => {
                const tagsA = a.data.metadata.tags;
                const tagsB = b.data.metadata.tags;

                if (!tagsA?.length && !tagsB?.length) return 0;
                if (!tagsA?.length) return 1;
                if (!tagsB?.length) return -1;

                const aSortOrder =
                  tagSortOrder?.findIndex((sort) => tagsA.includes(sort.tag)) ?? -1;
                const bSortOrder =
                  tagSortOrder?.findIndex((sort) => tagsB.includes(sort.tag)) ?? -1;

                if (aSortOrder > -1 && bSortOrder < 0) return desc ? 1 : -1;
                if (bSortOrder > -1 && aSortOrder < 0) return desc ? -1 : 1;
                if (aSortOrder > -1 && bSortOrder > -1) {
                  return desc ? bSortOrder - aSortOrder : aSortOrder - bSortOrder;
                }

                if (desc) return defaultSort(tagsB.join(''), tagsA.join(''));
                return defaultSort(tagsA.join(''), tagsB.join(''));
              });

              boardModifiers.updateLane(
                path,
                update(lane, {
                  children: {
                    $set: children,
                  },
                  data: {
                    sorted: {
                      $set:
                        lane.data.sorted === LaneSort.TagsAsc ? LaneSort.TagsDsc : LaneSort.TagsAsc,
                    },
                  },
                })
              );
            });
        });
      }

      if (metadataSortOptions.size) {
        metadataSortOptions.forEach((k) => {
          menu.addItem((i) => {
            i.setIcon('arrow-down-up')
              .setTitle(t('Sort by') + ' ' + lableToName(k).toLocaleLowerCase())
              .onClick(() => {
                const children = lane.children.slice();
                const desc = lane.data.sorted === k + '-asc' ? true : false;

                children.sort((a, b) => {
                  const valA = a.data.metadata.inlineMetadata?.find((m) => m.key === k);
                  const valB = b.data.metadata.inlineMetadata?.find((m) => m.key === k);

                  if (valA === undefined && valB === undefined) return 0;
                  if (valA === undefined) return 1;
                  if (valB === undefined) return -1;

                  if (desc) {
                    return defaultSort(
                      anyToString(valB.value, stateManager),
                      anyToString(valA.value, stateManager)
                    );
                  }
                  return defaultSort(
                    anyToString(valA.value, stateManager),
                    anyToString(valB.value, stateManager)
                  );
                });

                boardModifiers.updateLane(
                  path,
                  update(lane, {
                    children: {
                      $set: children,
                    },
                    data: {
                      sorted: {
                        $set: lane.data.sorted === k + '-asc' ? k + '-desc' : k + '-asc',
                      },
                    },
                  })
                );
              });
          });
        });
      }
    };

    if (Platform.isPhone) {
      addSortOptions(menu);
    } else {
      menu.addItem((item) => {
        const submenu = (item as any).setTitle(t('Sort by')).setIcon('arrow-down-up').setSubmenu();

        addSortOptions(submenu);
      });
    }

    return menu;
  }, [stateManager, setConfirmAction, path, lane, isFloating, onMagnet, getDetachPos]);

  return {
    settingsMenu,
    confirmAction,
    setConfirmAction,
  };
}
