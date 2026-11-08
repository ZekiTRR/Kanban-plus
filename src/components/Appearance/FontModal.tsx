import { App, Modal } from 'obsidian';
import { t } from 'src/lang/helpers';

import { fontPresets } from '../appearance';
import { c } from '../helpers';

export class FontModal extends Modal {
  private value: string;

  constructor(
    app: App,
    current: string | undefined,
    private onApply: (font: string | null) => void
  ) {
    super(app);
    this.value = current || '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(c('font-modal'));

    contentEl.createEl('h3', { text: t('Font') });

    const input = contentEl.createEl('input', { type: 'text' });
    input.addClass(c('font-input'));
    input.value = this.value;
    input.placeholder = '-apple-system, "Segoe UI", Roboto, sans-serif';
    input.addEventListener('input', () => {
      this.value = input.value;
    });

    const preview = contentEl.createDiv(c('font-preview'));
    preview.setText('The quick brown fox jumps over the lazy dog');
    const applyPreview = () => {
      preview.style.fontFamily = this.value || '';
    };
    applyPreview();

    const presets = contentEl.createDiv(c('font-presets'));
    fontPresets.forEach((preset) => {
      const chip = presets.createEl('button', { text: preset.label });
      chip.addClass(c('font-preset'));
      chip.style.fontFamily = preset.value;
      chip.toggleClass('is-active', this.value === preset.value);

      chip.addEventListener('click', () => {
        this.value = preset.value;
        input.value = preset.value;
        applyPreview();
        presets.findAll(`.${c('font-preset')}`).forEach((el) => el.removeClass('is-active'));
        chip.addClass('is-active');
      });
    });

    input.addEventListener('input', applyPreview);

    const btnRow = contentEl.createDiv('modal-button-container');

    const resetBtn = btnRow.createEl('button', { text: t('Reset font') });
    resetBtn.addEventListener('click', () => {
      this.onApply(null);
      this.close();
    });

    const cancelBtn = btnRow.createEl('button', { text: t('Cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const applyBtn = btnRow.createEl('button', { text: t('Apply') });
    applyBtn.addClass('mod-cta');
    applyBtn.addEventListener('click', () => {
      this.onApply(this.value.trim() || null);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
