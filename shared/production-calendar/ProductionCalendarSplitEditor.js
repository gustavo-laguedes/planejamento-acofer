import { buildManualScheduleAllocationSplit } from '../../services/manualScheduleDraft.service.js';
import {
  formatProductionCalendarPercent,
  formatProductionCalendarQuantity
} from './productionCalendar.utils.js';

function parsePercent(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveProductionCalendarSplitPreview(allocation, value, options = {}) {
  const firstPercent = parsePercent(value);
  if (firstPercent === null) return { valid: false, message: 'Informe um percentual numérico válido.' };
  try {
    return {
      valid: true,
      firstPercent,
      ...buildManualScheduleAllocationSplit(allocation, firstPercent, options)
    };
  } catch (error) {
    return { valid: false, message: error?.message || 'Não foi possível calcular a divisão.' };
  }
}

function metric(label, key) {
  const row = document.createElement('div');
  const name = document.createElement('span');
  const value = document.createElement('strong');
  name.textContent = label;
  value.dataset.splitPreview = key;
  value.textContent = '--';
  row.append(name, value);
  return row;
}

export function ProductionCalendarSplitEditor({ allocation, onSave, onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'production-calendar-editor-backdrop';
  const modal = document.createElement('div');
  modal.className = 'production-calendar-editor-modal production-calendar-split-editor-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'production-calendar-split-editor-title');
  modal.innerHTML = `
    <header class="production-calendar-editor-header">
      <div>
        <h2 id="production-calendar-split-editor-title">Dividir produção</h2>
        <p></p>
      </div>
      <button type="button" class="production-calendar-editor-close" aria-label="Fechar">&times;</button>
    </header>
    <form class="production-calendar-editor-form">
      <section class="production-calendar-editor-preview" aria-label="Configuração atual"></section>
      <label>
        <span>Percentual relativo da Parte 1</span>
        <input name="firstPercent" type="text" inputmode="decimal" autocomplete="off" required>
      </label>
      <section class="production-calendar-editor-preview production-calendar-split-preview" aria-live="polite" aria-label="Prévia da divisão"></section>
      <p class="production-calendar-editor-error" role="alert" hidden></p>
      <footer>
        <button type="button" class="secondary-button" data-split-cancel>Cancelar</button>
        <button type="submit" class="primary-button">Dividir produção</button>
      </footer>
    </form>
  `;
  modal.querySelector('header p').textContent = allocation?.materialName || 'Produção';
  const form = modal.querySelector('form');
  const current = modal.querySelector('[aria-label="Configuração atual"]');
  const preview = modal.querySelector('[aria-label="Prévia da divisão"]');
  const input = form.elements.firstPercent;
  const errorElement = modal.querySelector('.production-calendar-editor-error');
  const submitButton = form.querySelector('[type="submit"]');
  const percent = Number(allocation?.capacityPercent);
  const derivedCapacity = percent > 0 ? Number(allocation?.quantity) * 100 / percent : null;
  const capacity = allocation?.maxDailyCapacity
    ?? allocation?.maximumDailyQuantity
    ?? allocation?.capacityMaxPerDay
    ?? derivedCapacity;
  [
    ['Capacidade utilizada atual', formatProductionCalendarPercent(allocation?.capacityPercent)],
    ['Capacidade diária atual', formatProductionCalendarQuantity(capacity, allocation?.unit || '')],
    ['Máquina atual', allocation?.machineName || allocation?.machineId || '--'],
    ['Quantidade de pessoas', Number.isFinite(Number(allocation?.peopleCount)) ? String(Number(allocation.peopleCount)) : '--']
  ].forEach(([label, value]) => {
    const row = metric(label, label);
    row.querySelector('strong').textContent = value;
    current.appendChild(row);
  });
  [
    ['Percentual relativo da Parte 2', 'secondPercent'],
    ['Quantidade estimada da Parte 1', 'firstQuantity'],
    ['Quantidade estimada da Parte 2', 'secondQuantity']
  ].forEach(([label, key]) => preview.appendChild(metric(label, key)));

  const showError = message => {
    errorElement.textContent = message || '';
    errorElement.hidden = !message;
  };
  let latestPreview = null;
  const syncPreview = () => {
    latestPreview = resolveProductionCalendarSplitPreview(allocation, input.value, { splitGroupId: 'preview' });
    preview.querySelector('[data-split-preview="secondPercent"]').textContent = latestPreview.valid
      ? formatProductionCalendarPercent(latestPreview.second.splitRatioPercent)
      : '--';
    preview.querySelector('[data-split-preview="firstQuantity"]').textContent = latestPreview.valid
      ? formatProductionCalendarQuantity(latestPreview.first.quantity, allocation?.unit || '')
      : '--';
    preview.querySelector('[data-split-preview="secondQuantity"]').textContent = latestPreview.valid
      ? formatProductionCalendarQuantity(latestPreview.second.quantity, allocation?.unit || '')
      : '--';
    submitButton.disabled = !latestPreview.valid;
    showError(latestPreview.valid ? '' : latestPreview.message);
  };
  input.value = '50,00';
  input.addEventListener('input', syncPreview);
  syncPreview();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    onClose?.();
  };
  modal.querySelector('.production-calendar-editor-close').addEventListener('click', close);
  modal.querySelector('[data-split-cancel]').addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    syncPreview();
    if (!latestPreview?.valid) return;
    submitButton.disabled = true;
    input.disabled = true;
    try {
      const result = await onSave?.({ allocation, firstPercent: latestPreview.firstPercent });
      if (result?.accepted) close();
      else showError(result?.message || 'Não foi possível dividir esta produção.');
    } catch (error) {
      showError(error?.message || 'Não foi possível dividir esta produção.');
    } finally {
      if (!closed) {
        input.disabled = false;
        submitButton.disabled = !latestPreview?.valid;
      }
    }
  });
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  input.focus();
  return { element: backdrop, close };
}
