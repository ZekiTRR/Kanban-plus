import { App, Modal } from 'obsidian';
import { t } from 'src/lang/helpers';

import { colorPalette } from '../colors';
import { c } from '../helpers';
import { BackgroundStyle } from '../types';
import { PreviewKind, renderAppearancePreview } from './preview';

export class TextColorModal extends Modal {
  private value: string;
  private previewEl: HTMLElement;

  constructor(
    app: App,
    private kind: PreviewKind,
    current: string | undefined,
    private background: BackgroundStyle | undefined,
    private font: string | undefined,
    private onApply: (color: string | null) => void
  ) {
    super(app);
    this.value = current || '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(c('text-color-modal'));

    contentEl.createEl('h3', { text: t('Text color') });

    this.previewEl = contentEl.createDiv(c('background-preview'));

    const grid = contentEl.createDiv(c('background-grid'));
    colorPalette.forEach((color) => {
      const swatch = grid.createEl('button', { cls: c('background-swatch') });
      swatch.setCssStyles({ backgroundColor: color });
      swatch.toggleClass('is-active', this.value.toLowerCase() === color.toLowerCase());
      swatch.addEventListener('click', () => {
        this.value = color;
        this.update();
        grid.findAll(`.${c('background-swatch')}`).forEach((el) => el.removeClass('is-active'));
        swatch.addClass('is-active');
      });
    });

    const custom = contentEl.createDiv(c('background-custom'));
    custom.createEl('span', { text: t('Custom color') + ': ' });
    const input = custom.createEl('input', { type: 'color' });
    input.value = this.value.startsWith('#') ? this.value : colorPalette[5];
    input.addEventListener('input', () => {
      this.value = input.value;
      this.update();
    });

    const btnRow = contentEl.createDiv('modal-button-container');

    const resetBtn = btnRow.createEl('button', { text: t('Reset text color') });
    resetBtn.addEventListener('click', () => {
      this.onApply(null);
      this.close();
    });

    const cancelBtn = btnRow.createEl('button', { text: t('Cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const applyBtn = btnRow.createEl('button', { text: t('Apply') });
    applyBtn.addClass('mod-cta');
    applyBtn.addEventListener('click', () => {
      this.onApply(this.value || null);
      this.close();
    });

    this.update();
  }

  private update() {
    renderAppearancePreview(this.previewEl, this.app, this.kind, {
      background: this.background,
      textColor: this.value || undefined,
      font: this.font,
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
