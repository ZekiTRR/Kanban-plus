import { App, FuzzySuggestModal, Modal, Notice, TFile } from 'obsidian';
import { t } from 'src/lang/helpers';

import { colorPalette } from '../colors';
import { c } from '../helpers';
import { BackgroundStyle } from '../types';
import { gradientPresets } from '../appearance';
import { PreviewKind, renderAppearancePreview } from './preview';

class ImageSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onChoose: (path: string) => void
  ) {
    super(app);
    this.setPlaceholder(t('Image path...'));
  }

  getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.path));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file.path);
  }
}

type BackgroundTab = 'color' | 'gradient' | 'image';
type ImageSource = 'vault' | 'url' | 'local';

/** Opens the OS file picker (desktop only); falls back to manual input. */
function pickLocalImage(onChoose: (path: string) => void) {
  try {
    const win = activeWindow as any;
    const remote = win.require?.('electron')?.remote;

    if (!remote?.dialog) {
      new Notice(t('Please enter the file path manually.'));
      return;
    }

    const result = remote.dialog.showOpenDialogSync({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
        },
      ],
    });

    if (result && result[0]) onChoose(result[0]);
  } catch (e) {
    new Notice(t('Please enter the file path manually.'));
  }
}

export class BackgroundModal extends Modal {
  private type: BackgroundTab;
  private source: ImageSource;
  private value: string;
  private dim: number;
  private kind: PreviewKind;
  private previewEl: HTMLElement;
  private bodyEl: HTMLElement;
  private tabButtons: HTMLElement[] = [];

