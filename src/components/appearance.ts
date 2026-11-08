import { App } from 'obsidian';

import { BackgroundStyle } from './types';

export interface BackgroundCss {
  vars: Record<string, string>;
  className: string;
}

export const gradientPresets: Array<{ label: string; value: string }> = [
  { label: 'Sunset', value: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)' },
  { label: 'Ocean', value: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)' },
  { label: 'Grape', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Forest', value: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { label: 'Peach', value: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { label: 'Midnight', value: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
  { label: 'Aurora', value: 'linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)' },
  { label: 'Rose', value: 'linear-gradient(135deg, #ee9ca7 0%, #ffdde1 100%)' },
];

export const fontPresets: Array<{ label: string; value: string }> = [
  { label: 'System', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
  { label: 'Comic', value: '"Comic Sans MS", "Comic Sans", cursive' },
];

const localImageCache = new Map<string, string>();

const imageMimeByExt: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

function localImageToDataUrl(path: string): string | null {
  const cached = localImageCache.get(path);
  if (cached) return cached;

  try {
    const fs = (window as any).require?.('fs');
    if (!fs) return null;

    const ext = (path.split('.').pop() || '').toLowerCase();
    const mime = imageMimeByExt[ext] || 'image/png';
    const base64 = fs.readFileSync(path).toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    localImageCache.set(path, dataUrl);
    return dataUrl;
  } catch (e) {
    return null;
  }
}

/** Resolve an image source (vault path, URL or absolute local path) into CSS. */
export function resolveBackgroundImage(app: App, background: BackgroundStyle): string {
  const value = background.value || '';
  const source = background.source || 'vault';

  if (source === 'url' || /^(https?:|data:|file:|app:)/i.test(value)) {
    return `url("${value.replace(/"/g, '\\"')}")`;
  }

  if (source === 'local') {
    const dataUrl = localImageToDataUrl(value);

    if (dataUrl) return `url("${dataUrl}")`;

    const normalized = value.replace(/\\/g, '/');
    return `url("app://local/${encodeURI(normalized)}")`;
  }

  try {
    const resource = app.vault.adapter.getResourcePath(value);
    return `url("${resource.replace(/"/g, '\\"')}")`;
  } catch (e) {
    return `url("${value.replace(/"/g, '\\"')}")`;
  }
}

export function backgroundToCss(app: App, background?: BackgroundStyle): BackgroundCss {
  if (!background || !background.value) {
    return { vars: {}, className: '' };
  }

  const vars: Record<string, string> = {
    '--kp-bg-dim': String(background.type === 'image' ? background.dim ?? 0.18 : 0),
  };

  if (background.type === 'color') {
    vars['--kp-bg-color'] = background.value;
  } else if (background.type === 'gradient') {
    vars['--kp-bg-image'] = background.value;
  } else if (background.type === 'image') {
    vars['--kp-bg-image'] = resolveBackgroundImage(app, background);
  }

  return {
    vars,
    className: `has-kp-bg kp-bg-${background.type}`,
  };
}

/** Preview CSS used by the background picker swatches. */
export function backgroundPreviewCss(app: App, background: BackgroundStyle): Record<string, string> {
  if (background.type === 'color') {
    return { backgroundColor: background.value };
  }

  if (background.type === 'gradient') {
    return { backgroundImage: background.value };
  }

  return {
    backgroundImage: resolveBackgroundImage(app, background),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

export function fontToCss(font?: string): Record<string, string> {
  if (!font || !font.trim()) return {};
  return { fontFamily: font };
}
