import classcat from 'classcat';
import { getLinkpath, moment } from 'obsidian';
import { JSX, useMemo } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

import { Icon } from '../Icon/Icon';
import { c } from '../helpers';
import { DateColor, Item } from '../types';
import { getItemPeriod } from './period';

export function getRelativeDate(date: moment.Moment, time: moment.Moment) {
  if (time) {
    return time.from(moment());
  }

  const today = moment().startOf('day');

  if (today.isSame(date, 'day')) {
    return t('today');
  }

  const diff = date.diff(today, 'day');

  if (diff === -1) {
    return t('yesterday');
  }

  if (diff === 1) {
    return t('tomorrow');
  }

  return date.from(today);
}

interface DateProps {
  item: Item;
  stateManager: StateManager;
}

export function RelativeDate({ item, stateManager }: DateProps) {
  const shouldShowRelativeDate = stateManager.useSetting('show-relative-date');

  if (!shouldShowRelativeDate || !item.data.metadata.date) {
    return null;
  }

  const relativeDate = getRelativeDate(item.data.metadata.date, item.data.metadata.time);

  return <span className={c('item-metadata-date-relative')}>{relativeDate}</span>;
}

interface DateAndTimeProps {
  onEditDate?: JSX.MouseEventHandler<HTMLSpanElement>;
  onEditTime?: JSX.MouseEventHandler<HTMLSpanElement>;
  filePath: string;
  getDateColor: (date: moment.Moment) => DateColor;
}

export function DateAndTime({
  item,
  stateManager,
  filePath,
  onEditDate,
  onEditTime,
  getDateColor,
}: DateProps & DateAndTimeProps) {
  const moveDates = stateManager.useSetting('move-dates');
  const dateFormat = stateManager.useSetting('date-format');
  const timeFormat = stateManager.useSetting('time-format');
  const dateDisplayFormat = stateManager.useSetting('date-display-format');
  const shouldLinkDate = stateManager.useSetting('link-date-to-daily-note');

  const startDate = item.data.metadata.startDate;
  const dueDate = item.data.metadata.date;
  const period = useMemo(() => getItemPeriod(item), [item]);

  const targetDate = item.data.metadata.time ?? dueDate ?? startDate;
  const dateColor = useMemo(() => {
    if (!targetDate) return null;
    return getDateColor(targetDate);
  }, [targetDate, getDateColor]);

  // Kanban Plus: semantic due-badge state (custom date-colors rules take precedence)
  const dueState = useMemo(() => {
    if (item.data.checked) return 'is-complete';

    const today = moment().startOf('day');
    const start = item.data.metadata.startDate;
    const due = item.data.metadata.date;

    if (due && due.isBefore(today, 'day')) return 'is-overdue';
    if (due && due.isSame(today, 'day')) return 'is-today';
    if (start && due && today.isBetween(start, due, 'day', '[]')) return 'is-in-progress';
    if (start && !due && start.isSame(today, 'day')) return 'is-today';

    return null;
  }, [item]);

  if (!moveDates || !targetDate) return null;

  const dateStr = targetDate.format(dateFormat);

  if (!dateStr) return null;

  const hasDate = !!dueDate;
  const hasStart = !!startDate;
  const hasTime = !!item.data.metadata.time;
  const isPeriod = period.isRange;

  const dateDisplayStr = targetDate.format(dateDisplayFormat);
  const timeDisplayStr = !hasTime ? null : targetDate.format(timeFormat);

  const datePath = dateStr ? getLinkpath(dateStr) : null;
  const isResolved = dateStr
    ? stateManager.app.metadataCache.getFirstLinkpathDest(datePath, filePath)
    : null;
  const date =
    datePath && shouldLinkDate ? (
      <a
        href={datePath}
        data-href={datePath}
        className={`internal-link ${isResolved ? '' : 'is-unresolved'}`}
        target="blank"
        rel="noopener"
      >
        {dateDisplayStr}
      </a>
    ) : (
      dateDisplayStr
    );

  const dateProps: HTMLAttributes<HTMLSpanElement> = {};

  if (!shouldLinkDate) {
    dateProps['aria-label'] = t('Change date');
    dateProps.onClick = onEditDate;
  }

  // Kanban Plus: a card with both dates shows its deadline span at a glance.
  if (isPeriod && period.start && period.end) {
    const startStr = period.start.format(dateDisplayFormat);
    const endStr = period.end.format(dateDisplayFormat);

    return (
      <span
        style={
          dateColor && {
            '--date-color': dateColor.color,
            '--date-background-color': dateColor.backgroundColor,
          }
        }
        className={classcat([
          c('item-metadata-date-wrapper'),
          c('item-metadata-period'),
          c('date'),
          {
            'has-background': !!dateColor?.backgroundColor,
            [dueState]: !!dueState,
            'is-complete': !!item.data.checked,
          },
        ])}
        title={t('Click to edit the period')}
      >
        {dueState === 'is-overdue' && <Icon name="lucide-alarm-clock" />}
        <Icon name="lucide-calendar-range" className={c('period-icon')} />
        <span className={c('period-start')}>{startStr}</span>
        <span className={c('period-sep')}>–</span>
        <span className={c('period-end')}>{endStr}</span>
      </span>
    );
  }

  return (
    <span
      style={
        dateColor && {
          '--date-color': dateColor.color,
          '--date-background-color': dateColor.backgroundColor,
        }
      }
      className={classcat([
        c('item-metadata-date-wrapper'),
        c('date'),
        {
          'has-background': !!dateColor?.backgroundColor,
          [dueState]: !!dueState,
          'is-complete': !!item.data.checked && hasDate,
          'is-period-start': hasStart && !hasDate,
        },
      ])}
    >
      {hasStart && !hasDate && <Icon name="lucide-calendar-clock" className={c('period-icon')} />}
      {hasStart && !hasDate && (
        <span className={c('item-metadata-date')}>
          {startDate.format(dateDisplayFormat)}
        </span>
      )}
      {hasDate && (
        <>
          {dueState === 'is-overdue' && <Icon name="lucide-alarm-clock" />}
          <span
            {...dateProps}
            className={`${c('item-metadata-date')} ${!shouldLinkDate ? 'is-button' : ''}`}
          >
            {date}
          </span>{' '}
        </>
      )}
      {hasTime && (
        <span
          onClick={onEditTime}
          className={`${c('item-metadata-time')} is-button`}
          aria-label={t('Change time')}
        >
          {timeDisplayStr}
        </span>
      )}
    </span>
  );
}
