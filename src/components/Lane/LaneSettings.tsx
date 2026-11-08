import update from 'immutability-helper';
import { useContext } from 'preact/compat';
import { Path } from 'src/dnd/types';
import { t } from 'src/lang/helpers';

import { KanbanContext } from '../context';
import { c } from '../helpers';
import { getWipState } from '../../helpers/wipLimits';
import { EditState, Lane, isEditing } from '../types';

export interface LaneSettingsProps {
  lane: Lane;
  lanePath: Path;
  editState: EditState;
}

export function LaneSettings({ lane, lanePath, editState }: LaneSettingsProps) {
  const { boardModifiers, stateManager } = useContext(KanbanContext);

  if (!isEditing(editState)) return null;

  const wip = getWipState(stateManager, lane);
  const currentLimit = wip.limit ?? 0;

  const commitLimit = (value: string) => {
    const parsed = Number(value);
    const next =
      value.trim() === '' || !Number.isFinite(parsed) || parsed <= 0
        ? 0
        : Math.max(0, Math.floor(parsed));

    boardModifiers.updateLane(
      lanePath,
      update(lane, {
        data: {
          maxItems: { $set: next },
        },
      })
    );
  };

  return (
    <div className={c('lane-setting-wrapper')}>
      <div className={c('checkbox-wrapper')}>
        <div className={c('checkbox-label')}>{t('Mark cards in this list as complete')}</div>
        <div
          onClick={() =>
            boardModifiers.updateLane(
              lanePath,
              update(lane, {
                data: { $toggle: ['shouldMarkItemsComplete'] },
              })
            )
          }
          className={`checkbox-container ${lane.data.shouldMarkItemsComplete ? 'is-enabled' : ''}`}
        />
      </div>

      <div className={c('checkbox-wrapper')}>
        <div className={c('checkbox-label')}>{t('WIP limit')}</div>
        <input
          type="number"
          min="0"
          step="1"
          className={c('wip-limit-input')}
          defaultValue={currentLimit ? String(currentLimit) : ''}
          placeholder="0"
          key={currentLimit}
          onBlur={(e) => commitLimit((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitLimit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'Escape') {
              (e.target as HTMLInputElement).value = currentLimit ? String(currentLimit) : '';
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    </div>
  );
}
