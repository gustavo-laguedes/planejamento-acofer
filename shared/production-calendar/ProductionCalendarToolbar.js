import {
  formatProductionCalendarDate,
  formatProductionCalendarQuantity
} from './productionCalendar.utils.js';
import {
  getProductionCalendarZoomIndex,
  PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID,
  PRODUCTION_CALENDAR_ZOOM_LEVELS
} from './ProductionCalendarState.js';

function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function createToolbarButton({ label, title, className, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  if (typeof onClick === 'function') {
    button.addEventListener('click', onClick);
  }
  return button;
}

function getProductionLabel(allocation = {}) {
  const productionCode = firstExisting(
    allocation.productionCode,
    allocation.productionNumber,
    allocation.production,
    allocation.orderNumber,
    allocation.orderCode
  );
  return productionCode ? `Produ\u00e7\u00e3o ${productionCode}` : '';
}

function getSelectedAllocationLabel(allocation = {}) {
  const parts = [
    getProductionLabel(allocation),
    firstExisting(allocation.materialName, allocation.materialCode, 'Material'),
    formatProductionCalendarDate(allocation.date),
    formatProductionCalendarQuantity(allocation.quantity, allocation.unit || '')
  ].filter(Boolean);
  return parts.join(' · ');
}

export function updateProductionCalendarToolbar(toolbar, state = {}, context = {}) {
  if (!toolbar) return;
  const zoomIndex = getProductionCalendarZoomIndex(state.zoom);
  toolbar.dataset.zoom = PRODUCTION_CALENDAR_ZOOM_LEVELS[zoomIndex].id;

  const zoomOutButton = toolbar.querySelector('[data-production-calendar-action="zoom-out"]');
  const zoomInButton = toolbar.querySelector('[data-production-calendar-action="zoom-in"]');
  const resetButton = toolbar.querySelector('[data-production-calendar-action="zoom-reset"]');
  const undoButton = toolbar.querySelector('[data-production-calendar-action="undo-manual-change"]');
  const redoButton = toolbar.querySelector('[data-production-calendar-action="redo-manual-change"]');
  const discardButton = toolbar.querySelector('[data-production-calendar-action="discard-all-changes"]');
  const optimizeButton = toolbar.querySelector('[data-production-calendar-action="optimize-utilization"]');

  if (zoomOutButton) zoomOutButton.disabled = zoomIndex === 0;
  if (zoomInButton) zoomInButton.disabled = zoomIndex === PRODUCTION_CALENDAR_ZOOM_LEVELS.length - 1;
  if (resetButton) resetButton.disabled = PRODUCTION_CALENDAR_ZOOM_LEVELS[zoomIndex].id === PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID;
  toolbar.querySelectorAll('[data-production-calendar-expand]').forEach(button => {
    button.disabled = false;
  });
  if (discardButton) discardButton.disabled = !state.hasManualChanges;
  if (optimizeButton) optimizeButton.disabled = Boolean(state.optimizationInProgress);
  if (undoButton) undoButton.disabled = !state.canUndoManualChange;
  if (redoButton) redoButton.disabled = !state.canRedoManualChange;

  const selectedPanel = toolbar.querySelector('[data-production-calendar-selection]');
  const selectedText = toolbar.querySelector('[data-production-calendar-selection-text]');
  const selectedAllocation = context.selectedAllocation || null;
  const hasSelection = Boolean(state.selectedAllocationId && selectedAllocation);

  if (selectedPanel) selectedPanel.hidden = !hasSelection;
  if (selectedText) {
    const label = hasSelection ? getSelectedAllocationLabel(selectedAllocation) : '';
    selectedText.textContent = label;
    selectedText.title = label;
  }
}

/**
 * Renders the production calendar toolbar.
 *
 * @param {Object} props
 * @param {Object} props.permissions
 * @param {Object} props.state
 * @param {Object} props.actions
 * @returns {HTMLElement}
 */
export function ProductionCalendarToolbar({ permissions = {}, state = {}, actions = {} } = {}) {
  const toolbar = document.createElement('div');
  toolbar.className = 'production-calendar-toolbar';
  toolbar.dataset.canEdit = String(Boolean(permissions.edit));
  toolbar.dataset.zoom = String(state.zoom ?? PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID);
  toolbar.setAttribute('aria-label', 'Controles do calend\u00e1rio de produ\u00e7\u00e3o');

  const zoomControls = document.createElement('div');
  zoomControls.className = 'production-calendar-toolbar-actions production-calendar-toolbar-actions-primary';

  const horizonControls = document.createElement('div');
  horizonControls.className = 'production-calendar-toolbar-actions production-calendar-toolbar-horizon production-calendar-toolbar-actions-right';

  [7, 15, 30].forEach(dayCount => {
    const button = createToolbarButton({
      label: `+${dayCount} dias`,
      title: `Exibir mais ${dayCount} dias`,
      className: 'production-calendar-toolbar-button',
      onClick: () => actions.onExpandHorizon?.(dayCount)
    });
    button.dataset.productionCalendarAction = `expand-${dayCount}`;
    button.dataset.productionCalendarExpand = String(dayCount);
    horizonControls.appendChild(button);
  });

  const showAllButton = createToolbarButton({
    label: 'Data limite produção',
    title: 'Remover somente os dias vazios posteriores à última produção',
    className: 'production-calendar-toolbar-button',
    onClick: actions.onShowAllDays
  });
  showAllButton.dataset.productionCalendarAction = 'show-all';
  horizonControls.appendChild(showAllButton);

  const manualActions = document.createElement('div');
  manualActions.className = 'production-calendar-manual-actions';

  const undoButton = createToolbarButton({
    label: '←',
    title: 'Desfazer última alteração',
    className: 'production-calendar-toolbar-button production-calendar-toolbar-button-icon production-calendar-undo-button',
    onClick: actions.onUndoManualChange
  });
  undoButton.dataset.productionCalendarAction = 'undo-manual-change';
  manualActions.appendChild(undoButton);

  const redoButton = createToolbarButton({
    label: '→',
    title: 'Refazer alteração',
    className: 'production-calendar-toolbar-button production-calendar-toolbar-button-icon production-calendar-redo-button',
    onClick: actions.onRedoManualChange
  });
  redoButton.dataset.productionCalendarAction = 'redo-manual-change';
  manualActions.appendChild(redoButton);

  const discardButton = createToolbarButton({
    label: 'Descartar todas as alterações',
    title: 'Remover todas as edições manuais e restaurar a simulação automática',
    className: 'production-calendar-toolbar-button danger-button production-calendar-discard-button',
    onClick: actions.onDiscardAllChanges
  });
  discardButton.dataset.productionCalendarAction = 'discard-all-changes';
  manualActions.appendChild(discardButton);

  const optimizeButton = createToolbarButton({
    label: 'Simular com base no aproveitamento',
    title: 'Reorganizar produções para maximizar pessoas, produtividade e menor tempo',
    className: 'production-calendar-toolbar-button production-calendar-optimize-button',
    onClick: actions.onOptimizeUtilization
  });
  optimizeButton.dataset.productionCalendarAction = 'optimize-utilization';
  manualActions.appendChild(optimizeButton);

  const fullscreenButton = createToolbarButton({
    label: 'Calend\u00e1rio em tela cheia',
    title: 'Abrir calend\u00e1rio em tela cheia',
    className: 'production-calendar-toolbar-button',
    onClick: actions.onOpenFullscreen
  });
  fullscreenButton.dataset.productionCalendarAction = 'open-fullscreen';

  const selectionPanel = document.createElement('div');
  selectionPanel.className = 'production-calendar-toolbar-selection';
  selectionPanel.dataset.productionCalendarSelection = 'true';
  selectionPanel.hidden = true;

  const selectionPrefix = document.createElement('span');
  selectionPrefix.className = 'production-calendar-toolbar-selection-prefix';
  selectionPrefix.textContent = 'Selecionado:';

  const selectionText = document.createElement('span');
  selectionText.className = 'production-calendar-toolbar-selection-text';
  selectionText.dataset.productionCalendarSelectionText = 'true';

  const cancelSelectionButton = createToolbarButton({
    label: 'Cancelar sele\u00e7\u00e3o',
    title: 'Cancelar sele\u00e7\u00e3o',
    className: 'production-calendar-toolbar-button',
    onClick: actions.onClearSelection
  });
  cancelSelectionButton.dataset.productionCalendarAction = 'clear-selection';

  selectionPanel.append(selectionPrefix, selectionText, cancelSelectionButton);

  const zoomOutButton = createToolbarButton({
    label: '\u2212',
    title: 'Reduzir zoom',
    className: 'production-calendar-toolbar-button production-calendar-toolbar-button-icon',
    onClick: actions.onZoomOut
  });
  zoomOutButton.dataset.productionCalendarAction = 'zoom-out';

  const zoomInButton = createToolbarButton({
    label: '+',
    title: 'Aumentar zoom',
    className: 'production-calendar-toolbar-button production-calendar-toolbar-button-icon',
    onClick: actions.onZoomIn
  });
  zoomInButton.dataset.productionCalendarAction = 'zoom-in';

  const resetButton = createToolbarButton({
    label: 'Restaurar',
    title: 'Restaurar zoom',
    className: 'production-calendar-toolbar-button',
    onClick: actions.onZoomReset
  });
  resetButton.dataset.productionCalendarAction = 'zoom-reset';

  const startButton = createToolbarButton({
    label: 'Ir para o in\u00edcio',
    title: 'Ir para o in\u00edcio',
    className: 'production-calendar-toolbar-button',
    onClick: actions.onGoToStart
  });
  startButton.dataset.productionCalendarAction = 'go-start';

  zoomControls.append(zoomOutButton, zoomInButton, resetButton, startButton, fullscreenButton);

  toolbar.append(manualActions, zoomControls, horizonControls, selectionPanel);
  updateProductionCalendarToolbar(toolbar, state, { selectedAllocation: state.selectedAllocation });

  return toolbar;
}
