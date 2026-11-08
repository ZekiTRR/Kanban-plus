import { StateManager } from 'src/StateManager';

import { Board, Item, Lane } from '../components/types';

export type SwimlaneMode = 'priority' | 'tags' | 'projects' | 'categories' | 'custom';

export interface SwimlaneConfig {
  enabled: boolean;
  mode: SwimlaneMode;
  key?: string;
}

export interface SwimlaneEntry {
  item: Item;
  laneIndex: number;
  itemIndex: number;
  groupKey: string;
  groupLabel: string;
}

export interface SwimlaneGroup {
  key: string;
  label: string;
  entries: SwimlaneEntry[];
  count: number;
}

export const swimlaneModes: Array<{ value: SwimlaneMode; label: string }> = [
  { value: 'priority', label: 'Priority' },
  { value: 'tags', label: 'Tags' },
  { value: 'projects', label: 'Projects' },
  { value: 'categories', label: 'Categories' },
  { value: 'custom', label: 'Custom field' },
];

const priorityOrder = [
  'highest',
  'high',
  'medium',
  'none',
  'low',
  'lowest',
];

const priorityLabels: Record<string, string> = {
  '0': 'Highest',
  '1': 'High',
  '2': 'Medium',
  '3': 'None',
  '4': 'Low',
  '5': 'Lowest',
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  none: 'None',
  low: 'Low',
  lowest: 'Lowest',
  '🔺': 'Highest',
  '⏫': 'High',
  '🔼': 'Medium',
  '🔽': 'Low',
  '⏬': 'Lowest',
};

function metadataValue(item: Item, key: string): string | undefined {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return undefined;

  const inline = item.data.metadata.inlineMetadata?.find(
    (field) => field.key.toLowerCase() === normalized
  );

  if (inline?.value) return String(inline.value).trim();

  const fileValue = (item.data.metadata.fileMetadata as any)?.[normalized]?.value;
  if (fileValue) return String(fileValue).trim();

  return undefined;
}

function firstMetadataValue(item: Item, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadataValue(item, key);
    if (value) return value;
  }

  return undefined;
}

function normalizedPriority(item: Item): string {
  const raw = metadataValue(item, 'priority');

  if (!raw) return 'none';

  const key = raw.trim().toLowerCase();
  return priorityLabels[key] ? key : priorityLabels[raw] ? raw : key;
}

function priorityLabel(item: Item): string {
  const raw = metadataValue(item, 'priority');

  if (!raw) return 'Uncategorized';

  const key = raw.trim().toLowerCase();
  return priorityLabels[key] || priorityLabels[raw] || raw;
}

function groupForItem(item: Item, config: SwimlaneConfig): { key: string; label: string } {
  switch (config.mode) {
    case 'priority': {
      const raw = metadataValue(item, 'priority');

      if (!raw) return { key: '__uncategorized', label: 'Uncategorized' };

      const normalized = normalizedPriority(item);
      return { key: normalized, label: priorityLabel(item) };
    }

    case 'tags': {
      const tag = item.data.metadata.tags?.[0];
      return tag
        ? { key: tag.toLowerCase(), label: tag }
        : { key: '__uncategorized', label: 'Uncategorized' };
    }

    case 'projects': {
      const value =
        firstMetadataValue(item, ['project', 'projectId', 'project_name']) ||
        item.data.metadata.fileMetadata?.['project']?.value;

      if (value) return { key: String(value).toLowerCase(), label: String(value) };

      const target = item.data.metadata.fileAccessor?.target;
      if (target) {
        const name = target.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || target;
        return { key: name.toLowerCase(), label: name };
      }

      return { key: '__uncategorized', label: 'Uncategorized' };
    }

    case 'categories': {
      const value = firstMetadataValue(item, ['category', 'area', 'group', 'track']);
      return value
        ? { key: value.toLowerCase(), label: value }
        : { key: '__uncategorized', label: 'Uncategorized' };
    }

    case 'custom': {
      const value = metadataValue(item, config.key || '');
      return value
        ? { key: value.toLowerCase(), label: value }
        : { key: '__uncategorized', label: 'Uncategorized' };
    }
  }
}

function groupOrder(config: SwimlaneConfig, groups: SwimlaneGroup[]) {
  if (config.mode !== 'priority') {
    return groups.sort((a, b) => {
      if (a.key === '__uncategorized') return 1;
      if (b.key === '__uncategorized') return -1;
      return a.label.localeCompare(b.label);
    });
  }

  const score = (group: SwimlaneGroup) => {
    const index = priorityOrder.indexOf(group.key);
    return index === -1 ? priorityOrder.length : index;
  };

  return groups.sort((a, b) => {
    if (a.key === '__uncategorized') return 1;
    if (b.key === '__uncategorized') return -1;
    return score(a) - score(b) || a.label.localeCompare(b.label);
  });
}

export function buildSwimlanes(board: Board, config: SwimlaneConfig): SwimlaneGroup[] {
  const byGroup = new Map<string, SwimlaneGroup>();

  board.children.forEach((lane: Lane, laneIndex: number) => {
    lane.children.forEach((item, itemIndex) => {
      const group = groupForItem(item, config);
      let entry = byGroup.get(group.key);

      if (!entry) {
        entry = { key: group.key, label: group.label, entries: [], count: 0 };
        byGroup.set(group.key, entry);
      }

      entry.entries.push({ item, laneIndex, itemIndex, groupKey: group.key, groupLabel: group.label });
      entry.count += 1;
    });
  });

  return groupOrder(config, [...byGroup.values()]);
}

export function getSwimlaneConfig(stateManager: StateManager): SwimlaneConfig {
  const setting = stateManager.getSetting('swimlanes');

  if (setting && typeof setting === 'object') {
    return {
      enabled: setting.enabled === true,
      mode: (setting.mode as SwimlaneMode) || 'tags',
      key: setting.key,
    };
  }

  return { enabled: false, mode: 'tags' };
}

export function setSwimlaneConfig(stateManager: StateManager, config: SwimlaneConfig) {
  stateManager.setState((board) => ({
    ...board,
    data: {
      ...board.data,
      settings: {
        ...board.data.settings,
        swimlanes: config,
      },
    },
  }));
}
