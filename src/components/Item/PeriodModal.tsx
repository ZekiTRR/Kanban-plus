import { Modal, moment } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { BoardModifiers } from 'src/helpers/boardModifiers';
import { t } from 'src/lang/helpers';

import { Item } from '../types';
import { setItemDates } from './period';

export interface PeriodModalResult {
  start: moment.Moment | null;
  due: moment.Moment | null;
}

export class PeriodModal extends Modal {
  private stateManager: StateManager;
  private current: { start?: moment.Moment; due?: moment.Moment };
  private onSubmit: (result: PeriodModalResult) => void;
  private startValue: string;
  private dueValue: string;

  constructor(
    stateManager: StateManager,
    current: { start?: moment.Moment; due?: moment.Moment },
    onSubmit: (result: PeriodModalResult) => void
  ) {
    super(stateManager.app);
    this.stateManager = stateManager;
    this.current = current;
    this.onSubmit = onSubmit;
    this.startValue = current.start ? current.start.format('YYYY-MM-DD') : '';
    this.dueValue = current.due ? current.due.format('YYYY-MM-DD') : '';
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('kanban-plugin__period-modal');

    contentEl.createEl('h3', { text: t('Set period') });
    contentEl.createEl('p', {
      cls: 'kanban-plugin__period-modal-desc',
      text: t('Pick the first and the last day of the period.'),
    });

    const startRow = contentEl.createDiv('kanban-plugin__period-field');
    startRow.createEl('label', { text: t('Period start') });
    const startInput = startRow.createEl('input', { type: 'date' });
    startInput.addClass('kanban-plugin__period-input');
    startInput.value = this.startValue;

    const dueRow = contentEl.createDiv('kanban-plugin__period-field');
    dueRow.createEl('label', { text: t('Period end') });
    const dueInput = dueRow.createEl('input', { type: 'date' });
    dueInput.addClass('kanban-plugin__period-input');
    dueInput.value = this.dueValue;

    const error = contentEl.createDiv('kanban-plugin__period-error');
    error.style.display = 'none';
    const showError = (msg: string) => {
      error.setText(msg);
      error.style.display = '';
    };

    startInput.addEventListener('change', () => {
      this.startValue = startInput.value;
      dueInput.min = this.startValue;
      // Convenience: a start date alone becomes a one-day period.
      if (this.startValue && !dueInput.value) {
        dueInput.value = this.startValue;
        this.dueValue = this.startValue;
      }
    });
    dueInput.addEventListener('change', () => {
      this.dueValue = dueInput.value;
      startInput.max = this.dueValue;
    });

    if (this.startValue) dueInput.min = this.startValue;
    if (this.dueValue) startInput.max = this.dueValue;

    const btnRow = contentEl.createDiv('modal-button-container');

    const clearBtn = btnRow.createEl('button', { text: t('Clear period') });
    clearBtn.addEventListener('click', () => {
      this.onSubmit({ start: null, due: null });
      this.close();
    });

    const cancelBtn = btnRow.createEl('button', { text: t('Cancel') });
    cancelBtn.addEventListener('click', () => this.close());

    const saveBtn = btnRow.createEl('button', { text: t('Save') });
    saveBtn.addClass('mod-cta');
    saveBtn.addEventListener('click', () => {
      const start = this.startValue ? moment(this.startValue, 'YYYY-MM-DD', true) : null;
      const due = this.dueValue ? moment(this.dueValue, 'YYYY-MM-DD', true) : null;

      if (start && !start.isValid()) {
        showError(t('Invalid start date'));
        return;
      }

      if (due && !due.isValid()) {
        showError(t('Invalid end date'));
        return;
      }

      if (start && due && due.isBefore(start, 'day')) {
        showError(t('The period end must not be before its start.'));
        return;
      }

      if (!start && !due) {
        this.onSubmit({ start: null, due: null });
      } else if (start && due) {
        this.onSubmit({ start, due });
      } else if (start) {
        this.onSubmit({ start, due: null });
      } else {
        this.onSubmit({ start: null, due });
      }

      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Opens the period editor for a card and writes the result back to markdown. */
export function openPeriodEditor(
  stateManager: StateManager,
  boardModifiers: BoardModifiers,
  item: Item,
  path: Path
) {
  new PeriodModal(
    stateManager,
    { start: item.data.metadata.startDate, due: item.data.metadata.date },
    ({ start, due }) => {
      setItemDates({ stateManager, boardModifiers, path, item, start, due });
    }
  ).open();
}
