import update from 'immutability-helper';
import { ViewUpdate } from '@codemirror/view';
import {
  Component,
  MarkdownRenderer as ObsidianMarkdownRenderer,
  Modal,
  setIcon,
} from 'obsidian';
import { render, unmountComponentAtNode } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { getBoardModifiers } from 'src/helpers/boardModifiers';
import {
  CardMeta,
  ChecklistItem,
  buildCardBody,
  findItemById,
  formatCardTime,
  getCardMeta,
  parseCardParts,
  saveCardMeta,
} from 'src/helpers/cardMeta';
import { t } from 'src/lang/helpers';

import { KanbanView } from '../../KanbanView';
import { colorPalette, getReadableTextColor, setTagColor } from '../colors';
import { KanbanContext } from '../context';
import { MarkdownEditor } from '../Editor/MarkdownEditor';
import { CoverModal } from '../Appearance/CoverModal';
import { coverCss, getCardCoverFor, setCardCoverFor } from '../cover';
import {
  findCardByBlockId,
  getDependencyFor,
  removeDependency,
} from '../timeline/dependencies';
import { constructDatePicker, constructMenuDatePickerOnChange } from '../Item/helpers';
import { c, escapeRegExpStr } from '../helpers';
import { EditingState, Item } from '../types';

function getTitleMarkdown(firstLine: string): string {
  return (firstLine || '')
    .replace(/(^|\s)@(?:\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\{[^}]+\})/g, ' ')
    .replace(/(^|\s)(?:🛫|📅|📆|🗓|⏳|⌛|✅)\s*\d{4}-\d{2}-\d{2}/g, ' ')
    .replace(/\s+\^[a-zA-Z0-9-]+$/, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Trello-like card detail: description, checklist, comments and activity. */
export class CardDetailModal extends Modal {
  private view: KanbanView;
  private stateManager: StateManager;
  private boardModifiers: ReturnType<typeof getBoardModifiers>;
  private itemId: string;
  private blockId: string;
  private labelsOpen = false;
  private mdComponent: Component | null = null;
  private mdEditorHosts: HTMLElement[] = [];

  constructor(view: KanbanView, stateManager: StateManager, item: Item) {
    super(stateManager.app);
    this.view = view;
    this.stateManager = stateManager;
    this.boardModifiers = getBoardModifiers(view, stateManager);
    this.itemId = item.id;
    this.blockId = this.ensureBlockId(item);
  }

  private ensureBlockId(item: Item): string {
    if (item.data.blockId) return item.data.blockId;

    const id = Math.random().toString(36).slice(2, 9);
    const found = findItemById(this.stateManager.state, item.id);

    if (!found) return id;

    const withId = update(item, { data: { blockId: { $set: id } } });
    this.boardModifiers.updateItem(
      found.path,
      this.stateManager.updateItemContent(withId, item.data.titleRaw)
    );

    return id;
  }

  private getCurrent(): { item: Item; path: number[] } | null {
    return findItemById(this.stateManager.state, this.itemId);
  }

  /** Renders Markdown into `el` with Obsidian's renderer (links, embeds, tasks, tables). */
  private renderMarkdownInto(el: HTMLElement, markdown: string) {
    el.empty();

    if (!markdown || !markdown.trim()) {
      el.createEl('p', { text: t('No content yet.'), cls: c('card-detail-empty') });
      return;
    }

    const component = this.mdComponent;
    if (!component) {
      el.setText(markdown);
      return;
    }

    try {
      const renderPromise = ObsidianMarkdownRenderer.render(
        this.app,
        markdown,
        el,
        this.stateManager.file.path,
        component
      );

      if (renderPromise && typeof renderPromise.catch === 'function') {
        renderPromise.catch(() => el.setText(markdown));
      }
    } catch {
      el.setText(markdown);
    }
  }

  private clearMdEditors() {
    this.mdEditorHosts.forEach((host) => {
      try {
        unmountComponentAtNode(host);
      } catch {
        /* already unmounted */
      }
      host.empty();
    });
    this.mdEditorHosts = [];
  }

  /**
   * Mounts the same CM6 MarkdownEditor used for board cards — one single
   * surface where Markdown is written and rendered live, like a note.
   */
  private mountMarkdownEditor(
    container: HTMLElement,
    options: {
      value: string;
      placeholder?: string;
      className: string;
      onChange: (value: string) => void;
    }
  ) {
    const context = {
      view: this.view,
      stateManager: this.stateManager,
      boardModifiers: this.boardModifiers,
      filePath: this.stateManager.file.path,
    };

    render(
      <KanbanContext.Provider value={context}>
        <MarkdownEditor
          editState={EditingState.cancel}
          className={options.className}
          value={options.value}
          placeholder={options.placeholder}
          onEnter={() => false}
          onEscape={() => {}}
          onSubmit={() => {}}
          onChange={(update: ViewUpdate) => {
            if (update.docChanged) options.onChange(update.state.doc.toString());
          }}
        />
      </KanbanContext.Provider>,
      container
    );

    this.mdEditorHosts.push(container);
  }

  onOpen() {
    this.modalEl.addClass(c('card-detail-modal'));
    this.mdComponent = new Component();
    this.mdComponent.load();
    this.render();
  }

  private render() {
    const { contentEl } = this;
    this.clearMdEditors();
    const current = this.getCurrent();

    contentEl.empty();

    if (!current) {
      contentEl.createEl('p', { text: t('Card not found') });
      return;
    }

    const { item, path } = current;
    const parts = parseCardParts(item.data.titleRaw);
    const meta = getCardMeta(this.stateManager, this.blockId);

    if (!meta.created) {
      meta.created = Date.now();
      saveCardMeta(this.stateManager, this.blockId, meta);
    }

    const titleMarkdown = getTitleMarkdown(parts.firstLine);
    const titleEl = contentEl.createDiv({ cls: c('card-detail-title') });

    const cardCover = getCardCoverFor(this.stateManager, this.blockId);
    if (cardCover) {
      const cover = contentEl.createDiv(c('card-detail-cover'));
      cover.setCssStyles(coverCss(this.stateManager.app, cardCover) as any);
      cover.style.height = `${cardCover.height || 140}px`;
      cover.style.backgroundSize = cardCover.objectFit;
      cover.style.backgroundPosition = cardCover.objectPosition;
      cover.addEventListener('click', () => {
        new CoverModal(this.stateManager.app, cardCover, (next) => {
          setCardCoverFor(this.stateManager, this.blockId, next);
          this.render();
        }).open();
      });
    }

    if (titleMarkdown) {
      const renderPromise = ObsidianMarkdownRenderer.render(
        this.app,
        titleMarkdown,
        titleEl,
        this.stateManager.file.path,
        this.mdComponent!
      );

      if (renderPromise && typeof renderPromise.catch === 'function') {
        renderPromise.catch(() => titleEl.setText(titleMarkdown));
      }
    } else {
      titleEl.setText(t('Untitled'));
    }

    const actionsRow = contentEl.createDiv(c('card-detail-actions-row'));

    const addAction = (icon: string, label: string, handler: (e: MouseEvent) => void) => {
      const btn = actionsRow.createEl('button', { cls: c('card-detail-action') });
      const iconEl = btn.createSpan({ cls: c('card-detail-action-icon') });
      setIcon(iconEl, icon);
      btn.createSpan({ text: label });
      btn.addEventListener('click', handler);
      return btn;
    };

    const focusChecklist = () => {
      const input = contentEl.querySelector<HTMLElement>(`.${c('card-detail-add-input')}`);
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
    };

    addAction('lucide-plus', t('Add'), focusChecklist);
    addAction('lucide-tag', t('Labels'), () => {
      this.labelsOpen = !this.labelsOpen;
      this.render();
    });
    addAction('lucide-calendar', t('Dates'), (e) => this.openDatePicker(e, item, path));
    addAction('lucide-check-square', t('Checklist'), focusChecklist);
    addAction('lucide-image', t('Card cover'), () => {
      new CoverModal(this.stateManager.app, cardCover, (next) => {
        setCardCoverFor(this.stateManager, this.blockId, next);
        this.render();
      }).open();
    });

    if (this.labelsOpen) {
      this.renderLabelsPanel(contentEl, item, path);
    }

    const layout = contentEl.createDiv(c('card-detail-layout'));
    const mainCol = layout.createDiv(c('card-detail-main'));
    const sideCol = layout.createDiv(c('card-detail-side'));

    this.renderDependencies(mainCol);

    this.renderDescription(mainCol, parts.description, item, path);
    this.renderChecklist(mainCol, parts.checklist, item, path);
    this.renderActivity(sideCol, meta);
  }

  private renderDependencies(container: HTMLElement) {
    const dependency = getDependencyFor(this.stateManager, this.blockId);
    const section = container.createDiv(c('card-detail-section'));
    const head = section.createDiv(c('card-detail-section-head'));
    const titleWrap = head.createDiv(c('card-detail-section-title'));
    const icon = titleWrap.createSpan(c('card-detail-section-icon'));
    setIcon(icon, 'lucide-link');
    titleWrap.createEl('h3', { text: t('Dependencies') });

    if (!dependency) {
      section.createEl('p', { text: t('No dependencies'), cls: c('card-detail-empty') });
      return;
    }

    const target = findCardByBlockId(this.stateManager.state, dependency.dependsOn);
    const row = section.createDiv(c('card-detail-dependency'));
    row.createSpan({
      text: `${dependency.type}: ${target ? target.item.data.title || target.item.data.titleRaw.split('\n')[0] : dependency.dependsOn}`,
    });
    const remove = row.createEl('button', { text: t('Remove dependency') });
    remove.addEventListener('click', () => {
      removeDependency(this.stateManager, this.blockId);
      this.render();
    });
  }

  private writeParts(item: Item, path: number[], parts: ReturnType<typeof parseCardParts>) {
    const raw = buildCardBody(parts);
    this.boardModifiers.updateItem(path, this.stateManager.updateItemContent(item, raw));
  }

  private logEvent(text: string) {
    const meta = getCardMeta(this.stateManager, this.blockId);
    meta.events.push({ ts: Date.now(), text });
    saveCardMeta(this.stateManager, this.blockId, meta);
  }

  private toggleItemTag(item: Item, path: number[], tag: string) {
    const itemTags = item.data.metadata.tags || [];
    const assigned = itemTags.includes(tag);
    let titleRaw: string;

    if (assigned) {
      const re = new RegExp(`(^|\\s)${escapeRegExpStr(tag)}(?=\\s|$)`);
      titleRaw = item.data.titleRaw.replace(re, '').replace(/ {2,}/g, ' ').trim();
    } else {
      titleRaw = `${item.data.titleRaw} ${tag}`;
    }

    this.logEvent(`${assigned ? '−' : '+'} ${tag}`);
    this.boardModifiers.updateItem(path, this.stateManager.updateItemContent(item, titleRaw));
    this.render();
  }

  private renderLabelsPanel(container: HTMLElement, item: Item, path: number[]) {
    const tags = new Set<string>();

    this.stateManager.state.children.forEach((lane) =>
      lane.children.forEach((entry) =>
        entry.data.metadata.tags?.forEach((tag) => tags.add(tag))
      )
    );

    const itemTags = item.data.metadata.tags || [];
    itemTags.forEach((tag) => tags.add(tag));

    const tagColors = this.stateManager.getSetting('tag-colors') || [];
    const panel = container.createDiv(c('card-detail-labels-panel'));

    const head = panel.createDiv(c('card-detail-labels-head'));
    head.createEl('h4', { text: t('Labels') });
    const close = head.createEl('button', { text: '×', cls: c('card-detail-icon-button') });
    close.addEventListener('click', () => {
      this.labelsOpen = false;
      this.render();
    });

    const search = panel.createEl('input', {
      type: 'text',
      cls: c('card-detail-label-search'),
      attr: { placeholder: t('Find or create a label...') },
    });

    const addTag = () => {
      const raw = search.value.trim();
      if (!raw) return;

      const tag = raw.startsWith('#') ? raw : `#${raw}`;
      search.value = '';

      if ((item.data.metadata.tags || []).includes(tag)) {
        this.render();
        return;
      }

      this.toggleItemTag(item, path, tag);
    };

    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTag();
      }
    });

    const addBtn = panel.createEl('button', { text: t('Add'), cls: c('card-detail-label-add') });
    addBtn.addEventListener('click', addTag);

    const list = panel.createDiv(c('card-detail-labels-list'));

    tags.forEach((tag) => {
      const row = list.createDiv(c('card-detail-label-row'));
      const assigned = itemTags.includes(tag);
      row.toggleClass('is-assigned', assigned);

      const colorEntry = tagColors.find((entry) => entry.tagKey === tag);
      const fallbackIndex =
        Array.from(tag).reduce((sum, char) => sum + char.charCodeAt(0), 0) % colorPalette.length;
      const fallback = colorPalette[fallbackIndex];

      const swatch = row.createEl('input', { type: 'color', cls: c('card-detail-label-swatch') });
      swatch.value = colorEntry?.backgroundColor?.startsWith('#')
        ? colorEntry.backgroundColor
        : fallback;
      swatch.addEventListener('input', () => {
        setTagColor(this.stateManager, tag, swatch.value);
        name.style.backgroundColor = swatch.value;
        name.style.color = getReadableTextColor(swatch.value);
      });

      const name = row.createEl('span', { text: tag, cls: c('card-detail-label-name') });
      name.style.color = colorEntry?.color || getReadableTextColor(fallback);
      name.style.backgroundColor = colorEntry?.backgroundColor || fallback;

      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = assigned;
      checkbox.addEventListener('change', () => this.toggleItemTag(item, path, tag));

      const clear = row.createEl('button', {
        text: '×',
        cls: c('card-detail-icon-button'),
        attr: { 'aria-label': t('Remove color') },
      });
      clear.addEventListener('click', () => {
        setTagColor(this.stateManager, tag, null);
        this.render();
      });
    });
  }

  private openDatePicker(e: MouseEvent, item: Item, path: number[]) {
    const onChange = constructMenuDatePickerOnChange({
      stateManager: this.stateManager,
      boardModifiers: this.boardModifiers,
      item,
      hasDate: !!item.data.metadata.date,
      path,
    });

    constructDatePicker(
      e.view,
      this.stateManager,
      { x: e.clientX, y: e.clientY },
      (dates) => {
        onChange(dates);
        this.render();
      },
      item.data.metadata.date?.toDate()
    );
  }

  private renderDescription(container: HTMLElement, description: string, item: Item, path: number[]) {
    const section = container.createDiv(c('card-detail-section'));
    const head = section.createDiv(c('card-detail-section-head'));
    const titleWrap = head.createDiv(c('card-detail-section-title'));
    const icon = titleWrap.createSpan(c('card-detail-section-icon'));
    setIcon(icon, 'lucide-align-left');
    titleWrap.createEl('h3', { text: t('Description') });

    let draft = description;
    const editorHost = section.createDiv(c('card-detail-md-editor'));
    this.mountMarkdownEditor(editorHost, {
      value: description,
      placeholder: t('Add a more detailed description...'),
      className: c('card-detail-md-editor-inner'),
      onChange: (value) => {
        draft = value;
      },
    });

    const actions = section.createDiv(c('card-detail-actions'));
    const save = actions.createEl('button', { text: t('Save') });

    save.addEventListener('click', () => {
      const parts = parseCardParts(item.data.titleRaw);
      parts.description = draft;
      this.writeParts(item, path, parts);
      this.logEvent(`✎ ${t('Description')}`);
      this.render();
    });
  }

  private renderChecklist(
    container: HTMLElement,
    checklist: ChecklistItem[],
    item: Item,
    path: number[]
  ) {
    const section = container.createDiv(c('card-detail-section'));
    const head = section.createDiv(c('card-detail-section-head'));
    const titleWrap = head.createDiv(c('card-detail-section-title'));
    const icon = titleWrap.createSpan(c('card-detail-section-icon'));
    setIcon(icon, 'lucide-check-square');
    const done = checklist.filter((entry) => entry.checked).length;
    titleWrap.createEl('h3', {
      text: `${t('Checklist')}${checklist.length ? ` · ${done}/${checklist.length}` : ''}`,
    });

    if (checklist.length) {
      const progress = section.createDiv(c('card-detail-progress'));
      const fill = progress.createDiv(c('card-detail-progress-fill'));
      fill.style.width = `${Math.round((done / checklist.length) * 100)}%`;
    }

    const list = section.createDiv(c('card-detail-checklist'));

    checklist.forEach((entry, index) => {
      const row = list.createDiv(c('card-detail-check-item'));

      const checkbox = row.createEl('input', { type: 'checkbox' });
      checkbox.checked = entry.checked;
      checkbox.addEventListener('change', () => {
        const parts = parseCardParts(item.data.titleRaw);
        parts.checklist[index].checked = checkbox.checked;
        this.writeParts(item, path, parts);
        this.logEvent(`${checkbox.checked ? '☑' : '☐'} ${entry.text}`);
        this.render();
      });

      const label = row.createDiv(c('card-detail-check-body'));
      const input = label.createEl('input', { type: 'text', cls: c('card-detail-check-text') });
      input.value = entry.text;

      const commit = () => {
        const parts = parseCardParts(item.data.titleRaw);
        parts.checklist[index].text = input.value.trim();
        this.writeParts(item, path, parts);
      };

      input.addEventListener('change', commit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          input.blur();
        }
      });

      if (entry.comment) {
        label.createDiv({ text: entry.comment, cls: c('card-detail-check-comment') });
      }

      const itemActions = row.createDiv(c('card-detail-check-actions'));

      const commentBtn = itemActions.createEl('button', {
        text: '💬',
        cls: c('card-detail-icon-button'),
      });
      commentBtn.title = t('Comment');
      commentBtn.addEventListener('click', () => {
        const parts = parseCardParts(item.data.titleRaw);
        const current = parts.checklist[index];

        const editor = document.createElement('textarea');
        editor.value = current.comment || '';
        editor.className = c('card-detail-check-comment-input');
        editor.placeholder = t('Comment');
        editor.rows = 2;

        label.appendChild(editor);
        editor.focus();

        const save = () => {
          current.comment = editor.value.trim() || undefined;
          this.writeParts(item, path, parts);
          editor.remove();
          this.render();
        };

        editor.addEventListener('blur', save);
        editor.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            editor.remove();
          }

          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        });
      });

      const deleteBtn = itemActions.createEl('button', {
        text: '×',
        cls: c('card-detail-icon-button'),
      });
      deleteBtn.title = t('Delete');
      deleteBtn.addEventListener('click', () => {
        const parts = parseCardParts(item.data.titleRaw);
        parts.checklist.splice(index, 1);
        this.writeParts(item, path, parts);
        this.logEvent(`− ${entry.text}`);
        this.render();
      });
    });

    const addRow = section.createDiv(c('card-detail-add'));
    const addInput = addRow.createEl('input', {
      type: 'text',
      cls: c('card-detail-add-input'),
      attr: { placeholder: t('Add a checklist item...') },
    });

    const addBtn = addRow.createEl('button', { text: t('Add') });
    const addItem = () => {
      const value = addInput.value.trim();
      if (!value) return;

      const parts = parseCardParts(item.data.titleRaw);
      parts.checklist.push({ text: value, checkChar: ' ', checked: false, indent: '' });
      this.writeParts(item, path, parts);
      this.logEvent(`+ ${value}`);
      this.render();
    };

    addBtn.addEventListener('click', addItem);
    addInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addItem();
      }
    });
  }

  private renderActivity(container: HTMLElement, meta: CardMeta) {
    const section = container.createDiv(c('card-detail-activity'));
    const head = section.createDiv(c('card-detail-section-head'));
    const titleWrap = head.createDiv(c('card-detail-section-title'));
    const icon = titleWrap.createSpan(c('card-detail-section-icon'));
    setIcon(icon, 'lucide-message-square');
    titleWrap.createEl('h3', { text: t('Comments & events') });

    let draft = '';
    const editorHost = section.createDiv(c('card-detail-md-editor'));
    this.mountMarkdownEditor(editorHost, {
      value: '',
      placeholder: t('Write a comment...'),
      className: c('card-detail-md-editor-inner'),
      onChange: (value) => {
        draft = value;
      },
    });

    const addBtn = section.createEl('button', { text: t('Comment') });
    addBtn.addClass('mod-cta');
    addBtn.addEventListener('click', () => {
      const value = draft.trim();
      if (!value) return;

      const fresh = getCardMeta(this.stateManager, this.blockId);
      fresh.comments.push({ ts: Date.now(), text: value, author: t('You') });
      saveCardMeta(this.stateManager, this.blockId, fresh);
      this.render();
    });

    const list = section.createDiv(c('card-detail-feed'));
    const entries: Array<{ ts: number; text: string; kind: 'comment' | 'event' }> = [
      ...meta.comments.map((entry) => ({
        ts: entry.ts,
        text: entry.text,
        kind: 'comment' as const,
      })),
      ...meta.events.map((entry) => ({
        ts: entry.ts,
        text: entry.text,
        kind: 'event' as const,
      })),
    ].sort((a, b) => b.ts - a.ts);

    if (!entries.length) {
      list.createEl('p', { text: t('No comments or events yet.'), cls: c('card-detail-empty') });
    }

    entries.forEach((entry) => {
      const row = list.createDiv(
        `${c('card-detail-feed-entry')} ${entry.kind === 'comment' ? 'is-comment' : 'is-event'}`
      );
      const avatar = row.createDiv(c('card-detail-avatar'));
      avatar.setText(entry.kind === 'comment' ? t('You').slice(0, 1) : '•');
      const body = row.createDiv(c('card-detail-feed-body'));
      body.createDiv({
        text: entry.kind === 'comment' ? t('You') : t('Activity'),
        cls: c('card-detail-feed-author'),
      });

      if (entry.kind === 'comment') {
        const rendered = body.createDiv(c('card-detail-feed-text'));
        this.renderMarkdownInto(rendered, entry.text);
      } else {
        body.createDiv({ text: entry.text, cls: c('card-detail-feed-text') });
      }

      body.createDiv({ text: formatCardTime(entry.ts), cls: c('card-detail-feed-time') });
    });
  }

  onClose() {
    this.clearMdEditors();
    this.contentEl.empty();
    this.mdComponent?.unload();
    this.mdComponent = null;
  }
}
