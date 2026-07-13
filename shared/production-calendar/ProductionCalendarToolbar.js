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

  if (zoomOutButton) zoomOutButton.disabled = zoomIndex === 0;
  if (zoomInButton) zoomInButton.disabled = zoomIndex === PRODUCTION_CALENDAR_ZOOM_LEVELS.length - 1;
  if (resetButton) resetButton.disabled = PRODUCTION_CALENDAR_ZOOM_LEVELS[zoomIndex].id === PRODUCTION_CALENDAR_DEFAULT_ZOOM_ID;

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

  zoomControls.append(zoomOutButton, zoomInButton, resetButton, startButton);

  toolbar.append(selectionPanel, zoomControls);
  updateProductionCalendarToolbar(toolbar, state, { selectedAllocation: state.selectedAllocation });

  return toolbar;
}
