import { App } from 'obsidian';

import { backgroundPreviewCss, fontToCss } from '../appearance';
import { c } from '../helpers';
import { BackgroundStyle } from '../types';

export type PreviewKind = 'board' | 'lane' | 'card';

export interface PreviewOptions {
  background?: BackgroundStyle;
  textColor?: string;
  font?: string;
}

/**
 * Renders a small, self-contained preview of how a background / text color /
 * font will look on a board, a list or a card.
 */
export function renderAppearancePreview(
  container: HTMLElement,
  app: App,
  kind: PreviewKind,
  options: PreviewOptions
) {
  container.empty();

  const canvas = container.createDiv(`${c('preview')} ${c('preview-canvas')} is-${kind}`);

  const miniCard = (parent: HTMLElement, title: string, withLabels = true) => {
    const card = parent.createDiv(c('preview-card'));
    if (withLabels) {
      const labels = card.createDiv(c('preview-labels'));
      labels.createSpan({ cls: `${c('preview-label')} is-purple`, text: 'Метка' });
      labels.createSpan({ cls: `${c('preview-label')} is-blue` });
    }
    card.createDiv({ cls: c('preview-card-title'), text: title });
    const meta = card.createDiv(c('preview-card-meta'));
    meta.createSpan({ text: '☑ 2/5' });
    meta.createSpan({ text: '12 фев' });
    return card;
  };

  let target: HTMLElement = canvas;

  if (kind === 'board') {
    const lanes = canvas.createDiv(c('preview-lanes'));

    for (let i = 0; i < 2; i++) {
      const lane = lanes.createDiv(c('preview-lane'));
      const header = lane.createDiv(c('preview-lane-header'));
      header.createSpan({ text: i === 0 ? 'В работе' : 'Готово' });
      header.createSpan({ cls: c('preview-lane-count'), text: '3' });
      miniCard(lane, i === 0 ? 'Пример карточки' : 'Вторая карточка');
    }
  } else if (kind === 'lane') {
    const lane = canvas.createDiv(c('preview-lane is-single'));
    const header = lane.createDiv(c('preview-lane-header'));
    header.createSpan({ text: 'Список' });
    header.createSpan({ cls: c('preview-lane-count'), text: '2' });
    miniCard(lane, 'Пример карточки');
    miniCard(lane, 'Ещё одна карточка');
    target = lane;
  } else {
    const card = canvas.createDiv(c('preview-card is-single'));
    const labels = card.createDiv(c('preview-labels'));
    labels.createSpan({ cls: `${c('preview-label')} is-purple`, text: 'Метка' });
    labels.createSpan({ cls: `${c('preview-label')} is-blue` });
    card.createDiv({ cls: c('preview-card-title'), text: 'Пример карточки' });
    card.createDiv({ cls: c('preview-card-meta'), text: '☑ 2/5   ·   12 фев' });
    target = card;
  }

  if (options.background) {
    const css = backgroundPreviewCss(app, options.background);
    target.setCssStyles(css as any);

    if (options.background.type === 'image') {
      const scrim = document.createElement('div');
      scrim.className = c('preview-scrim');
      scrim.style.background = `rgba(0, 0, 0, ${options.background.dim ?? 0.18})`;
      target.prepend(scrim);
    }
  }

  if (options.textColor) {
    target.style.color = options.textColor;
  }

  if (options.font) {
    target.setCssStyles(fontToCss(options.font) as any);
  }
}