  constructor(
    app: App,
    current: BackgroundStyle | undefined,
    private onApply: (background: BackgroundStyle | null) => void,
    kind: PreviewKind = 'card'
  ) {
    super(app);
    this.type = (current?.type as BackgroundTab) || 'color';
    this.source = (current?.source as ImageSource) || 'vault';
    this.value = current?.value || colorPalette[5];
    this.dim = current?.dim ?? 0.18;
    this.kind = kind;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(c('background-modal'));

    contentEl.createEl('h3', { text: t('Background') });

    const tabs = contentEl.createDiv(c('background-tabs'));
    const tabDefs: Array<[BackgroundTab, string]> = [
      ['color', t('Color')],
      ['gradient', t('Gradient')],
      ['image', t('Image')],
    ];

    tabDefs.forEach(([tab, label]) => {
      const btn = tabs.createEl('button', { text: label });
      btn.addEventListener('click', () => {
        this.type = tab;

        if (tab === 'color' && !/^#|^rgb|^hsl/.test(this.value)) {
          this.value = colorPalette[5];
        }

        if (tab === 'gradient' && !this.value.startsWith('linear-gradient')) {
          this.value = gradientPresets[0].value;
        }

        if (
          tab === 'image' &&
          (this.value.startsWith('#') || this.value.startsWith('linear-gradient'))
        ) {
          this.value = '';
        }

        this.updateTabs();
        this.renderBody();
      });
      this.tabButtons.push(btn);
    });

    this.previewEl = contentEl.createDiv(c('background-preview'));

    this.bodyEl = contentEl.createDiv(c('background-body'));

    const btnRow = contentEl.createDiv('modal-button-container');

    const clearBtn = btnRow.createEl('button', { text: t('Remove background') });
    clearBtn.addEventListener('click', () => {
      this.onApply(null);
      this.close();
    });

    const cancelBtn = btnRow.createEl('button', { text: t('Cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const applyBtn = btnRow.createEl('button', { text: t('Apply') });
    applyBtn.addClass('mod-cta');
    applyBtn.addEventListener('click', () => {
      if (!this.value) {
        this.onApply(null);
      } else {
        this.onApply({
          type: this.type,
          source: this.type === 'image' ? this.source : undefined,
          value: this.value,
          dim: this.type === 'image' ? this.dim : undefined,
        });
      }
      this.close();
    });

    this.updateTabs();
    this.renderBody();
  }

  private updateTabs() {
    this.tabButtons.forEach((btn, index) => {
      const tab = (['color', 'gradient', 'image'] as BackgroundTab[])[index];
      btn.toggleClass('is-active', tab === this.type);
    });
  }

  private updatePreview() {
    renderAppearancePreview(this.previewEl, this.app, this.kind, {
      background: this.value
        ? {
            type: this.type,
            source: this.type === 'image' ? this.source : undefined,
            value: this.value,
            dim: this.dim,
          }
        : undefined,
    });
  }

  private renderBody() {
    const body = this.bodyEl;
    body.empty();

    if (this.type === 'color') {
      const grid = body.createDiv(c('background-grid'));
      colorPalette.forEach((color) => {
        const swatch = grid.createEl('button', { cls: c('background-swatch') });
        swatch.setCssStyles({ backgroundColor: color });
        swatch.toggleClass('is-active', this.value.toLowerCase() === color.toLowerCase());
        swatch.addEventListener('click', () => {
          this.value = color;
          this.renderBody();
        });
      });

      const custom = body.createDiv(c('background-custom'));
      custom.createEl('span', { text: t('Custom color') + ': ' });
      const input = custom.createEl('input', { type: 'color' });
      input.value = this.value.startsWith('#') ? this.value : colorPalette[5];
      input.addEventListener('input', () => {
        this.value = input.value;
        this.updatePreview();
      });
    }

    if (this.type === 'gradient') {
      const grid = body.createDiv(c('background-grid'));
      gradientPresets.forEach((preset) => {
        const swatch = grid.createEl('button', { cls: c('background-swatch') });
        swatch.setCssStyles({ backgroundImage: preset.value });
        swatch.toggleClass('is-active', this.value === preset.value);
        swatch.addEventListener('click', () => {
          this.value = preset.value;
          this.renderBody();
        });
      });

      const custom = body.createDiv(c('background-custom-column'));
      custom.createEl('span', { text: t('Custom gradient') + ':' });
      const input = custom.createEl('input', { type: 'text' });
      input.value = this.value.startsWith('linear-gradient') ? this.value : '';
      input.placeholder = 'linear-gradient(135deg, #667eea, #764ba2)';
      input.addEventListener('input', () => {
        this.value = input.value;
        this.updatePreview();
      });
    }

    if (this.type === 'image') {
      const sources = body.createDiv(c('background-sources'));
      const sourceDefs: Array<[ImageSource, string]> = [
        ['vault', t('Vault')],
        ['url', t('URL')],
        ['local', t('Local file')],
      ];

      sourceDefs.forEach(([source, label]) => {
        const btn = sources.createEl('button', { text: label });
        btn.toggleClass('is-active', this.source === source);
        btn.addEventListener('click', () => {
          this.source = source;
          this.value = '';
          this.renderBody();
        });
      });

      if (this.source === 'vault') {
        const row = body.createDiv(c('background-image-row'));
        const choose = row.createEl('button', { text: t('Choose image') });
        choose.addEventListener('click', () => {
          new ImageSuggestModal(this.app, (path) => {
            this.value = path;
            this.renderBody();
          }).open();
        });

        if (this.value && !/^https?:/.test(this.value)) {
          row.createSpan({ text: this.value, cls: c('background-image-path') });
        }
      }

      if (this.source === 'url') {
        const input = body.createEl('input', {
          type: 'text',
          cls: c('background-image-path-input'),
          attr: { placeholder: 'https://example.com/image.jpg' },
        });
        input.value = this.value.startsWith('http') ? this.value : '';
        input.addEventListener('input', () => {
          this.value = input.value.trim();
          this.updatePreview();
        });
      }

      if (this.source === 'local') {
        const row = body.createDiv(c('background-image-row'));
        const choose = row.createEl('button', { text: t('Choose file') });
        choose.addEventListener('click', () => {
          pickLocalImage((path) => {
            this.value = path;
            this.renderBody();
          });
        });

        const input = body.createEl('input', {
          type: 'text',
          cls: c('background-image-path-input'),
          attr: { placeholder: 'C:\\Users\\me\\Pictures\\bg.jpg' },
        });
        input.value = this.value && /^(?:[A-Za-z]:|\\|\/)/.test(this.value) ? this.value : '';
        input.addEventListener('input', () => {
          this.value = input.value.trim();
          this.updatePreview();
        });
      }

      const dimRow = body.createDiv(c('background-dim-row'));
      dimRow.createEl('span', { text: t('Darken image') });
      const range = dimRow.createEl('input', { type: 'range' });
      range.setAttribute('min', '0');
      range.setAttribute('max', '0.8');
      range.setAttribute('step', '0.05');
      range.value = String(this.dim);
      const val = dimRow.createSpan({ text: `${Math.round(this.dim * 100)}%` });
      range.addEventListener('input', () => {
        this.dim = Number(range.value);
        val.setText(`${Math.round(this.dim * 100)}%`);
        this.updatePreview();
      });
    }

    this.updatePreview();
  }

  onClose() {
    this.contentEl.empty();
  }
}
