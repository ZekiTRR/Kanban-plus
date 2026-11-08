import update from 'immutability-helper';
import { colord } from 'colord';
import { App, Menu, Modal } from 'obsidian';
import { RgbaStringColorPicker } from 'react-colorful';

import { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

import { Board, BackgroundStyle, Item, ItemStyle, LaneStyle, TagColor } from './types';

/** Base palette (Trello-inspired) */
export const colorPalette: string[] = [
  '#61bd4f', // green
  '#f2d600', // yellow
  '#ffab4a', // orange
  '#eb5a46', // red
  '#c377e0', // purple
  '#0079bf', // blue
  '#00c2e0', // sky
  '#51e898', // lime
  '#ff80ce', // pink
  '#9aa3ad', // gray
];

export function isValidColor(color: string | undefined | null): boolean {
  return !!color && colord(color).isValid();
}

export function getReadableTextColor(bgColor: string): string {
  const c = colord(bgColor);
  return c.isDark() ? '#f5f6f8' : '#1f2328';
}

export function normalizeColor(color: string): string {
  const c = colord(color);
  const rgb = c.toRgb();
  return rgb.a < 1 ? c.toRgbString() : c.toHex();
}

/**
 * CSS custom properties to tint a lane header (and optionally its body).
 * The header receives the solid color, the body a light wash of it.
 */
export function laneColorToCssVars(
  color: string | undefined,
  opts: { tintBody: boolean }
): Record<string, string> {
  if (!isValidColor(color)) return {};

  const hex = normalizeColor(color as string);
  const c = colord(hex);
  const vars: Record<string, string> = {
    '--lane-color': hex,
    '--lane-color-header-bg': hex,
    '--lane-color-header-fg': getReadableTextColor(hex),
  };

  if (opts.tintBody) {
    const rgb = c.toRgb();
    vars['--lane-color-body-bg'] = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`;
  }

  return vars;
}

/**
 * CSS custom properties for a colored card, either as a top strip or as a full background.
 */
export function itemColorToCssVars(
  color: string | undefined,
  style: 'strip' | 'full'
): Record<string, string> {
  if (!isValidColor(color)) return {};

  const hex = normalizeColor(color as string);
  const vars: Record<string, string> = {
    '--item-color': hex,
  };

  if (style === 'full') {
    const rgb = colord(hex).toRgb();
    vars['--item-color-bg'] = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`;
  }

  return vars;
}

interface AddColorMenuParams {
  currentColor?: string;
  onPick: (color: string) => void;
  onClear?: () => void;
}

/**
 * Adds a color picker section to an Obsidian menu: the base palette,
 * a custom color option and an optional "remove color" action.
 * NOTE: Menu.addItem() returns the parent Menu, not the submenu — the
 * submenu must be captured inside the addItem callback via setSubmenu().
 */
export function addColorMenu(menu: Menu, { currentColor, onPick, onClear }: AddColorMenuParams) {
  menu.addItem((item) => {
    (item as any).setTitle(t('Color')).setIcon('lucide-palette');
    const submenu = (item as any).setSubmenu() as Menu;

    colorPalette.forEach((color) => {
      submenu.addItem((i) => {
        (i as any).setIcon('lucide-paintbrush').setChecked(currentColor === color).onClick(() => onPick(color));

        i.setTitle(
          createFragment((frag) => {
            frag.createEl('span', {
              cls: 'kanban-plugin__color-swatch',
              attr: { style: `background:${color}` },
            });
            frag.createEl('span', { cls: 'kanban-plugin__color-swatch-label', text: color });
          })
        );
      });
    });

    submenu.addItem((i) => {
      i.setIcon('lucide-pipette')
        .setTitle(t('Custom color'))
        .onClick(() => {
          new ColorPickerModal(app, currentColor, onPick).open();
        });
    });

    if (onClear) {
      submenu.addSeparator();
      submenu.addItem((i) => {
        i.setIcon('lucide-x').setTitle(t('Remove color')).onClick(() => onClear());
      });
    }
  });
}

export class ColorPickerModal extends Modal {
  private color: string;
  private onPick: (color: string) => void;
  private mounted = false;

  constructor(app: App, color: string | undefined, onPick: (color: string) => void) {
    super(app);
    this.color = color || '#0079bf';
    this.onPick = onPick;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('kanban-plugin__color-picker-modal');
    contentEl.createEl('h3', { text: t('Custom color') });

    const pickerHost = contentEl.createDiv();
    const preview = contentEl.createEl('input', { type: 'text', value: this.color });
    preview.addClass('kanban-plugin__color-picker-input');
    preview.setAttribute('spellcheck', 'false');

    // Native fallback, always works even if react-colorful fails to load
    const native = contentEl.createEl('input', { type: 'color' });
    native.addClass('kanban-plugin__color-picker-native');
    native.value = this.color;

    const apply = (color: string) => {
      this.color = color;
      preview.value = color;
      if (isValidColor(color)) native.value = normalizeColor(color);
    };

    native.addEventListener('input', () => apply(native.value));
    native.addEventListener('change', () => apply(native.value));

    import('preact/compat').then(({ render, createElement, unmountComponentAtNode }) => {
      try {
        render(
          createElement(RgbaStringColorPicker, {
            color: this.color,
            onChange: (color: string) => apply(color),
          }),
          pickerHost
        );
        this.mounted = true;
        // Keep the native picker in sync with the colorful picker
        const sync = () => {
          if (this.mounted) native.value = normalizeColor(this.color);
        };
        sync();
      } catch (e) {
        // react-colorful is optional; native input above still works
        pickerHost.remove();
      }
      void unmountComponentAtNode;
    }).catch(() => {
      // Ignore load failures — native color input is sufficient
    });

    preview.addEventListener('change', () => {
      if (isValidColor(preview.value)) {
        apply(normalizeColor(preview.value));
      }
    });

    const btnRow = contentEl.createDiv('modal-button-container');
    const okBtn = btnRow.createEl('button', { text: t('Submit') });
    okBtn.addClass('mod-cta');
    okBtn.addEventListener('click', () => {
      this.onPick(normalizeColor(this.color));
      this.close();
    });
  }

  onClose() {
    this.mounted = false;
    this.contentEl.empty();
  }
}

function withLaneStyles(board: Board, op: (styles: LaneStyle[]) => LaneStyle[]): Board {
  const styles = board.data.settings['lane-styles'] as LaneStyle[] | undefined;
  if (!styles) return board;

  const settings = { ...board.data.settings };
  settings['lane-styles'] = op([...styles]);

  return update(board, { data: { settings: { $set: settings } } });
}

/**
 * Lane-styles maintenance ops mirroring the list-collapse maintenance in
 * boardModifiers / handleDrop. Each is a no-op until the key exists.
 */
export function laneStylesAfterAppendLane(board: Board): Board {
  return withLaneStyles(board, (s) => (s.push({}), s));
}

export function laneStylesAfterInsertLane(board: Board, index: number): Board {
  return withLaneStyles(board, (s) => (s.splice(index, 0, {}), s));
}

export function laneStylesAfterRemoveLane(board: Board, index: number): Board {
  return withLaneStyles(board, (s) => (s.splice(index, 1), s));
}

export function laneStylesAfterDuplicateLane(board: Board, index: number): Board {
  return withLaneStyles(board, (s) => (s.splice(index, 0, { ...(s[index] || {}) }), s));
}

export function laneStylesAfterMoveLane(board: Board, from: number, to: number): Board {
  return withLaneStyles(board, (s) => {
    const [entry] = s.splice(from, 1);
    s.splice(to, 0, entry ?? {});
    return s;
  });
}

function isLaneStyleEmpty(style: LaneStyle | undefined): boolean {
  return (
    !style ||
    (!style.color && !style.pos && !style.background && !style.font && !style.textColor)
  );
}

function isItemStyleEmpty(style: ItemStyle | undefined): boolean {
  return !style || (!style.color && !style.background && !style.font && !style.textColor);
}

/** Sets (or clears) the color of the lane at the given index, creating the styles array on demand. */
export function setLaneColor(
  stateManager: StateManager,
  laneIndex: number,
  laneCount: number,
  color: string | null
) {
  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    if (!color && !settings['lane-styles']) return board;

    const styles = [...((settings['lane-styles'] as LaneStyle[]) || [])];
    while (styles.length < laneCount) styles.push({});

    const entry: LaneStyle = { ...(styles[laneIndex] || {}) };
    if (color) entry.color = normalizeColor(color);
    else delete entry.color;
    styles[laneIndex] = entry;

    if (styles.every(isLaneStyleEmpty)) {
      delete settings['lane-styles'];
    } else {
      settings['lane-styles'] = styles;
    }

    return update(board, { data: { settings: { $set: settings } } });
  });
}

