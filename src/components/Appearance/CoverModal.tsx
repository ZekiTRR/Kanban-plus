import { App, FuzzySuggestModal, Modal, Notice, TFile } from 'obsidian';
import { t } from 'src/lang/helpers';

import { gradientPresets } from '../appearance';
import { colorPalette } from '../colors';
import { c } from '../helpers';
import { CardCover, coverCss, defaultCardCover, getCardCover } from '../cover';

class VaultImageModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private onChoose: (path: string) => void) {
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

type Tab = 'color' | 'gradient' | 'image';
type ImageSource = 'vault' | 'url' | 'local';

export class CoverModal extends Modal {
  private tab: Tab;
  private source: ImageSource;
  private value: string;
  private height: number;
  private objectPosition: string;
  private objectFit: 'cover' | 'contain';
  private previewEl: HTMLElement;
  private tabButtons: HTMLElement[] = [];

  constructor(
    app: App,
    current: CardCover | null,
    private onApply: (cover: CardCover | null) => void
  ) {
    super(app);
    const cover = getCardCover(current) || defaultCardCover;
    this.tab =
      cover.source === 'color'
        ? 'color'
        : cover.source === 'gradient'
          ? 'gradient'
          : 'image';
    this.source =
      cover.source === 'vault' || cover.source === 'url' || cover.source === 'local'
        ? cover.source
        : 'vault';
    this.value = cover.value || '';
    this.height = cover.height || defaultCardCover.height;
    this.objectPosition = cover.objectPosition || defaultCardCover.objectPosition;
    this.objectFit = cover.objectFit || defaultCardCover.objectFit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(c('cover-modal'));
    contentEl.createEl('h3', { text: t('Card cover') });

    const tabs = contentEl.createDiv(c('background-tabs'));
    ([
      ['color', t('Color')],
      ['gradient', t('Gradient')],
      ['image', t('Image')],
    ] as Array<[Tab, string]>).forEach(([tab, label]) => {
      const btn = tabs.createEl('button', { text: label });
      btn.addEventListener('click', () => {
        this.tab = tab;
        if (tab === 'color' && !/^#|^rgb|^hsl/.test(this.value)) this.value = colorPalette[5];
        if (tab === 'gradient' && !this.value.startsWith('linear-gradient')) {
          this.value = gradientPresets[0].value;
        }
        this.update();
      });
      this.tabButtons.push(btn);
    });

    this.previewEl = contentEl.createDiv(c('cover-preview-wrap'));
    this.bodyEl = contentEl.createDiv(c('background-body'));

    const btnRow = contentEl.createDiv('modal-button-container');
    const remove = btnRow.createEl('button', { text: t('Remove cover') });
    remove.addEventListener('click', () => {
      this.onApply(null);
      this.close();
    });
    const cancel = btnRow.createEl('button', { text: t('Cancel') });
    cancel.addEventListener('click', () => this.close());
    const apply = btnRow.createEl('button', { text: t('Apply') });
    apply.addClass('mod-cta');
    apply.addEventListener('click', () => {
      if (!this.value) this.onApply(null);
      else {
        this.onApply({
          source: this.tab === 'image' ? this.source : this.tab,
          value: this.value,
          height: this.height,
          objectPosition: this.objectPosition,
          objectFit: this.objectFit,
        });
      }
      this.close();
    });

    this.update();
  }

  private bodyEl: HTMLElement;

  private cover(): CardCover {
    return {
      source: this.tab === 'image' ? this.source : this.tab,
      value: this.value,
      height: this.height,
      objectPosition: this.objectPosition,
      objectFit: this.objectFit,
    };
  }

  private update() {
    this.tabButtons.forEach((btn, index) => {
      const tab = (['color', 'gradient', 'image'] as Tab[])[index];
      btn.toggleClass('is-active', tab === this.tab);
    });

    this.renderBody();
    this.renderPreview();
  }

  private renderBody() {
    const body = this.bodyEl;
    body.empty();

    if (this.tab === 'color') {
      const grid = body.createDiv(c('background-grid'));
      colorPalette.forEach((color) => {
        const swatch = grid.createEl('button', { cls: c('background-swatch') });
        swatch.setCssStyles({ backgroundColor: color });
        swatch.toggleClass('is-active', this.value.toLowerCase() === color.toLowerCase());
        swatch.addEventListener('click', () => {
          this.value = color;
          this.update();
        });
      });

      const custom = body.createDiv(c('background-custom'));
      const input = custom.createEl('input', { type: 'color' });
      input.value = this.value.startsWith('#') ? this.value : colorPalette[5];
      input.addEventListener('input', () => {
        this.value = input.value;
        this.renderPreview();
      });
    }

    if (this.tab === 'gradient') {
      const grid = body.createDiv(c('background-grid'));
      gradientPresets.forEach((preset) => {
        const swatch = grid.createEl('button', { cls: c('background-swatch') });
        swatch.setCssStyles({ backgroundImage: preset.value });
        swatch.toggleClass('is-active', this.value === preset.value);
        swatch.addEventListener('click', () => {
          this.value = preset.value;
          this.update();
        });
      });

      const custom = body.createDiv(c('background-custom-column'));
      custom.createEl('span', { text: `${t('Custom gradient')}:` });
      const input = custom.createEl('input', { type: 'text' });
      input.value = this.value.startsWith('linear-gradient') ? this.value : '';
      input.placeholder = 'linear-gradient(135deg, #667eea, #764ba2)';
      input.addEventListener('input', () => {
        this.value = input.value;
        this.renderPreview();
      });
    }

    if (this.tab === 'image') {
      const sources = body.createDiv(c('background-sources'));
      ([
        ['vault', t('Vault')],
        ['url', t('URL')],
        ['local', t('Local file')],
      ] as Array<[ImageSource, string]>).forEach(([source, label]) => {
        const btn = sources.createEl('button', { text: label });
        btn.toggleClass('is-active', this.source === source);
        btn.addEventListener('click', () => {
          this.source = source;
          this.value = '';
          this.update();
        });
      });

      if (this.source === 'vault') {
        const row = body.createDiv(c('background-image-row'));
        const choose = row.createEl('button', { text: t('Choose image') });
        choose.addEventListener('click', () => {
          new VaultImageModal(this.app, (path) => {
            this.value = path;
            this.update();
          }).open();
        });
        if (this.value) row.createSpan({ text: this.value, cls: c('background-image-path') });
      }

      if (this.source === 'url') {
        const input = body.createEl('input', {
          type: 'text',
          cls: c('background-image-path-input'),
          attr: { placeholder: 'https://example.com/image.gif' },
        });
        input.value = this.value.startsWith('http') ? this.value : '';
        input.addEventListener('input', () => {
          this.value = input.value.trim();
          this.renderPreview();
        });
      }

      if (this.source === 'local') {
        const row = body.createDiv(c('background-image-row'));
        const choose = row.createEl('button', { text: t('Choose file') });
        choose.addEventListener('click', () => {
          pickLocalImage((path) => {
            this.value = path;
            this.update();
          });
        });

        const input = body.createEl('input', {
          type: 'text',
          cls: c('background-image-path-input'),
          attr: { placeholder: 'C:\\Users\\me\\Pictures\\cover.gif' },
        });
        input.value = this.value && /^(?:[A-Za-z]:|\\|\/)/.test(this.value) ? this.value : '';
        input.addEventListener('input', () => {
          this.value = input.value.trim();
          this.renderPreview();
        });
      }
    }

    const heightRow = body.createDiv(c('background-dim-row'));
    heightRow.createEl('span', { text: t('Cover height') });
    const heightInput = heightRow.createEl('input', { type: 'range' });
    heightInput.setAttribute('min', '60');
    heightInput.setAttribute('max', '320');
    heightInput.setAttribute('step', '10');
    heightInput.value = String(this.height);
    const heightVal = heightRow.createSpan({ text: `${this.height}px` });
    heightInput.addEventListener('input', () => {
      this.height = Number(heightInput.value);
      heightVal.setText(`${this.height}px`);
      this.renderPreview();
    });

    const posRow = body.createDiv(c('background-dim-row'));
    posRow.createEl('span', { text: t('Image position') });
    const position = posRow.createEl('select');
    [
      ['0% 0%', t('Top')],
      ['50% 0%', t('Top center')],
      ['100% 0%', t('Top right')],
      ['0% 50%', t('Left')],
      ['50% 50%', t('Center')],
      ['100% 50%', t('Right')],
      ['0% 100%', t('Bottom')],
      ['50% 100%', t('Bottom center')],
      ['100% 100%', t('Bottom right')],
    ].forEach(([value, label]) => position.createEl('option', { text: label, value }));
    position.value = this.objectPosition;
    position.addEventListener('change', () => {
      this.objectPosition = position.value;
      this.renderPreview();
    });

    const fitRow = body.createDiv(c('background-dim-row'));
    fitRow.createEl('span', { text: t('Image fit') });
    const fit = fitRow.createEl('select');
    fit.createEl('option', { text: t('Cover'), value: 'cover' });
    fit.createEl('option', { text: t('Contain'), value: 'contain' });
    fit.value = this.objectFit;
    fit.addEventListener('change', () => {
      this.objectFit = fit.value as 'cover' | 'contain';
      this.renderPreview();
    });
  }

  private renderPreview() {
    this.previewEl.empty();

    const cover = this.previewEl.createDiv(c('card-cover'));

    if (this.value) {
      cover.setCssStyles(coverCss(this.app, this.cover()) as any);
    }

    cover.style.height = `${this.height}px`;
    cover.style.backgroundSize = this.objectFit;
    cover.style.backgroundPosition = this.objectPosition;

    const body = this.previewEl.createDiv(c('item-content-wrapper'));
    body.createDiv({
      cls: c('item-title-wrapper'),
      text: t('Card title'),
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
