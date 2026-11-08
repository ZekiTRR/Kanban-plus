import classcat from 'classcat';
import { useMemo, useContext } from 'preact/compat';
import { t } from 'src/lang/helpers';

import { StateManager } from 'src/StateManager';
import { DateFilter, SearchContext } from './context';
import { c } from './helpers';
import { Icon } from './Icon/Icon';
import { Board, TagColor } from './types';

interface FilterBarProps {
  board: Board;
  stateManager: StateManager;
}

const dateFilters: Array<{ key: DateFilter; label: string; icon: string }> = [
  { key: 'overdue', label: t('Overdue'), icon: 'lucide-alarm-clock' },
  { key: 'today', label: t('Today'), icon: 'lucide-calendar-check' },
  { key: 'week', label: t('Next 7 days'), icon: 'lucide-calendar-range' },
];

export function FilterBar({ board, stateManager }: FilterBarProps) {
  const search = useContext(SearchContext);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();

    board.children.forEach((lane) =>
      lane.children.forEach((item) =>
        item.data.metadata.tags?.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1))
      )
    );

    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [board]);

  const hasDates = useMemo(
    () =>
      board.children.some((lane) =>
        lane.children.some(
          (item) => !!(item.data.metadata.date || item.data.metadata.startDate)
        )
      ),
    [board]
  );

  if (!search || (!tags.length && !hasDates)) {
    return null;
  }

  const { tagFilter, dateFilter, setTagFilter, setDateFilter } = search;
  const hasActiveFilters = tagFilter.size > 0 || !!dateFilter;

  const tagColors = stateManager.getSetting('tag-colors') as TagColor[] | undefined;
  const getTagStyle = (tag: string) => {
    const match = tagColors?.find((tc) => tc.tagKey === tag);
    return match ? { backgroundColor: match.backgroundColor, color: match.color } : undefined;
  };

  const toggleTag = (tag: string) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const clearAll = () => {
    setTagFilter(new Set());
    setDateFilter(null);
  };

  return (
    <div className={classcat([c('filter-bar'), { 'is-filtering': hasActiveFilters }])}>
      {hasDates &&
        dateFilters.map((f) => (
          <a
            key={f.key}
            className={classcat([
              c('filter-chip'),
              'clickable-icon',
              { 'is-active': dateFilter === f.key },
            ])}
            onClick={() => setDateFilter(dateFilter === f.key ? null : f.key)}
          >
            <Icon name={f.icon} />
            <span>{f.label}</span>
          </a>
        ))}
      {tags.map(([tag, count]) => (
        <a
          key={tag}
          className={classcat([c('filter-chip'), 'clickable-icon', { 'is-active': tagFilter.has(tag) }])}
          onClick={() => toggleTag(tag)}
          style={getTagStyle(tag)}
        >
          <span>{tag}</span>
          <span className={c('filter-chip-count')}>{count}</span>
        </a>
      ))}
      {hasActiveFilters && (
        <a
          className={classcat([c('filter-chip'), 'clickable-icon', 'is-clear'])}
          onClick={clearAll}
          aria-label={t('Clear filters')}
        >
          <Icon name="lucide-x" />
          <span>{t('Clear filters')}</span>
        </a>
      )}
    </div>
  );
}