/** Sets (or clears) the free-floating position of the lane at the given index. */
export function setLanePos(
  stateManager: StateManager,
  laneIndex: number,
  laneCount: number,
  pos: { x: number; y: number } | null
) {
  stateManager.setState((board) => {
    const settings = { ...board.data.settings };

    const styles = [...((settings['lane-styles'] as LaneStyle[]) || [])];
    while (styles.length < laneCount) styles.push({});

    const entry: LaneStyle = { ...(styles[laneIndex] || {}) };
    if (pos) entry.pos = { x: Math.round(pos.x), y: Math.round(pos.y) };
    else delete entry.pos;
    styles[laneIndex] = entry;

    if (styles.every(isLaneStyleEmpty)) {
      delete settings['lane-styles'];
    } else {
      settings['lane-styles'] = styles;
    }

    return update(board, { data: { settings: { $set: settings } } });
  });
}

/** Sets or clears the background/font of a lane, preserving its color and position. */
export function setLaneAppearance(
  stateManager: StateManager,
  laneIndex: number,
  laneCount: number,
  patch: { background?: BackgroundStyle | null; font?: string | null; textColor?: string | null }
) {
  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    const styles = [...((settings['lane-styles'] as LaneStyle[]) || [])];
    while (styles.length < laneCount) styles.push({});

    const entry: LaneStyle = { ...(styles[laneIndex] || {}) };

    if ('background' in patch) {
      if (patch.background) entry.background = patch.background;
      else delete entry.background;
    }

    if ('font' in patch) {
      if (patch.font && patch.font.trim()) entry.font = patch.font.trim();
      else delete entry.font;
    }

    if ('textColor' in patch) {
      if (patch.textColor) entry.textColor = normalizeColor(patch.textColor);
      else delete entry.textColor;
    }

    styles[laneIndex] = entry;

    if (styles.every(isLaneStyleEmpty)) {
      delete settings['lane-styles'];
    } else {
      settings['lane-styles'] = styles;
    }

    return update(board, { data: { settings: { $set: settings } } });
  });
}

