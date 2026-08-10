import {
  formatPlanningAllocationDuration,
  formatPlanningAllocationPercent,
  formatPlanningAllocationQuantity
} from './planningAllocationEditorFormatters.js';
import {
  getPlanningAllocationMembershipDisplayNumber,
  getPlanningAllocationMemberships,
  getPlanningAllocationStage
} from './planningAllocationDisplay.js';

function optionForMachine(options, machineId) {
  return (options || []).find(option => String(option.machineId) === String(machineId)) || null;
}

function parsePercent(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantityInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : (/^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw);
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentInput(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2).replace('.', ',') : '';
}

function quantityInput(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0
  }).format(numeric);
}

function editorMessage(value) {
  return String(value || '')
    .replace(/\ballocations\b/gi, 'produções')
    .replace(/\ballocation\b/gi, 'produção');
}

export function equalPlanningAllocationSplitPercents(count) {
  const safeCount = Math.max(2, Math.min(100, Math.trunc(Number(count) || 2)));
  const base = Math.floor(10000 / safeCount);
  return Array.from({ length: safeCount }, (_, index) => (index === safeCount - 1
    ? (10000 - base * (safeCount - 1)) / 100
    : base / 100));
}

export function addPlanningAllocationSplitPart(values = []) {
  const normalized = values.map(value => Math.round(Number(value) * 100));
  if (normalized.length >= 100) return normalized.map(value => value / 100);
  const last = normalized.pop();
  if (!(last > 1)) return values.slice();
  const first = Math.ceil(last / 2);
  const second = last - first;
  return [...normalized, first, second].map(value => value / 100);
}

export function resolvePlanningAllocationEditorPreview(getPreview, values) {
  if (typeof getPreview !== 'function') return null;
  try { return getPreview(values) || null; } catch { return null; }
}

export function resolvePlanningAllocationDistribution(getDistributionPreview, allocation, values, options = {}) {
  if (typeof getDistributionPreview !== 'function') {
    return { valid: false, message: 'Nao foi possivel calcular a distribuicao.' };
  }
  try {
    const percents = values.map(value => parsePercent(value));
    if (percents.some(value => value === null)) return { valid: false, message: 'Informe percentuais numéricos com no máximo duas casas decimais.' };
    const result = getDistributionPreview(allocation, percents, options);
    return result ? { valid: true, percents, ...result } : { valid: false, message: 'Nao foi possivel calcular a distribuicao.' };
  } catch (error) {
    return { valid: false, message: editorMessage(error?.message || 'Não foi possível calcular a distribuição.') };
  }
}

function setOptions(select, machines, selectedId) {
  select.innerHTML = '';
  machines.forEach(machine => {
    const option = document.createElement('option');
    option.value = String(machine.machineId);
    option.textContent = machine.machineName || machine.machineId;
    select.appendChild(option);
  });
  if (optionForMachine(machines, selectedId)) select.value = String(selectedId);
}

function setPeopleOptions(input, machine, selectedPeople) {
  const allowed = (machine?.peopleCounts || []).map(Number).filter(Number.isInteger);
  input.innerHTML = '';
  allowed.forEach(peopleCount => {
    const option = document.createElement('option');
    option.value = String(peopleCount);
    option.textContent = String(peopleCount);
    input.appendChild(option);
  });
  const selected = allowed.includes(Number(selectedPeople)) ? Number(selectedPeople) : allowed.at(-1);
  if (selected !== undefined) input.value = String(selected);
}

function divisionLabel(allocation) {
  return allocation?.splitParentAllocationId ? 'Dividir esta parte' : 'Dividir esta produção';
}

function appendInfo(container, label, value) {
  const item = document.createElement('div');
  const name = document.createElement('span');
  const content = document.createElement('strong');
  name.textContent = label;
  content.textContent = value || '--';
  item.append(name, content);
  container.appendChild(item);
  return { item, name, content };
}

