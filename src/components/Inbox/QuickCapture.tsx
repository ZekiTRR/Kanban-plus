import { Modal } from 'obsidian';
import type { StateManager } from 'src/StateManager';
import { t } from 'src/lang/helpers';

import type { KanbanView } from '../../KanbanView';
import { c } from '../helpers';
import {
  addToInbox,
  countInbox,
  getInboxTitle,
  isInboxEnabled,
} from '../../helpers/inbox';

/**
 * Trello-style quick capture: type a title (or paste several lines) and press
 * Enter to drop the cards into the Inbox list. Stays open for rapid entry.
 */
export class QuickCaptureModal extends Modal {
  private view: KanbanView;
  private stateManager: StateManager;
  private input: HTMLTextAreaElement;
  private statusEl: HTMLElement;
  private countEl: HTMLElement;
  private added = 0;

  constructor(view: KanbanView, stateManager: StateManager) {
    super(stateManager.app);
    this.view = view;
    this.stateManager = stateManager;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass(c('quick-capture'));
    modalEl.addClass(c('quick-capture-modal'));

    const inboxTitle = getInboxTitle(this.stateManager);

    const header = contentEl.createDiv(c('quick-capture-header'));
    header.createEl('h3', { text: t('Add to inbox'), cls: c('quick-capture-title') });

    const target = header.createDiv(c('quick-capture-target'));
    target.createSpan({ cls: c('quick-capture-target-icon'), text: '📥' });
    target.createSpan({ text: inboxTitle });

    contentEl.createEl('p', {
      cls: c('quick-capture-desc'),
      text: t('New cards will land in the inbox list.'),
    });

    this.input = contentEl.createEl('textarea', {
      cls: c('quick-capture-input'),
      attr: {
        placeholder: t('Card title...'),
        rows: '3',
        spellcheck: 'false',
      },
    });

    const footer = contentEl.createDiv(c('quick-capture-footer'));
    this.statusEl = footer.createDiv(c('quick-capture-status'));
    this.countEl = footer.createDiv(c('quick-capture-count'));

    const actions = contentEl.createDiv(c('quick-capture-actions'));
    const hint = actions.createDiv(c('quick-capture-hint'));
    hint.createSpan({ text: 'Enter' });
    hint.appendText(' — ' + t('Add card'));
    hint.appendText('  ·  ');
    const hintShift = hint.createSpan({ text: 'Shift + Enter' });
    hintShift.addClass(c('quick-capture-hint-key'));
    hint.appendText(' — ' + t('New line'));

    const addBtn = actions.createEl('button', { text: t('Add card') });
    addBtn.addClass('mod-cta');

    const submit = () => this.submit();
    addBtn.addEventListener('click', submit);

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });

    this.updateCount();

    // Focus after the modal has been laid out.
    this.input.win.setTimeout(() => this.input.focus(), 0);
  }

  private updateCount() {
    if (!this.countEl) return;

    const count = countInbox(this.stateManager.state, getInboxTitle(this.stateManager));
    this.countEl.setText(`${t('Inbox')}: ${count}`);
    this.countEl.toggleClass('is-empty', count === 0);
  }

  private submit() {
    if (!isInboxEnabled(this.stateManager)) {
      this.statusEl.setText(t('Inbox is disabled in board settings.'));
      this.statusEl.addClass('is-error');
      return;
    }

    const text = this.input.value;
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (!addToInbox({ stateManager: this.stateManager, view: this.view, text })) {
      return;
    }

    this.added += lines.length;
    this.input.value = '';
    this.statusEl.removeClass('is-error');
    this.statusEl.setText(
      this.added === 1 ? t('Card added to inbox') : `${t('Cards added')}: ${this.added}`
    );
    this.updateCount();
    this.input.focus();
  }

  onClose() {
    this.contentEl.empty();
  }
}