/** Sets or clears the color of a tag (used by the card window label editor). */
export function setTagColor(
  stateManager: StateManager,
  tagKey: string,
  backgroundColor: string | null
) {
  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    const colors = [...((settings['tag-colors'] as TagColor[]) || [])];
    const index = colors.findIndex((entry) => entry.tagKey === tagKey);

    if (backgroundColor) {
      const bg = normalizeColor(backgroundColor);
      const color = getReadableTextColor(bg);
      const next = { tagKey, color, backgroundColor: bg };

      if (index >= 0) colors[index] = next;
      else colors.push(next);
    } else if (index >= 0) {
      colors.splice(index, 1);
    }

    settings['tag-colors'] = colors;

    return update(board, { data: { settings: { $set: settings } } });
  });
}

/** Sets or clears the color of a card by block id. */
export function setItemColor(stateManager: StateManager, blockId: string, color: string | null) {
  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    const styles = { ...((settings['item-styles'] as Record<string, ItemStyle>) || {}) };

    const entry: ItemStyle = { ...(styles[blockId] || {}) };

    if (color) entry.color = normalizeColor(color);
    else delete entry.color;

    if (isItemStyleEmpty(entry)) delete styles[blockId];
    else styles[blockId] = entry;

    if (Object.keys(styles).length === 0) {
      delete settings['item-styles'];
    } else {
      settings['item-styles'] = styles;
    }

    return update(board, { data: { settings: { $set: settings } } });
  });
}

/** Sets or clears the background/font of a card by block id. */
export function setItemAppearance(
  stateManager: StateManager,
  blockId: string,
  patch: { background?: BackgroundStyle | null; font?: string | null; textColor?: string | null }
) {
  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    const styles = { ...((settings['item-styles'] as Record<string, ItemStyle>) || {}) };
    const entry: ItemStyle = { ...(styles[blockId] || {}) };

    if ('background' in patch) {
      if (patch.background) entry.background = patch.background;
      else delete entry.background;
    }

    if ('font' in patch) {
      if (patch.font && patch.font.trim()) entry.font = patch.font.trim();
      else delete entry.font;
    }

    if ('textColor' in patch) {
      if (patch.textColor) entry.textColor = normalizeColor(patch.textColor);
      else delete entry.textColor;
    }

    if (isItemStyleEmpty(entry)) delete styles[blockId];
    else styles[blockId] = entry;

    if (Object.keys(styles).length === 0) {
      delete settings['item-styles'];
    } else {
      settings['item-styles'] = styles;
    }

    return update(board, { data: { settings: { $set: settings } } });
  });
}

export function itemStyleOf(stateManager: StateManager, item: Item): ItemStyle | undefined {
  const styles = stateManager.getSetting('item-styles');
  return item.data.blockId ? styles?.[item.data.blockId] : undefined;
}

export function laneStyleOf(stateManager: StateManager, laneIndex: number): LaneStyle | undefined {
  const styles = stateManager.getSetting('lane-styles');
  return styles?.[laneIndex];
}
