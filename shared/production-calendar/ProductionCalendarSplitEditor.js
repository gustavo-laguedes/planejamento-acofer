import { buildManualScheduleAllocationSplit } from '../../services/manualScheduleDraft.service.js';
import {
  PlanningAllocationSplitEditor,
  resolvePlanningAllocationSplitPreview
} from '../planning-editor/PlanningAllocationSplitEditor.js';

function defaultProductionCalendarSplitPreview(allocation, firstPercent, options = {}) {
  return buildManualScheduleAllocationSplit(allocation, firstPercent, options);
}

export function resolveProductionCalendarSplitPreview(allocation, value, options = {}) {
  return resolvePlanningAllocationSplitPreview(defaultProductionCalendarSplitPreview, allocation, value, options);
}

export function ProductionCalendarSplitEditor(options = {}) {
  return PlanningAllocationSplitEditor({
    ...options,
    getSplitPreview: options.getSplitPreview || defaultProductionCalendarSplitPreview
  });
}