function appendEditableInfo(container, label, inputName, value, suffix = '') {
  const item = document.createElement('label');
  item.className = 'production-calendar-editor-summary-editable';
  const name = document.createElement('span');
  const field = document.createElement('div');
  const input = document.createElement('input');
  name.textContent = label;
  input.name = inputName;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.value = value || '';
  field.appendChild(input);
  if (suffix) {
    const suffixElement = document.createElement('b');
    suffixElement.textContent = suffix;
    field.appendChild(suffixElement);
  }
  item.append(name, field);
  container.appendChild(item);
  return input;
}

function relatedProductionLabel(membership) {
  const number = getPlanningAllocationMembershipDisplayNumber(membership);
  const stage = getPlanningAllocationStage(membership);
  return [number === '' ? 'Produção' : `Produção ${number}`, stage ? `Etapa ${stage}` : ''].filter(Boolean).join(' · ');
}

function allocationStartTime(allocation) {
  return String(allocation?.startTime || '07:00').slice(0, 5);
}

export function PlanningAllocationEditor({
  allocation, machines = [], emptyMessage = '', getPreview, getDistributionPreview, onSave, onClose, startSplit = false, readOnly = false, allowSplit = true, lockPosition = false
} = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'production-calendar-editor-backdrop';
  const modal = document.createElement('div');
  modal.className = 'production-calendar-editor-modal production-calendar-unified-editor-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'production-calendar-editor-title');
  modal.innerHTML = `
    <header class="production-calendar-editor-header">
      <div><h2 id="production-calendar-editor-title">Produção</h2><p></p></div>
      <button type="button" class="production-calendar-editor-close" aria-label="Fechar">&times;</button>
    </header>
    <div class="production-calendar-editor-scroll">
      <section class="production-calendar-editor-summary" aria-label="Identificação"></section>
      <section class="production-calendar-editor-summary" aria-label="Quantidades"></section>
      <section class="production-calendar-editor-summary production-calendar-editor-lineage" aria-label="Informações da divisão"></section>
      <form class="production-calendar-editor-form">
        <h3>Programação</h3>
        <div class="production-calendar-editor-fields">
          <label><span>Data</span><input name="date" type="date" required></label>
          <label><span>Máquina</span><select name="machineId" required></select></label>
          <label><span>Pessoas</span><select name="peopleCount" required></select></label>
        </div>
        <section class="production-calendar-editor-preview" aria-live="polite" aria-label="Prévia da produção">
          <div><span>Capacidade diária</span><strong data-editor-preview="capacity">--</strong></div>
          <div><span>Capacidade utilizada</span><strong data-editor-preview="usage">--</strong></div>
          <div><span>Duração</span><strong data-editor-preview="duration">--</strong></div>
          <div><span>Início previsto</span><strong data-editor-preview="start">--</strong></div>
          <div><span>Fim previsto</span><strong data-editor-preview="end">--</strong></div>
        </section>
        <button type="button" class="secondary-button production-calendar-editor-split-toggle"></button>
        <section class="production-calendar-editor-distribution" hidden>
          <div class="production-calendar-editor-distribution-header">
            <div><h3>Distribuição</h3><p>Os percentuais representam a participação no item selecionado e devem somar 100%.</p></div>
            <div><button type="button" class="secondary-button" data-split-equal>Distribuir igualmente</button><button type="button" class="secondary-button" data-split-add>Adicionar parte</button></div>
          </div>
          <div class="production-calendar-editor-parts"></div>
        </section>
        <p class="production-calendar-editor-error" role="alert" hidden></p>
        <footer><button type="button" class="secondary-button" data-editor-cancel>Cancelar</button><button type="submit" class="primary-button">Salvar alterações</button></footer>
      </form>
    </div>`;

  modal.querySelector('header p').textContent = allocation?.materialName || 'Produção';
  const identification = modal.querySelector('[aria-label="Identificação"]');
  appendInfo(identification, 'Produção', String(allocation?.productionCode ?? allocation?.productionNumber ?? (Number.isFinite(Number(allocation?.productionIndex)) ? Number(allocation.productionIndex) + 1 : '--')));
  appendInfo(identification, 'Material', allocation?.materialName || '');
  appendInfo(identification, 'Unidade', allocation?.unit || '');
  appendInfo(identification, 'Origem', allocation?.source === 'automatic' ? 'Automática' : allocation?.source === 'manual' ? 'Manual' : String(allocation?.source || '--'));
  appendInfo(identification, 'Etapa', String(getPlanningAllocationStage(allocation) || '--'));
  appendInfo(identification, 'Sequência', Number.isFinite(Number(allocation?.sequence)) ? String(Number(allocation.sequence)) : '--');
  const memberships = getPlanningAllocationMemberships(allocation);
  if (memberships.length > 1) appendInfo(identification, 'Produções participantes', memberships.map(relatedProductionLabel).join(' | '));

  const quantities = modal.querySelector('[aria-label="Quantidades"]');
  const quantityEditor = appendEditableInfo(quantities, 'Quantidade da produção', 'quantity', quantityInput(allocation?.quantity), allocation?.unit || '');
  const capacityPercentEditor = appendEditableInfo(quantities, 'Capacidade utilizada', 'capacityPercent', percentInput(allocation?.capacityPercent), '%');
  const maxCapacityInfo = appendInfo(quantities, 'Capacidade máxima/dia', formatPlanningAllocationQuantity(allocation?.maxDailyCapacity ?? allocation?.capacityMaxPerDay, allocation?.unit || ''));
  const durationInfo = appendInfo(quantities, 'Duração', formatPlanningAllocationDuration(allocation?.durationMinutes));

  const lineage = modal.querySelector('[aria-label="Informações da divisão"]');
  if (allocation?.splitParentAllocationId) {
    appendInfo(lineage, 'Parte atual', `${allocation.splitPath || allocation.splitOrder || '?'} (${allocation.splitOrder || '?'} de ${allocation.splitSiblingCount || '?'}, neste nível)`);
    appendInfo(lineage, 'Quantidade de partes irmãs', String(allocation.splitSiblingCount || '--'));
    appendInfo(lineage, 'Ordem da parte', String(allocation.splitOrder || '--'));
    appendInfo(lineage, 'Participação no pai', formatPlanningAllocationPercent(allocation.splitRatioPercent));
    appendInfo(lineage, 'Participação na produção original', formatPlanningAllocationPercent(allocation.splitAccumulatedRatioPercent));
    appendInfo(lineage, 'Capacidade utilizada desta parte', formatPlanningAllocationPercent(allocation.capacityPercent));
    appendInfo(lineage, 'Capacidade utilizada original', formatPlanningAllocationPercent(allocation.splitRootCapacityPercent));
    appendInfo(lineage, 'Quantidade desta parte', formatPlanningAllocationQuantity(allocation.quantity, allocation.unit || ''));
    appendInfo(lineage, 'Quantidade original', formatPlanningAllocationQuantity(allocation.splitRootQuantity, allocation.unit || ''));
    appendInfo(lineage, 'Nível da divisão', String(allocation.splitDepth || 1));
  } else {
    appendInfo(lineage, 'Produção original', 'Sem divisão manual');
  }

  const form = modal.querySelector('form');
  const machineSelect = form.elements.machineId;
  const peopleInput = form.elements.peopleCount;
  const dateInput = form.elements.date;
  const errorElement = modal.querySelector('.production-calendar-editor-error');
  const submitButton = form.querySelector('[type="submit"]');
  const distribution = modal.querySelector('.production-calendar-editor-distribution');
  const partsTarget = modal.querySelector('.production-calendar-editor-parts');
  const splitToggle = modal.querySelector('.production-calendar-editor-split-toggle');
  splitToggle.textContent = divisionLabel(allocation);
  setOptions(machineSelect, machines, allocation?.machineId);
  setPeopleOptions(peopleInput, optionForMachine(machines, machineSelect.value), allocation?.peopleCount);
  dateInput.value = String(allocation?.date || '').slice(0, 10);

  const showError = message => {
    const localizedMessage = editorMessage(message);
    errorElement.textContent = localizedMessage;
    errorElement.hidden = !localizedMessage;
  };
  const minimumEditableQuantity = Number(allocation?.quantity || 0);
  let quantityCapacitySource = 'quantity';
  const currentQuantity = () => parseQuantityInput(quantityEditor.value);
  const currentPercent = () => parsePercent(capacityPercentEditor.value);
  const syncMainPreview = () => {
    const machine = optionForMachine(machines, machineSelect.value);
    let quantity = currentQuantity();
    let requestedPercent = currentPercent();
    const capacityPreview = resolvePlanningAllocationEditorPreview(getPreview, {
      allocation, quantity: 1, machine, peopleCount: Number(peopleInput.value),
      date: dateInput.value, startTime: allocationStartTime(allocation)
    });
    const baseCapacity = Number(capacityPreview?.capacityPerDay);
    if (quantityCapacitySource === 'percent' && requestedPercent !== null && baseCapacity > 0) {
      quantity = Number(((baseCapacity * requestedPercent) / 100).toFixed(6));
      quantityEditor.value = quantityInput(quantity);
    } else if (quantity !== null && baseCapacity > 0) {
      requestedPercent = Number(((quantity / baseCapacity) * 100).toFixed(2));
      capacityPercentEditor.value = percentInput(requestedPercent);
    }
    const preview = resolvePlanningAllocationEditorPreview(getPreview, {
      allocation, quantity: quantity ?? Number(allocation?.quantity), machine, peopleCount: Number(peopleInput.value),
      date: dateInput.value, startTime: allocationStartTime(allocation)
    });
    const capacity = Number(preview?.capacityPerDay ?? baseCapacity);
    const usage = capacity > 0 && quantity !== null ? Number((quantity / capacity * 100).toFixed(2)) : null;
    modal.querySelector('[data-editor-preview="capacity"]').textContent = capacity > 0 ? formatPlanningAllocationQuantity(capacity, allocation?.unit || '') : '--';
    modal.querySelector('[data-editor-preview="usage"]').textContent = usage === null ? '--' : formatPlanningAllocationPercent(usage);
    modal.querySelector('[data-editor-preview="duration"]').textContent = preview?.durationMinutes ? formatPlanningAllocationDuration(preview.durationMinutes) : formatPlanningAllocationDuration(allocation?.durationMinutes);
    modal.querySelector('[data-editor-preview="start"]').textContent = preview?.startDate || dateInput.value || '--';
    modal.querySelector('[data-editor-preview="end"]').textContent = preview?.endDate || allocation?.endDate || allocation?.date || '--';
    maxCapacityInfo.content.textContent = capacity > 0 ? formatPlanningAllocationQuantity(capacity, allocation?.unit || '') : '--';
    durationInfo.content.textContent = preview?.durationMinutes ? formatPlanningAllocationDuration(preview.durationMinutes) : formatPlanningAllocationDuration(allocation?.durationMinutes);
  };
  [machineSelect, peopleInput, dateInput].forEach(input => input.addEventListener('input', syncMainPreview));
  quantityEditor.addEventListener('input', () => { quantityCapacitySource = 'quantity'; syncMainPreview(); });
  capacityPercentEditor.addEventListener('input', () => { quantityCapacitySource = 'percent'; syncMainPreview(); });
  machineSelect.addEventListener('change', () => {
    setPeopleOptions(peopleInput, optionForMachine(machines, machineSelect.value), peopleInput.value);
    syncMainPreview();
  });
  syncMainPreview();

  let splitValues = [];
  const partRows = () => [...partsTarget.querySelectorAll('.production-calendar-editor-part')];
  const syncPartResourcePreview = (row, basePart) => {
    const machine = optionForMachine(machines, row.querySelector('[name="partMachineId"]').value);
    const peopleCount = Number(row.querySelector('[name="partPeopleCount"]').value);
    const preview = resolvePlanningAllocationEditorPreview(getPreview, {
      allocation: basePart,
      quantity: Number(basePart?.quantity),
      machine,
      peopleCount,
      date: row.querySelector('[name="partDate"]').value,
      startTime: allocationStartTime(basePart)
    });
    const dailyCapacity = Number(preview?.capacityPerDay);
    const realCapacity = dailyCapacity > 0
      ? Number((Number(basePart?.quantity) / dailyCapacity * 100).toFixed(2))
      : Number(basePart?.capacityPercent);
    row.querySelector('[data-part-capacity]').textContent = `Capacidade real: ${Number.isFinite(realCapacity) ? formatPlanningAllocationPercent(realCapacity) : '--'}`;
  };
  const renderParts = values => {
    const preview = resolvePlanningAllocationDistribution(getDistributionPreview, allocation, values, { splitGroupId: 'preview' });
    partsTarget.innerHTML = '';
    splitValues = values.slice();
    values.forEach((value, index) => {
      const basePart = preview.valid ? preview.parts[index] : allocation;
      const row = document.createElement('div');
      row.className = 'production-calendar-editor-part';
      row.dataset.partIndex = String(index);
      row.innerHTML = `
        <strong>Parte ${index + 1}</strong>
        <label><span>Percentual do item</span><input name="ratioPercent" type="text" inputmode="decimal" required></label>
        <label><span>Máquina</span><select name="partMachineId" required></select></label>
        <label><span>Pessoas</span><select name="partPeopleCount" required></select></label>
        <label><span>Data</span><input name="partDate" type="date" required></label>
        <div class="production-calendar-editor-part-result"><span data-part-capacity></span><span data-part-quantity></span></div>
        <button type="button" class="link-button" data-part-remove>Remover</button>`;
      const ratio = row.querySelector('[name="ratioPercent"]');
      ratio.value = percentInput(value);
      const partMachine = row.querySelector('[name="partMachineId"]');
      setOptions(partMachine, machines, basePart.machineId);
      setPeopleOptions(
        row.querySelector('[name="partPeopleCount"]'),
        optionForMachine(machines, partMachine.value),
        basePart.peopleCount || allocation.peopleCount || 1
      );
      row.querySelector('[name="partDate"]').value = basePart.date || allocation.date;
      row.querySelector('[data-part-capacity]').textContent = `Capacidade real: ${preview.valid ? formatPlanningAllocationPercent(basePart.capacityPercent) : '--'}`;
      row.querySelector('[data-part-quantity]').textContent = `Quantidade: ${preview.valid ? formatPlanningAllocationQuantity(basePart.quantity, allocation?.unit || '') : '--'}`;
      ratio.addEventListener('input', () => {
        splitValues[index] = ratio.value;
        refreshPartResults();
      });
      ['partMachineId', 'partPeopleCount'].forEach(name => {
        row.querySelector(`[name="${name}"]`).addEventListener('input', () => syncPartResourcePreview(row, basePart));
      });
      ['partDate'].forEach(name => {
        row.querySelector(`[name="${name}"]`).addEventListener('input', () => {
          row.dataset.positionEdited = 'true';
          syncPartResourcePreview(row, basePart);
        });
      });
      row.querySelector('[name="partMachineId"]').addEventListener('change', () => {
        setPeopleOptions(
          row.querySelector('[name="partPeopleCount"]'),
          optionForMachine(machines, row.querySelector('[name="partMachineId"]').value),
          row.querySelector('[name="partPeopleCount"]').value
        );
        syncPartResourcePreview(row, basePart);
      });
      row.querySelector('[data-part-remove]').addEventListener('click', () => {
        if (splitValues.length <= 2) return;
        splitValues.splice(index, 1);
        renderParts(splitValues);
      });
      partsTarget.appendChild(row);
      syncPartResourcePreview(row, basePart);
    });
    showError(preview.valid ? '' : preview.message);
  };
  const refreshPartResults = () => {
    const preview = resolvePlanningAllocationDistribution(getDistributionPreview, allocation, splitValues, { splitGroupId: 'preview' });
    partRows().forEach((row, index) => {
      row.querySelector('[data-part-capacity]').textContent = `Capacidade real: ${preview.valid ? formatPlanningAllocationPercent(preview.parts[index].capacityPercent) : '--'}`;
      row.querySelector('[data-part-quantity]').textContent = `Quantidade: ${preview.valid ? formatPlanningAllocationQuantity(preview.parts[index].quantity, allocation?.unit || '') : '--'}`;
      if (preview.valid) {
        if (row.dataset.positionEdited !== 'true') {
          row.querySelector('[name="partDate"]').value = preview.parts[index].date;
        }
        syncPartResourcePreview(row, preview.parts[index]);
      }
    });
    showError(preview.valid ? '' : preview.message);
    return preview;
  };
  const activateSplit = () => {
    distribution.hidden = false;
    splitToggle.hidden = true;
    renderParts([50, 50]);
  };
  splitToggle.addEventListener('click', activateSplit);
  modal.querySelector('[data-split-add]').addEventListener('click', () => renderParts(addPlanningAllocationSplitPart(splitValues.map(value => parsePercent(value) ?? 0))));
  modal.querySelector('[data-split-equal]').addEventListener('click', () => renderParts(equalPlanningAllocationSplitPercents(splitValues.length || 2)));
  if (!allowSplit) splitToggle.hidden = true;
  if (startSplit && allowSplit) activateSplit();

  if (lockPosition) {
    machineSelect.disabled = true;
    dateInput.disabled = true;
  }

  if (readOnly) {
    [machineSelect, peopleInput, dateInput, quantityEditor, capacityPercentEditor].forEach(input => { input.disabled = true; });
    splitToggle.hidden = true;
    submitButton.hidden = true;
    modal.querySelector('[data-editor-cancel]').textContent = 'Fechar';
  }

  if (!machines.length && !readOnly) {
    submitButton.disabled = true;
    showError(emptyMessage || 'Nenhuma configuração disponível para esta produção.');
  }
  let closed = false;
  const close = () => { if (closed) return; closed = true; backdrop.remove(); onClose?.(); };
  modal.querySelector('.production-calendar-editor-close').addEventListener('click', close);
  modal.querySelector('[data-editor-cancel]').addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const splitting = !distribution.hidden;
    let payload;
    if (splitting) {
      const preview = refreshPartResults();
      if (!preview.valid) return;
      const rows = partRows();
      payload = {
        mode: 'split', allocation, relativePercents: preview.percents,
        partEdits: rows.map(row => ({
          machineId: row.querySelector('[name="partMachineId"]').value,
          peopleCount: Number(row.querySelector('[name="partPeopleCount"]').value),
          date: row.querySelector('[name="partDate"]').value,
          startTime: allocationStartTime(preview.parts[Number(row.dataset.partIndex)] || allocation)
        }))
      };
    } else {
      const quantity = currentQuantity();
      if (!(quantity > 0)) {
        showError('Informe uma quantidade de produção maior que zero.');
        return;
      }
      if (minimumEditableQuantity > 0 && quantity < minimumEditableQuantity - 0.000001) {
        showError('A capacidade utilizada não pode ser menor que a capacidade atual desta produção.');
        return;
      }
      payload = {
        mode: 'edit', allocation, machineId: machineSelect.value, peopleCount: Number(peopleInput.value),
        quantity, capacityPercent: currentPercent(), date: dateInput.value, startTime: allocationStartTime(allocation)
      };
    }
    submitButton.disabled = true;
    showError('');
    try {
      const result = await onSave?.(payload);
      if (result?.accepted) close();
      else showError(result?.message || 'Não foi possível aplicar esta alteração.');
    } catch (error) {
      showError(error?.message || 'Não foi possível aplicar esta alteração.');
    } finally {
      if (!closed) submitButton.disabled = false;
    }
  });
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  machineSelect.focus();
  return { element: backdrop, close };
}
