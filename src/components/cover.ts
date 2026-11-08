import { App } from 'obsidian';
import { StateManager } from 'src/StateManager';

import { resolveBackgroundImage } from './appearance';
import { BackgroundStyle } from './types';

export type CardCoverSource = 'vault' | 'url' | 'local' | 'gradient' | 'color';

export interface CardCover {
  source: CardCoverSource;
  /** Vault path, URL, local path, CSS gradient or hex color. */
  value: string;
  height: number;
  objectPosition: string;
  objectFit: 'cover' | 'contain';
}

export const defaultCardCover: CardCover = {
  source: 'vault',
  value: '',
  height: 140,
  objectPosition: '50% 50%',
  objectFit: 'cover',
};

export function getCardCover(cover?: CardCover | null): CardCover | null {
  if (!cover || !cover.value) return null;
  return { ...defaultCardCover, ...cover };
}

/** Backwards-compatible shim for the appearance BackgroundStyle used elsewhere. */
export function coverToBackground(cover: CardCover): BackgroundStyle {
  if (cover.source === 'gradient') {
    return { type: 'gradient', value: cover.value };
  }

  if (cover.source === 'color') {
    return { type: 'color', value: cover.value };
  }

  return {
    type: 'image',
    source: cover.source as 'vault' | 'url' | 'local',
    value: cover.value,
    dim: 0,
  };
}

export function coverCss(app: App, cover: CardCover): Record<string, string> {
  if (cover.source === 'color') {
    return { backgroundColor: cover.value };
  }

  if (cover.source === 'gradient') {
    return { backgroundImage: cover.value };
  }

  return {
    backgroundImage: resolveBackgroundImage(app, coverToBackground(cover)),
    backgroundSize: cover.objectFit,
    backgroundPosition: cover.objectPosition,
    backgroundRepeat: cover.objectFit === 'contain' ? 'no-repeat' : 'repeat',
  };
}

export function getCardCoverFor(
  stateManager: StateManager,
  blockId?: string
): CardCover | null {
  if (!blockId) return null;

  return getCardCover(stateManager.getSetting('card-covers')?.[blockId]);
}

/**
 * Raw image URL for cover preloading / error detection.
 * Returns null for color/gradient covers (always valid) and for local files
 * resolved via data URLs (handled synchronously by the resolver).
 */
export function coverImageUrl(app: App, cover: CardCover): string | null {
  if (cover.source === 'color' || cover.source === 'gradient') return null;

  const background = coverToBackground(cover);
  const css = resolveBackgroundImage(app, background);
  const match = css.match(/url\("(.*)"\)/);
  const url = match?.[1];
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  if (url.startsWith('app://local/')) return null;
  return url;
}

/** True when the image location is a plain HTTP(S) URL (testable via Image()). */
export function isTestableImageUrl(url: string): boolean {
  return /^https?:\/\/|^app:\/\/|^obsidian:\/\/|^capacitor:\/\/|^file:\/\//i.test(url);
}

export function setCardCoverFor(
  stateManager: StateManager,
  blockId: string,
  cover: CardCover | null
) {
  if (!blockId) return;

  stateManager.setState((board) => {
    const settings = { ...board.data.settings };
    const all = { ...(settings['card-covers'] || {}) };

    if (cover) all[blockId] = { ...defaultCardCover, ...cover };
    else delete all[blockId];

    if (!Object.keys(all).length) delete settings['card-covers'];
    else settings['card-covers'] = all;

    return {
      ...board,
      data: { ...board.data, settings },
    };
  });
}
