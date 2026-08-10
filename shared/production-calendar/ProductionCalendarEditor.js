import { buildManualScheduleAllocationParts } from '../../services/manualScheduleDraft.service.js';
import {
  addPlanningAllocationSplitPart,
  equalPlanningAllocationSplitPercents,
  PlanningAllocationEditor,
  resolvePlanningAllocationDistribution,
  resolvePlanningAllocationEditorPreview
} from '../planning-editor/PlanningAllocationEditor.js';

function editorMessage(value) {
  return String(value || '')
    .replace(/\ballocations\b/gi, 'produções')
    .replace(/\ballocation\b/gi, 'produção');
}

function defaultProductionCalendarDistributionPreview(allocation, percents, options = {}) {
  return buildManualScheduleAllocationParts(allocation, percents, options);
}

export const equalProductionCalendarSplitPercents = equalPlanningAllocationSplitPercents;
export const addProductionCalendarSplitPart = addPlanningAllocationSplitPart;
export const resolveProductionCalendarEditorPreview = resolvePlanningAllocationEditorPreview;

export function resolveProductionCalendarDistribution(allocation, values, options = {}) {
  try {
    return resolvePlanningAllocationDistribution(defaultProductionCalendarDistributionPreview, allocation, values, options);
  } catch (error) {
    return { valid: false, message: editorMessage(error?.message || 'Não foi possível calcular a distribuição.') };
  }
}

export function ProductionCalendarEditor(options = {}) {
  return PlanningAllocationEditor({
    ...options,
    getDistributionPreview: options.getDistributionPreview || defaultProductionCalendarDistributionPreview
  });
}
