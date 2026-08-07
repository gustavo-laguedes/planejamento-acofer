import { validateManualScheduleTemporalRules } from './manualScheduleValidation.service.js';
import { calculateProductivityDailyCapacity } from './manualScheduleDraft.service.js';
import {
  isValidProductivityRow,
  normalizeProductivityIdentity,
  productivityRowPriority,
  resolveCanonicalProductivityConfiguration,
  resolveMaterialProductivityLines,
  resolveProductivityConfiguration
} from './productivityMatrixResolution.service.js';
import {
  blockingRegressionsForDelta,
  compareBlockingDiagnostics
} from './planningDiagnosticDelta.service.js';
import { holidayForDate } from '../shared/holidays.js';

const EPSILON = 1e-6;
const MAX_SEARCH_DAYS = 3660;
const DEFAULT_REOPTIMIZATION_DAILY_MINUTES = 528;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function durationMinutes(value, fallback = DEFAULT_REOPTIMIZATION_DAILY_MINUTES) {
  if (typeof value === 'string') {
    const text = value.trim();
    const match = text.match(/^(\d+)(?:[,.](\d{1,2}))?$/);
    if (match) {
      const hours = Number(match[1]);
      const fraction = match[2] || '';
      if (fraction.length === 2 && Number(fraction) < 60) return (hours * 60) + Number(fraction);
      const parsed = Number(`${match[1]}.${fraction}`);
      if (Number.isFinite(parsed)) return Math.round(parsed * 60);
    }
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : fallback;
}

function round(value) {
  return Number(number(value).toFixed(6));
}

function timeMinutes(value, fallback = '00:00') {
  const [hours, minutes] = String(value || fallback).slice(0, 5).split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesTime(value) {
  const normalized = Math.max(Math.round(value), 0);
  return `${String(Math.floor(normalized / 60) % 24).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dateTimeFromDayMinute(date, minutes) {
  const normalized = Math.max(Math.round(minutes), 0);
  return {
    date: addDays(date, Math.floor(normalized / (24 * 60))),
    time: minutesTime(normalized)
  };
}

function cursor(date, time = '00:00') {
  return { date: String(date || '').slice(0, 10), minutes: timeMinutes(time) };
}

function compareCursor(left, right) {
  return String(left.date).localeCompare(String(right.date)) || number(left.minutes) - number(right.minutes);
}

function maxCursor(...values) {
  return values.filter(Boolean).sort(compareCursor).at(-1) || null;
}

function allocationStart(allocation) {
  return cursor(allocation.date, allocation.startTime || '00:00');
}

function allocationEnd(allocation) {
  const end = cursor(allocation.endDate || allocation.date, allocation.endTime || allocation.startTime || '00:00');
  if (end.date === allocation.date && end.minutes <= timeMinutes(allocation.startTime || '00:00')) end.minutes += 24 * 60;
  return end;
}

function parentId(allocation = {}) {
  return String(allocation.parentOperationId || allocation.calendarParentOperationId || allocation.operationId || '').replace(/:day-\d+$/i, '');
}

function machineKeys(value = {}) {
  if (typeof value !== 'object' || value === null) {
    return [normalizeProductivityIdentity(value)].filter(Boolean);
  }
  return [value.machineId, value.machine_id, value.machineName, value.machine_name, value.name, value.id]
    .map(normalizeProductivityIdentity)
    .filter(Boolean);
}

function registeredMachineKeys(value = {}) {
  return [value.machineId, value.machineName, value.id, value.name]
    .map(normalizeProductivityIdentity)
    .filter(Boolean);
}

function matrixRowMachineKeys(value = {}) {
  return [value.machine_id, value.machineId, value.machine_name, value.machineName]
    .map(normalizeProductivityIdentity)
    .filter(Boolean);
}

function identityValues(source = {}, fields = []) {
  return fields.flatMap(field => {
    const value = source?.[field];
    return Array.isArray(value) ? value : [value];
  }).map(normalizeProductivityIdentity).filter(Boolean);
}

function exactMaterialMatrixRows(workItem = {}, rows = []) {
  const codes = new Set(identityValues(workItem, [
    'code', 'materialCode', 'material_code', 'codes', 'materialCodes', 'material_codes'
  ]));
  const names = new Set(identityValues(workItem, ['name', 'materialName', 'material_name']));
  if (!codes.size && !names.size) return rows;
  return rows.filter(row => {
    const rowCodes = identityValues(row, ['material_code', 'materialCode', 'material_codes', 'materialCodes']);
    const rowNames = identityValues(row, ['material_name', 'materialName', 'name']);
    return rowCodes.some(code => codes.has(code)) || rowNames.some(name => names.has(name));
  });
}

function normalizedUnit(value = {}) {
  return String(value.unit ?? value.output_unit ?? value.outputUnit ?? value.plannedUnit ?? '').trim().toLowerCase();
}

function uniqueBy(values, key) {
  const result = [];
  const seen = new Set();
  for (const value of values || []) {
    const identity = key(value);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(clone(value));
  }
  return result;
}

function issue(code, message, details = {}) {
  return {
    issueId: `${code}:${details.parentOperationId || details.allocationId || details.date || 'planning'}`,
    code,
    severity: 'error',
    blocking: true,
    rule: 'planning_reoptimization',
    message,
    allocationIds: details.allocationId ? [String(details.allocationId)] : [],
    machineIds: details.machineId ? [String(details.machineId)] : [],
    parentOperationIds: details.parentOperationId ? [String(details.parentOperationId)] : [],
    dependencyIds: details.dependencyId ? [String(details.dependencyId)] : [],
    materialIds: details.materialId ? [String(details.materialId)] : [],
    locationId: null,
    date: details.date || null,
    startTime: details.startTime || null,
    endTime: details.endTime || null,
    details: clone(details)
  };
}

function emptyValidation(errors = []) {
  return {
    valid: false,
    errors,
    warnings: [],
    affectedAllocations: { byAllocationId: {}, byDate: {} },
    stockProjection: { byMaterial: {}, timeline: [], summary: {} },
    dependencyStatus: { byDependencyId: {}, byAllocationId: {} },
    resourceProjection: { byDate: {}, byMachine: {}, summary: {} },
    summary: { errorCount: errors.length, warningCount: 0 }
  };
}

function failurePolicy(diagnostics) {
  const diagnosticDelta = compareBlockingDiagnostics({
    previousDiagnostics: emptyValidation(),
    candidateDiagnostics: diagnostics
  });
  return {
    diagnosticDelta,
    blockingRegressions: blockingRegressionsForDelta(diagnosticDelta, diagnostics)
  };
}

function normalizeCutoff(value = {}) {
  const date = String(value.date || value.cutoffDate || value || '').slice(0, 10);
  const time = String(value.time || '00:00').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    const error = new Error('Data de corte inválida para reotimização.');
    error.code = 'INVALID_REOPTIMIZATION_CUTOFF';
    throw error;
  }
  return { date, time, cursor: cursor(date, time) };
}

function normalizeShift(shift = {}, index = 0) {
  const start = timeMinutes(shift.startTime || shift.shiftStartTime || (index ? '17:00' : '07:00'));
  const suppliedEnd = shift.endTime || shift.shiftEndTime;
  let end = suppliedEnd
    ? timeMinutes(suppliedEnd)
    : start + durationMinutes(shift.hoursPerDay, index ? 360 : DEFAULT_REOPTIMIZATION_DAILY_MINUTES);
  if (end <= start) end += 24 * 60;
  const normalized = {
    shiftId: String(shift.shiftId ?? shift.id ?? `shift-${index + 1}`),
    label: String(shift.label || `Turno ${index + 1}`),
    start,
    end,
    teamAvailable: Math.max(number(shift.teamAvailable ?? shift.peopleCount ?? shift.people_count, 999999), 0)
  };
  const pauseStart = timeMinutes(shift.pauseStartTime || shift.lunchStartTime || '', '00:00');
  const pauseMinutes = Math.max(number(shift.pauseMinutes ?? (number(shift.pauseHours) * 60)), 0);
  let pauseEnd = timeMinutes(shift.pauseEndTime || shift.lunchEndTime || '', '00:00');
  if (pauseMinutes > 0 && pauseEnd <= pauseStart) pauseEnd = pauseStart + pauseMinutes;
  if (pauseStart > start && pauseEnd > pauseStart && pauseEnd < end) {
    return [{ ...normalized, end: pauseStart }, { ...normalized, start: pauseEnd }];
  }
  return [normalized];
}

function calendarContext(calendar = {}, acceptedDraft = {}) {
  const shifts = (Array.isArray(calendar.shifts) && calendar.shifts.length ? calendar.shifts : [{ startTime: '07:00', endTime: '16:00' }])
    .flatMap(normalizeShift)
    .sort((left, right) => left.start - right.start || left.shiftId.localeCompare(right.shiftId));
  return {
    shifts,
    manualWorkDates: new Set((calendar.manualWorkDates ?? acceptedDraft.manualWorkDates ?? []).map(String)),
    dailyTeamOverrides: clone(calendar.dailyTeamOverrides ?? acceptedDraft.dailyTeamOverrides ?? {}),
    holidays: new Set((calendar.holidays || []).map(item => String(item?.date || item).slice(0, 10)))
  };
}

function isWorkingDate(date, calendar) {
  if (calendar.manualWorkDates.has(date)) return true;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !calendar.holidays.has(date) && !holidayForDate(date);
}

function availablePeople(date, shift, calendar) {
  const overrides = calendar.dailyTeamOverrides?.[date] || {};
  const value = overrides[shift.shiftId] ?? overrides[shift.label] ?? overrides[String(shift.label).replace(/^Turno\s*/i, 'T')];
  return value === undefined || value === null ? shift.teamAvailable : Math.max(number(value), 0);
}

function totalShiftMinutes(shifts = []) {
  return (shifts || []).reduce((sum, shift) => {
    const start = timeMinutes(shift.startTime || shift.shiftStartTime || '', '00:00');
    const suppliedEnd = shift.endTime || shift.shiftEndTime;
    let end = suppliedEnd
      ? timeMinutes(suppliedEnd)
      : start + durationMinutes(shift.hoursPerDay, 0);
    if (end <= start) end += 24 * 60;
    return sum + Math.max(end - start, 0);
  }, 0);
}

function validMatrixRow(row, unit = '') {
  return isValidProductivityRow(row, { unit });
}

function matrixConfiguration(row, machines = [], material = {}, dailyMinutes = DEFAULT_REOPTIMIZATION_DAILY_MINUTES) {
    const rowMachineKeys = new Set(matrixRowMachineKeys(row));
    const registeredMachine = (machines || []).find(machine => registeredMachineKeys(machine).some(key => rowMachineKeys.has(key)));
    const timeSeconds = number(row.time_seconds ?? row.timeSeconds ?? number(row.time_minutes ?? row.timeMinutes) * 60);
    const outputQty = number(row.output_qty ?? row.outputQty);
    const safeDailyMinutes = Math.max(number(dailyMinutes, DEFAULT_REOPTIMIZATION_DAILY_MINUTES), 1);
    const canonical = resolveCanonicalProductivityConfiguration({
      material, reference: material, productivityRows: [row], machines: registeredMachine ? [registeredMachine] : [],
      machine: registeredMachine, peopleCount: row.people_count ?? row.peopleCount,
      productivityLineId: row.id
    });
    return {
      row: clone(row),
      machineId: String(registeredMachine?.machineId ?? registeredMachine?.id ?? row.machine_id ?? row.machineId ?? row.machine_name ?? row.machineName),
      machineName: String(row.machine_name ?? row.machineName ?? registeredMachine?.machineName ?? registeredMachine?.name ?? row.machine_id ?? row.machineId),
      peopleCount: number(row.people_count ?? row.peopleCount),
      machinePriority: productivityRowPriority(row),
      ratePerMinute: outputQty / safeDailyMinutes,
      outputQty,
      timeSeconds,
      productivityLineId: canonical?.productivityLineId || String(row.id ?? ''),
      materialIdentity: canonical ? {
        id: canonical.materialId,
        code: canonical.materialCode,
        codes: clone(canonical.materialCodes),
        name: canonical.materialName
      } : null,
      canonicalConfiguration: canonical
    };
}

function matchingMatrixRows(workItem, matrix, machines = [], dailyMinutes = DEFAULT_REOPTIMIZATION_DAILY_MINUTES) {
  const workItemUnit = normalizedUnit(workItem);
  const resolvedRows = resolveMaterialProductivityLines({
    material: workItem,
    reference: workItem,
    productivityMatrix: matrix,
    unit: workItemUnit
  });
  const exactResolvedRows = exactMaterialMatrixRows(workItem, resolvedRows);
  const candidateRows = exactResolvedRows.length
    ? exactResolvedRows
    : exactMaterialMatrixRows(workItem, (matrix || []).filter(row => validMatrixRow(row, workItemUnit)));
  return candidateRows
    .map(row => matrixConfiguration(row, machines, workItem, dailyMinutes))
    .filter(configuration => configuration.ratePerMinute > 0 && configuration.timeSeconds > 0);
}

export function selectPlanningEditorProductivityRows({ material = {}, productivityMatrix = [] } = {}) {
  const rows = (productivityMatrix || []).filter(row => validMatrixRow(row));
  const identities = (source, fields) => fields.flatMap(field => {
    const value = source?.[field];
    return Array.isArray(value) ? value : [value];
  }).map(normalizeProductivityIdentity).filter(Boolean);
  const materialIds = [...new Set(identities(material, ['id', 'materialId', 'material_id']))];
  const rowsByMaterialId = materialIds.length
    ? rows.filter(row => identities(row, ['material_id', 'materialId']).some(value => materialIds.includes(value)))
    : [];
  if (rowsByMaterialId.length) return clone(rowsByMaterialId);

  const materialCodes = [...new Set(identities(material, [
    'code', 'materialCode', 'material_code', 'codes', 'materialCodes', 'material_codes'
  ]))];
  const explicitPrimaryCodes = identities(material, ['code', 'materialCode', 'material_code']);
  const registeredCodes = identities(material, ['codes', 'materialCodes', 'material_codes']);
  const primaryMaterialCodes = [...new Set(explicitPrimaryCodes.length ? explicitPrimaryCodes : registeredCodes.slice(0, 1))];
  const rowsByPrimaryCode = primaryMaterialCodes.length
    ? rows.filter(row => identities(row, ['material_code', 'materialCode']).some(value => primaryMaterialCodes.includes(value)))
    : [];
  if (rowsByPrimaryCode.length) return clone(rowsByPrimaryCode);

  const materialNames = [...new Set(identities(material, ['name', 'materialName', 'material_name']))];
  const rowsByContainedCodeSet = materialCodes.length
    ? rows.filter(row => {
        const rowCodes = [...new Set(identities(row, ['material_codes', 'materialCodes']))];
        return rowCodes.length > 0 && rowCodes.every(value => materialCodes.includes(value));
      })
    : [];
  if (rowsByContainedCodeSet.length) return clone(rowsByContainedCodeSet);

  const rowsByCodeAndName = materialCodes.length && materialNames.length
    ? rows.filter(row => (
        identities(row, ['material_codes', 'materialCodes']).some(value => materialCodes.includes(value))
        && identities(row, ['material_name', 'materialName']).some(value => materialNames.includes(value))
      ))
    : [];
  if (rowsByCodeAndName.length) return clone(rowsByCodeAndName);

  return clone(rows.filter(row => (
    materialNames.length
    && identities(row, ['material_name', 'materialName']).some(value => materialNames.includes(value))
  )));
}

export function getPlanningOperationResourceOptions({ productivityRows = [], machines = [], material = {} } = {}) {
  const configurations = (productivityRows || [])
    .filter(row => validMatrixRow(row))
    .map(row => matrixConfiguration(row, machines, material))
    .filter(configuration => Number.isInteger(configuration.peopleCount) && configuration.peopleCount >= 1);
  const byMachine = new Map();
  configurations.forEach(configuration => {
    const machineName = String(configuration.machineName || '').trim();
    if (!machineName) return;
    const machineKey = machineName.toLowerCase();
    const current = byMachine.get(machineKey) || {
      machineId: configuration.machineId,
      machineName,
      peopleCounts: [],
      configurations: []
    };
    if (!current.peopleCounts.includes(configuration.peopleCount)) current.peopleCounts.push(configuration.peopleCount);
    current.configurations.push(configuration);
    byMachine.set(machineKey, current);
  });
  return [...byMachine.values()].map(machine => ({
    ...machine,
    peopleCounts: machine.peopleCounts.sort((left, right) => left - right),
    maxPeople: Math.max(...machine.peopleCounts)
  })).sort((left, right) => left.machineName.localeCompare(right.machineName));
}

export function buildPlanningOperationResourcePreview({ allocation = {}, machine = {}, peopleCount, dailyMinutes } = {}) {
  const configuration = resolveProductivityConfiguration({
    configurations: machine.configurations || [],
    machine,
    peopleCount
  });
  if (!configuration) return null;
  const normalizedDailyMinutes = Number(dailyMinutes);
  if (!(normalizedDailyMinutes > 0)) return null;
  const capacity = calculateProductivityDailyCapacity(configuration.row, normalizedDailyMinutes);
  if (!(capacity.capacityPerDay > 0) || !(capacity.secondsPerUnit > 0)) return null;
  const quantity = Math.max(number(allocation.quantity), 0);
  const durationMinutes = Math.max(Math.ceil((quantity * capacity.secondsPerUnit) / 60), 1);
  const startDate = String(allocation.date || '').slice(0, 10);
  const startTime = String(allocation.startTime || '00:00').slice(0, 5);
  const start = new Date(`${startDate}T${startTime}:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return {
    capacityPerDay: round(capacity.capacityPerDay),
    startDate,
    startTime,
    endDate: end.toISOString().slice(0, 10),
    endTime: end.toISOString().slice(11, 16),
    durationMinutes,
    productivityLineId: String(configuration.productivityLineId ?? configuration.row?.id ?? ''),
    productivityConfiguration: clone(configuration.canonicalConfiguration || configuration)
  };
}

export function buildPlanningProductionConfigurationEditCommand({ allocation = {}, parentOperationId, machine = {}, peopleCount, productivityConfiguration, cutoff = {} } = {}) {
  const configuration = productivityConfiguration || resolveProductivityConfiguration({
    configurations: machine.configurations || [], machine, peopleCount: Number(peopleCount)
  })?.canonicalConfiguration;
  if (!configuration) return null;
  return {
    type: 'EDIT_PRODUCTION_CONFIGURATION',
    allocationId: String(allocation.allocationId || ''),
    sourceAllocationIds: clone(allocation.sourceAllocationIds || []),
    parentOperationId: String(parentOperationId || allocation.parentOperationId || ''),
    materialIdentity: {
      id: String(configuration.materialId ?? allocation.materialId ?? ''),
      code: String(configuration.materialCode ?? allocation.materialCode ?? ''),
      codes: clone(configuration.materialCodes ?? allocation.materialCodes ?? []),
      name: String(configuration.materialName ?? allocation.materialName ?? '')
    },
    previousConfiguration: {
      machineId: String(allocation.machineId || ''),
      people: Number(allocation.peopleCount)
    },
    requestedConfiguration: {
      machineId: String(configuration.machineId ?? machine.machineId ?? ''),
      machineName: String(configuration.machineName ?? machine.machineName ?? ''),
      people: Number(configuration.people ?? peopleCount),
      productivityLineId: String(configuration.productivityLineId ?? '')
    },
    productivityConfiguration: clone(configuration),
    cutoff: { date: String(cutoff.date || ''), time: String(cutoff.time || '') }
  };
}

function operationResourceEdits(value) {
  if (Array.isArray(value)) return value;
  return Object.entries(value || {}).map(([parentOperationId, edit]) => ({ parentOperationId, ...(edit || {}) }));
}

function configurationMatchesResourceEdit(configuration, edit) {
  const requested = edit?.requestedConfiguration || edit || {};
  return Boolean(resolveProductivityConfiguration({
    configurations: [configuration],
    machineId: requested.machineId,
    machineName: requested.machineName,
    peopleCount: Number(requested.people ?? requested.peopleCount),
    productivityLineId: requested.productivityLineId
  }));
}

function configurationFromCanonicalEdit(item, edit) {
  const requested = edit?.requestedConfiguration || edit || {};
  const canonical = edit?.productivityConfiguration || {};
  const row = canonical.row || {};
  const asList = value => Array.isArray(value) ? value : [value].filter(item => item !== undefined && item !== null);
  if (!validMatrixRow(row, item.unit)) return null;
  const requestedPeople = Number(requested.people ?? requested.peopleCount);
  const canonicalPeople = Number(canonical.people ?? canonical.peopleCount ?? row.people_count ?? row.peopleCount);
  if (canonicalPeople !== requestedPeople) return null;
  const requestedLine = String(requested.productivityLineId || '');
  const canonicalLine = String(canonical.productivityLineId ?? row.id ?? '');
  if (requestedLine && canonicalLine && requestedLine !== canonicalLine) return null;
  const requestedMachineKeys = machineKeys({ machineId: requested.machineId, machineName: requested.machineName });
  const canonicalMachineKeys = [
    ...machineKeys({ machineId: canonical.machineId, machineName: canonical.machineName }),
    ...machineKeys(row)
  ];
  if (!requestedMachineKeys.length || !requestedMachineKeys.some(key => canonicalMachineKeys.includes(key))) return null;
  const materialCodes = new Set([item.materialCode, ...asList(item.materialCodes)].map(normalizeProductivityIdentity).filter(Boolean));
  const canonicalCodes = [
    canonical.materialCode,
    ...asList(canonical.materialCodes),
    row.material_code,
    row.materialCode,
    ...asList(row.material_codes),
    ...asList(row.materialCodes)
  ].map(normalizeProductivityIdentity).filter(Boolean);
  const sameMaterial = String(canonical.materialId || '') === String(item.materialId || '')
    || canonicalCodes.some(code => materialCodes.has(code))
    || normalizeProductivityIdentity(canonical.materialName || row.material_name || row.materialName) === normalizeProductivityIdentity(item.materialName);
  if (!sameMaterial) return null;
  const configuration = matrixConfiguration(row, [{
    machineId: requested.machineId || canonical.machineId,
    machineName: requested.machineName || canonical.machineName
  }], {
    id: item.materialId,
    code: item.materialCode,
    codes: item.materialCodes,
    name: item.materialName
  }, item.dailyMinutes);
  return configuration.ratePerMinute > 0 && configuration.timeSeconds > 0 ? configuration : null;
}

function applyOperationResourceEdits(workItems, value) {
  const edits = operationResourceEdits(value);
  for (const edit of edits) {
    const id = String(edit?.parentOperationId || '');
    const item = workItems.find(candidate => candidate.parentOperationId === id);
    if (!item) {
      throw Object.assign(new Error('Esta operação não possui trabalho futuro para editar.'), {
        code: 'NO_FUTURE_WORK_TO_EDIT', details: { parentOperationId: id }
      });
    }
    const configurations = item.allowedConfigurations.filter(configuration => configurationMatchesResourceEdit(configuration, edit));
    const canonicalConfiguration = configurations.length ? null : configurationFromCanonicalEdit(item, edit);
    if (canonicalConfiguration) configurations.push(canonicalConfiguration);
    if (!configurations.length) {
      throw Object.assign(new Error(`A combinação de máquina e pessoas não existe na Matriz para ${item.materialName}.`), {
        code: 'INVALID_OPERATION_RESOURCE_CONFIGURATION',
        details: { parentOperationId: id, machineId: edit.machineId, peopleCount: edit.peopleCount }
      });
    }
    if (edit?.type === 'EDIT_PRODUCTION_CONFIGURATION' && edit?.allocationId) {
      const requested = edit.requestedConfiguration || edit || {};
      const requestedMachineKeys = machineKeys({
        machineId: requested.machineId,
        machineName: requested.machineName
      });
      const sameRequestedMachine = configuration => requestedMachineKeys.some(key => (
        machineKeys(configuration).includes(key) || machineKeys(configuration.row).includes(key)
      ));
      item.allowedConfigurations = uniqueBy([...configurations, ...item.allowedConfigurations], configuration => JSON.stringify([
        configuration.machineId,
        configuration.machineName,
        configuration.peopleCount,
        configuration.productivityLineId
      ])).filter(sameRequestedMachine);
      item.scopedEditConfiguration = configurations[0];
      item.scopedEditDate = item.allocationTemplate?.date || item.earliestStart?.date || '';
    } else {
      item.allowedConfigurations = configurations;
    }
    item.preferredMachineId = configurations[0].machineId;
    item.preferredMachineName = configurations[0].machineName;
    item.pinnedConstraints = [
      ...item.pinnedConstraints.filter(constraint => constraint.type !== 'OPERATION_RESOURCES'),
      {
        type: 'OPERATION_RESOURCES',
        parentOperationId: id,
        machineId: configurations[0].machineId,
        machineName: configurations[0].machineName,
        peopleCount: configurations[0].peopleCount,
        source: 'production-calendar-editor'
      }
    ];
  }
}

function scaleComponents(components, ratio, fallback) {
  const source = Array.isArray(components) && components.length ? components : [fallback];
  return source.map(component => ({ ...clone(component), quantity: round(number(component.quantity) * ratio) }))
    .filter(component => component.quantity > EPSILON);
}

function scaleAllocationQuantity(allocation, quantity) {
  const originalQuantity = number(allocation.quantity);
  const nextQuantity = round(quantity);
  const ratio = originalQuantity > 0 ? nextQuantity / originalQuantity : 0;
  return {
    ...clone(allocation),
    quantity: nextQuantity,
    components: scaleComponents(allocation.components, ratio, {
      allocationId: allocation.allocationId,
      parentOperationId: parentId(allocation),
      productionId: allocation.productionId,
      quantity: originalQuantity
    })
  };
}

function aggregateComponents(allocations, id) {
  const aggregated = new Map();
  for (const allocation of allocations) {
    const components = Array.isArray(allocation.components) && allocation.components.length
      ? allocation.components
      : [{ allocationId: allocation.allocationId, parentOperationId: id, productionId: allocation.productionId, quantity: allocation.quantity }];
    for (const component of components) {
      const key = `${component.parentOperationId || id}|${component.productionId || allocation.productionId || ''}`;
      const current = aggregated.get(key) || { ...clone(component), parentOperationId: component.parentOperationId || id, quantity: 0 };
      current.quantity = round(current.quantity + number(component.quantity));
      aggregated.set(key, current);
    }
  }
  return [...aggregated.values()];
}

function splitAtCutoff(allocation, cutoff) {
  const start = allocationStart(allocation);
  const end = allocationEnd(allocation);
  if (compareCursor(end, cutoff.cursor) <= 0) return { frozen: clone(allocation), completedQuantity: number(allocation.quantity), remainingQuantity: 0 };
  if (compareCursor(start, cutoff.cursor) >= 0) return { frozen: null, completedQuantity: 0, remainingQuantity: number(allocation.quantity) };
  const totalMinutes = Math.max((end.date === start.date ? end.minutes - start.minutes : number(allocation.durationMinutes)), 1);
  const completedMinutes = cutoff.cursor.date === start.date ? Math.max(cutoff.cursor.minutes - start.minutes, 0) : Math.min(number(allocation.durationMinutes), totalMinutes);
  const completedQuantity = round(number(allocation.quantity) * Math.min(completedMinutes / totalMinutes, 1));
  const remainingQuantity = round(number(allocation.quantity) - completedQuantity);
  const ratio = number(allocation.quantity) > 0 ? completedQuantity / number(allocation.quantity) : 0;
  return {
    frozen: {
      ...clone(allocation),
      endDate: cutoff.date,
      endTime: cutoff.time,
      quantity: completedQuantity,
      durationMinutes: completedMinutes,
      components: scaleComponents(allocation.components, ratio, {
        allocationId: allocation.allocationId,
        parentOperationId: parentId(allocation),
        productionId: allocation.productionId,
        quantity: allocation.quantity
      })
    },
    completedQuantity,
    remainingQuantity
  };
}

function constraintsForParent(draft, id, sourceAllocations, cutoff) {
  const explicit = (draft.constraints || []).filter(item => (
    String(item.parentOperationId || '') === id
    && item.type !== 'MANUAL_TRANSPORT'
  ));
  const inferred = sourceAllocations
    .filter(item => item.pinned && compareCursor(allocationStart(item), cutoff.cursor) >= 0)
    .flatMap(item => {
      const base = [
        { type: 'PIN_MACHINE', parentOperationId: id, machineId: item.machineId, machineName: item.machineName, source: 'legacy-pinned' }
      ];
      return item.isCapacityOverride ? base : [
        ...base,
        { type: 'PIN_START', parentOperationId: id, date: item.date, time: item.startTime, source: 'legacy-pinned' },
        { type: 'PIN_SEGMENT', parentOperationId: id, allocationId: item.allocationId, date: item.date, time: item.startTime, machineId: item.machineId, quantity: item.quantity, source: 'legacy-pinned' }
      ];
    });
  return uniqueBy([...explicit, ...inferred], item => JSON.stringify([item.type, item.parentOperationId, item.machineId, item.date, item.time]));
}

function minimumStartCursor(item) {
  const starts = (item.pinnedConstraints || [])
    .filter(value => value.type === 'MIN_START')
    .map(value => cursor(value.date, value.time || '00:00'));
  return maxCursor(...starts);
}

export function buildRemainingWorkItems({ acceptedDraft, cutoff, productivityMatrix = [], baseline = {}, operationResourceEdits: resourceEdits = [], scopeParentOperationIds = [], dailyMinutes = DEFAULT_REOPTIMIZATION_DAILY_MINUTES } = {}) {
  const normalizedCutoff = normalizeCutoff(cutoff);
  const allocations = clone(acceptedDraft?.allocations || []);
  const resourceEditList = operationResourceEdits(resourceEdits);
  const scopedResourceEdits = resourceEditList.filter(edit => edit?.type === 'EDIT_PRODUCTION_CONFIGURATION' && edit?.allocationId);
  const scopedEditIds = new Set(scopedResourceEdits.map(edit => String(edit.allocationId || '')));
  const scopeParents = new Set((Array.isArray(scopeParentOperationIds) ? scopeParentOperationIds : [])
    .map(value => String(value || ''))
    .filter(Boolean));
  const byParent = new Map();
  allocations.forEach(allocation => {
    const id = parentId(allocation);
    if (!id) return;
    if (!byParent.has(id)) byParent.set(id, []);
    byParent.get(id).push(allocation);
  });
  const logicalOperations = new Map((baseline.operations || []).map(operation => [
    String(operation.calendarParentOperationId || operation.splitParentOperationId || operation.operationId || operation.materialId || ''),
    operation
  ]));
  const frozenAllocations = [];
  const workItems = [];
  for (const [id, sourceAllocations] of [...byParent.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (scopeParents.size && !scopeParents.has(id)) {
      sourceAllocations.forEach(allocation => frozenAllocations.push(clone(allocation)));
      continue;
    }
    const parentScopedEdits = scopedResourceEdits.filter(edit => String(edit.parentOperationId || '') === id);
    const selectedAllocations = parentScopedEdits.length
      ? sourceAllocations.filter(allocation => scopedEditIds.has(String(allocation.allocationId || '')))
      : sourceAllocations;
    if (parentScopedEdits.length) {
      sourceAllocations
        .filter(allocation => !scopedEditIds.has(String(allocation.allocationId || '')))
        .forEach(allocation => frozenAllocations.push(clone(allocation)));
    } else if (scopedResourceEdits.length) {
      sourceAllocations.forEach(allocation => frozenAllocations.push(clone(allocation)));
      continue;
    }
    if (!selectedAllocations.length) continue;
    let originalQuantity = 0;
    let completedQuantity = 0;
    selectedAllocations.forEach(allocation => {
      originalQuantity += number(allocation.quantity);
      const split = splitAtCutoff(allocation, normalizedCutoff);
      completedQuantity += split.completedQuantity;
      if (split.frozen && split.frozen.quantity > EPSILON) frozenAllocations.push(split.frozen);
    });
    originalQuantity = round(originalQuantity);
    completedQuantity = round(completedQuantity);
    const remainingQuantity = round(originalQuantity - completedQuantity);
    if (remainingQuantity < -EPSILON || Math.abs(originalQuantity - completedQuantity - remainingQuantity) > EPSILON) {
      const error = new Error(`Falha ao calcular o saldo restante da operação ${id}.`);
      error.code = 'CUTOFF_RESIDUAL_CALCULATION_FAILED';
      throw error;
    }
    if (remainingQuantity <= EPSILON) continue;
    const first = selectedAllocations[0];
    const logical = logicalOperations.get(id) || {};
    const resourceEdit = resourceEditList.find(edit => String(edit?.parentOperationId || '') === id) || {};
    const materialIdentity = resourceEdit.materialIdentity || {};
    const materialReference = {
      ...logical,
      ...first,
      materialId: materialIdentity.id || first.materialId || logical.materialId,
      materialCode: materialIdentity.code || first.materialCode || logical.materialCode,
      materialCodes: materialIdentity.codes || first.materialCodes || logical.materialCodes,
      materialName: materialIdentity.name || first.materialName || logical.materialName
    };
    const memberships = uniqueBy(selectedAllocations.flatMap(item => item.productionMemberships || []), item => String(item.productionId ?? item.productionIndex));
    const constraints = constraintsForParent(acceptedDraft || {}, id, selectedAllocations, normalizedCutoff);
    const resourceConstraint = constraints.find(constraint => constraint.type === 'OPERATION_RESOURCES');
    const allowedConfigurations = matchingMatrixRows(materialReference, productivityMatrix, baseline.machines, dailyMinutes);
    workItems.push({
      workItemId: `work:${id}`,
      parentOperationId: id,
      materialId: String(materialReference.materialId || ''),
      materialCode: String(materialReference.materialCode || ''),
      materialCodes: clone(materialReference.materialCodes || []),
      materialName: String(materialReference.materialName || ''),
      unit: String(first.unit || logical.unit || logical.outputUnit || ''),
      dailyMinutes,
      originalQuantity,
      completedQuantity,
      remainingQuantity,
      productionMemberships: memberships,
      productionStage: first.productionStage ?? logical.productionStage ?? null,
      productionStageLabel: first.productionStageLabel ?? logical.productionStageLabel ?? null,
      productionId: first.productionId || logical.productionKey || '',
      productionIndex: first.productionIndex ?? logical.productionIndex ?? 0,
      productionOrder: number(logical.productionOrder ?? first.sequence),
      dependencyRequirements: clone(logical.dependencyRequirements || []),
      dependencyOperationIds: clone(logical.dependencyOperationIds || logical.dependencyMaterialIds || []),
      allowedConfigurations: resourceConstraint
        ? allowedConfigurations.filter(configuration => configurationMatchesResourceEdit(configuration, resourceConstraint))
        : allowedConfigurations,
      pinnedConstraints: constraints,
      earliestStart: clone(normalizedCutoff),
      frozenSegments: frozenAllocations.filter(item => parentId(item) === id && selectedAllocations.some(source => String(source.allocationId) === String(item.allocationId))).map(clone),
      preferredMachineId: String(first.machineId || logical.machineId || logical.machineName || ''),
      preferredMachineName: String(first.machineName || logical.machineName || first.machineId || ''),
      sourceAllocationIds: uniqueBy(selectedAllocations.flatMap(item => item.sourceAllocationIds || [item.allocationId]), String),
      allocationTemplate: {
        ...clone(first),
        materialId: String(materialReference.materialId || ''),
        materialCode: String(materialReference.materialCode || ''),
        materialCodes: clone(materialReference.materialCodes || []),
        materialName: String(materialReference.materialName || ''),
        components: aggregateComponents(selectedAllocations, id)
      },
      logicalOperation: clone(logical)
    });
  }
  return { cutoff: normalizedCutoff, workItems, frozenAllocations };
}

function dependencyEdges(workItems, dependencies = []) {
  const ids = new Set(workItems.map(item => item.parentOperationId));
  const edges = [];
  for (const dependency of dependencies || []) {
    const producer = String(dependency.producerParentOperationId || dependency.predecessorParentOperationId || dependency.sourceParentOperationId || dependency.producerOperationId || '');
    const consumer = String(dependency.consumerParentOperationId || dependency.successorParentOperationId || dependency.targetParentOperationId || dependency.consumerOperationId || '');
    if (ids.has(consumer) && producer) edges.push({ producer, consumer, dependency });
  }
  for (const item of workItems) {
    for (const producer of item.dependencyOperationIds || []) {
      const id = String(producer);
      if (id) edges.push({ producer: id, consumer: item.parentOperationId, dependency: {} });
    }
  }
  return uniqueBy(edges, edge => `${edge.producer}>${edge.consumer}`);
}

function stockPriorityForItem(item, stockContext = {}) {
  const materialKeys = new Set([item.materialId, item.materialCode, ...(item.materialCodes || [])].map(normalizeProductivityIdentity).filter(Boolean));
  const timelineRows = (stockContext.stockProjection?.timeline || []).filter(row => (
    materialKeys.has(normalizeProductivityIdentity(row.materialId ?? row.material_id ?? row.materialCode ?? row.code))
    && (!item.earliestStart?.date || String(row.timestampKey || '') <= `${item.earliestStart.date}T23:59`)
  ));
  if (timelineRows.length) {
    const latestByLocation = new Map();
    timelineRows
      .sort((left, right) => String(left.timestampKey || '').localeCompare(String(right.timestampKey || '')))
      .forEach(row => latestByLocation.set(String(row.locationId ?? row.location_id ?? ''), row));
    return [...latestByLocation.values()].reduce((sum, row) => sum + number(row.availableBalance ?? row.available_balance), 0);
  }
  const stockRows = [...(stockContext.stock || []), ...(stockContext.stockProjection?.stock || [])];
  const matchingRows = stockRows.filter(row => materialKeys.has(normalizeProductivityIdentity(row.materialId ?? row.material_id ?? row.code ?? row.materialCode)));
  if (!matchingRows.length) return Number.POSITIVE_INFINITY;
  return matchingRows.reduce((sum, row) => sum + number(row.availableQuantity ?? row.available_quantity ?? row.quantity), 0);
}

function topologicalWorkItems(workItems, edges, stockContext = {}) {
  const pending = new Map(workItems.map(item => [item.parentOperationId, item]));
  const ordered = [];
  while (pending.size) {
    const ready = [...pending.values()].filter(item => !edges.some(edge => edge.consumer === item.parentOperationId && pending.has(edge.producer)))
      .sort((left, right) => (
        stockPriorityForItem(left, stockContext) - stockPriorityForItem(right, stockContext)
        || left.productionOrder - right.productionOrder
        || left.parentOperationId.localeCompare(right.parentOperationId)
      ));
    if (!ready.length) return null;
    for (const item of ready) {
      ordered.push(item);
      pending.delete(item.parentOperationId);
    }
  }
  return ordered;
}

function intervalsForDate(allocations, date) {
  return allocations.filter(item => item.date === date).map(item => ({
    start: timeMinutes(item.startTime), end: timeMinutes(item.endTime),
    people: number(item.peopleCount), machineId: String(item.machineId), allocation: item
  }));
}

function nextBoundary(start, end, intervals) {
  return Math.min(end, ...intervals.flatMap(item => [item.start, item.end]).filter(value => value > start));
}

function configurationOrder(configurations, item, pinMachine) {
  const preferredKeys = new Set([
    ...machineKeys(pinMachine),
    ...machineKeys({ machineId: item.preferredMachineId, machineName: item.preferredMachineName })
  ]);
  return [...configurations].sort((left, right) => {
    const leftKeys = [...machineKeys(left), ...machineKeys(left.row)];
    const rightKeys = [...machineKeys(right), ...machineKeys(right.row)];
    const leftPreferred = leftKeys.some(key => preferredKeys.has(key));
    const rightPreferred = rightKeys.some(key => preferredKeys.has(key));
    return Number(rightPreferred) - Number(leftPreferred)
      || productivityRowPriority(left) - productivityRowPriority(right)
      || right.peopleCount - left.peopleCount
      || right.ratePerMinute - left.ratePerMinute
      || left.machineName.localeCompare(right.machineName);
  });
}

function nextSegmentIndexForParent(parentOperationId, allocations = []) {
  const prefix = `reopt:${parentOperationId}:`;
  return allocations.reduce((highest, allocation) => {
    const id = String(allocation?.allocationId || '');
    if (!id.startsWith(prefix)) return highest;
    const parsed = Number(id.slice(prefix.length));
    return Number.isInteger(parsed) ? Math.max(highest, parsed) : highest;
  }, 0);
}

function createReoptimizedAllocation(item, selected, { allocationId, date, minute, duration, quantity }) {
  const dailyCapacity = Math.max(number(selected.outputQty), EPSILON);
  const template = item.allocationTemplate;
  const ratio = item.originalQuantity > 0 ? quantity / item.originalQuantity : 0;
  const startPoint = dateTimeFromDayMinute(date, minute);
  const endPoint = dateTimeFromDayMinute(date, minute + duration);
  return {
    ...clone(template),
    allocationId,
    parentOperationId: item.parentOperationId,
    operationId: item.parentOperationId,
    calendarParentOperationId: item.parentOperationId,
    machineId: selected.machineId,
    machineName: selected.machineName,
    date: startPoint.date,
    startTime: startPoint.time,
    endDate: endPoint.date,
    endTime: endPoint.time,
    quantity,
    durationMinutes: duration,
    peopleCount: selected.peopleCount,
    maximumDailyQuantity: round(dailyCapacity),
    maxDailyCapacity: round(dailyCapacity),
    capacityPercent: round((quantity / dailyCapacity) * 100),
    productivity: { outputQty: selected.outputQty, timeSeconds: selected.timeSeconds, ratePerMinute: selected.ratePerMinute },
    source: 'automatic',
    pinned: false,
    productionMemberships: clone(item.productionMemberships),
    productionStage: item.productionStage,
    productionStageLabel: item.productionStageLabel,
    sourceAllocationIds: clone(item.sourceAllocationIds),
    sourceParentOperationIds: [item.parentOperationId],
    components: scaleComponents(template.components, ratio, {
      allocationId,
      parentOperationId: item.parentOperationId,
      productionId: item.productionId,
      quantity: item.originalQuantity
    })
  };
}

function matchesPinnedMachine(configuration, pinMachine) {
  const pinnedKeys = machineKeys(pinMachine);
  if (!pinnedKeys.length) return true;
  const configurationKeys = new Set([...machineKeys(configuration), ...machineKeys(configuration.row)]);
  return pinnedKeys.some(key => configurationKeys.has(key));
}

function eligibleConfigurationsForItem(item, state) {
  const pinMachine = item.pinnedConstraints.find(value => value.type === 'PIN_MACHINE') || null;
  const maximumKnownTeam = Math.max(
    ...state.calendar.shifts.map(shift => shift.teamAvailable),
    ...Object.values(state.calendar.dailyTeamOverrides || {}).flatMap(value => Object.values(value || {}).map(number))
  );
  const orderedConfigurations = configurationOrder(item.allowedConfigurations, item, pinMachine);
  const capacityConfigurations = orderedConfigurations
    .filter(configuration => configuration.peopleCount <= maximumKnownTeam);
  const configurations = capacityConfigurations
    .filter(configuration => matchesPinnedMachine(configuration, pinMachine));
  if (!configurations.length) {
    throw Object.assign(new Error(`NÃ£o existe configuraÃ§Ã£o de produtividade compatÃ­vel para ${item.materialName}.`), {
      code: pinMachine ? 'PINNED_ALLOCATION_BECAME_INFEASIBLE' : 'NO_PRODUCTIVITY_CONFIGURATION_FOR_CAPACITY',
      details: {
        parentOperationId: item.parentOperationId,
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialCodes: item.materialCodes,
        machineId: pinMachine?.machineId || item.preferredMachineId,
        machineName: pinMachine?.machineName || item.preferredMachineName,
        peopleCount: pinMachine?.peopleCount || item.allocationTemplate?.peopleCount,
        pinnedMachineKeys: machineKeys(pinMachine),
        maximumKnownTeam,
        availableConfigurations: orderedConfigurations.map(configuration => ({
          machineId: configuration.machineId,
          machineName: configuration.machineName,
          peopleCount: configuration.peopleCount,
          outputQty: configuration.outputQty,
          outputUnit: configuration.outputUnit,
          productivityLineId: configuration.productivityLineId
        })),
        capacityCompatibleConfigurations: capacityConfigurations.map(configuration => ({
          machineId: configuration.machineId,
          machineName: configuration.machineName,
          peopleCount: configuration.peopleCount,
          outputQty: configuration.outputQty,
          outputUnit: configuration.outputUnit,
          productivityLineId: configuration.productivityLineId
        }))
      }
    });
  }
  return configurations;
}

function allocateWorkItem(item, state, earliest, policies = {}) {
  const pinMachine = item.pinnedConstraints.find(value => value.type === 'PIN_MACHINE') || null;
  const pinStart = item.pinnedConstraints.find(value => value.type === 'PIN_START');
  const minStart = minimumStartCursor(item);
  let search = maxCursor(earliest, minStart, pinStart ? cursor(pinStart.date, pinStart.time) : null);
  let remaining = item.remainingQuantity;
  const allocations = [];
  let selectedConfiguration = null;
  const maximumKnownTeam = Math.max(
    ...state.calendar.shifts.map(shift => shift.teamAvailable),
    ...Object.values(state.calendar.dailyTeamOverrides || {}).flatMap(value => Object.values(value || {}).map(number))
  );
  const orderedConfigurations = configurationOrder(item.allowedConfigurations, item, pinMachine);
  const capacityConfigurations = orderedConfigurations
    .filter(configuration => configuration.peopleCount <= maximumKnownTeam);
  const matrixConfigurations = capacityConfigurations
    .filter(configuration => matchesPinnedMachine(configuration, pinMachine));
  const configurations = matrixConfigurations;
  if (!configurations.length) {
    throw Object.assign(new Error(`Não existe configuração de produtividade compatível para ${item.materialName}.`), {
      code: pinMachine ? 'PINNED_ALLOCATION_BECAME_INFEASIBLE' : 'NO_PRODUCTIVITY_CONFIGURATION_FOR_CAPACITY',
      details: {
        parentOperationId: item.parentOperationId,
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialCodes: item.materialCodes,
        machineId: pinMachine?.machineId || item.preferredMachineId,
        machineName: pinMachine?.machineName || item.preferredMachineName,
        peopleCount: pinMachine?.peopleCount || item.allocationTemplate?.peopleCount,
        pinnedMachineKeys: machineKeys(pinMachine),
        maximumKnownTeam,
        availableConfigurations: orderedConfigurations.map(configuration => ({
          machineId: configuration.machineId,
          machineName: configuration.machineName,
          peopleCount: configuration.peopleCount,
          outputQty: configuration.outputQty,
          outputUnit: configuration.outputUnit,
          productivityLineId: configuration.productivityLineId
        })),
        capacityCompatibleConfigurations: capacityConfigurations.map(configuration => ({
          machineId: configuration.machineId,
          machineName: configuration.machineName,
          peopleCount: configuration.peopleCount,
          outputQty: configuration.outputQty,
          outputUnit: configuration.outputUnit,
          productivityLineId: configuration.productivityLineId
        }))
      }
    });
  }
  let segmentIndex = nextSegmentIndexForParent(item.parentOperationId, [
    ...state.frozenAllocations,
    ...state.scheduledAllocations
  ]);
  for (let dayGuard = 0; remaining > EPSILON && dayGuard < MAX_SEARCH_DAYS; dayGuard += 1) {
    const date = dayGuard === 0 ? search.date : addDays(search.date, dayGuard);
    if (!isWorkingDate(date, state.calendar)) continue;
    const dayIntervals = intervalsForDate([...state.frozenAllocations, ...state.scheduledAllocations], date);
    for (const shift of state.calendar.shifts) {
      let minute = Math.max(shift.start, date === search.date ? search.minutes : shift.start);
      while (minute < shift.end && remaining > EPSILON) {
        const active = dayIntervals.filter(interval => interval.start < minute + 1 && interval.end > minute);
        const boundary = nextBoundary(minute, shift.end, dayIntervals);
        let selected = null;
        const scopedEditConfigurations = item.scopedEditConfiguration && date === item.scopedEditDate
          ? [item.scopedEditConfiguration]
          : null;
        const candidateConfigurations = scopedEditConfigurations || (selectedConfiguration ? [selectedConfiguration] : configurations);
        for (const configuration of candidateConfigurations) {
          const machineBusy = active.some(interval => machineKeys(interval.allocation).some(key => machineKeys(configuration).includes(key)));
          const peopleUsed = active.reduce((sum, interval) => sum + interval.people, 0);
          const available = availablePeople(date, shift, state.calendar);
          if (!machineBusy && configuration.peopleCount + peopleUsed <= available) {
            selected = configuration;
            if (!item.scopedEditConfiguration) selectedConfiguration ||= configuration;
            break;
          }
        }
        if (!selected) {
          minute = Math.max(boundary, minute + 1);
          continue;
        }
        const duration = Math.min(boundary - minute, Math.ceil(remaining / selected.ratePerMinute));
        if (!(duration > 0)) {
          minute += 1;
          continue;
        }
        const quantity = round(Math.min(remaining, duration * selected.ratePerMinute));
        const dailyCapacity = Math.max(number(selected.outputQty), EPSILON);
        segmentIndex += 1;
        const allocationId = `reopt:${item.parentOperationId}:${String(segmentIndex).padStart(3, '0')}`;
        const template = item.allocationTemplate;
        const ratio = item.originalQuantity > 0 ? quantity / item.originalQuantity : 0;
        const startPoint = dateTimeFromDayMinute(date, minute);
        const endPoint = dateTimeFromDayMinute(date, minute + duration);
        const allocation = {
          ...clone(template),
          allocationId,
          parentOperationId: item.parentOperationId,
          operationId: item.parentOperationId,
          calendarParentOperationId: item.parentOperationId,
          machineId: selected.machineId,
          machineName: selected.machineName,
          date: startPoint.date,
          startTime: startPoint.time,
          endDate: endPoint.date,
          endTime: endPoint.time,
          quantity,
          durationMinutes: duration,
          peopleCount: selected.peopleCount,
          maximumDailyQuantity: round(dailyCapacity),
          maxDailyCapacity: round(dailyCapacity),
          capacityPercent: round((quantity / dailyCapacity) * 100),
          productivity: { outputQty: selected.outputQty, timeSeconds: selected.timeSeconds, ratePerMinute: selected.ratePerMinute },
          source: 'automatic',
          pinned: false,
          productionMemberships: clone(item.productionMemberships),
          productionStage: item.productionStage,
          productionStageLabel: item.productionStageLabel,
          sourceAllocationIds: clone(item.sourceAllocationIds),
          sourceParentOperationIds: [item.parentOperationId],
          components: scaleComponents(template.components, ratio, {
            allocationId,
            parentOperationId: item.parentOperationId,
            productionId: item.productionId,
            quantity: item.originalQuantity
          })
        };
        allocations.push(allocation);
        state.scheduledAllocations.push(allocation);
        remaining = round(remaining - quantity);
        minute += duration;
      }
    }
  }
  if (remaining > EPSILON) {
    throw Object.assign(new Error(`Nenhum slot de máquina foi encontrado para ${item.materialName}.`), {
      code: 'NO_MACHINE_SLOT_AVAILABLE', details: { parentOperationId: item.parentOperationId, materialId: item.materialId }
    });
  }
  if (pinStart && allocations[0] && (allocations[0].date !== pinStart.date || allocations[0].startTime !== pinStart.time)) {
    throw Object.assign(new Error(`A posição fixada da operação ${item.materialName} tornou-se inviável.`), {
      code: 'PINNED_ALLOCATION_BECAME_INFEASIBLE', details: { parentOperationId: item.parentOperationId, date: pinStart.date, startTime: pinStart.time }
    });
  }
  return allocations;
}

function utilizationCandidateScore({ item, configuration, quantity, peopleUsed, available, mode = 'utilization' }) {
  const peopleAfter = peopleUsed + number(configuration.peopleCount);
  const peopleUtilization = available > 0 ? peopleAfter / available : 0;
  const segmentCapacity = number(configuration.outputQty) > 0 ? quantity / number(configuration.outputQty) : 0;
  const remainingAfter = Math.max(number(item._remainingQuantity) - quantity, 0);
  const closesItem = remainingAfter <= EPSILON ? 1 : 0;
  const preferredKeys = machineKeys({ machineId: item.preferredMachineId, machineName: item.preferredMachineName });
  const preferred = machineKeys(configuration).some(key => preferredKeys.includes(key)) ? 1 : 0;
  if (mode === 'fastest') {
    return (
      number(configuration.ratePerMinute) * 100000
      + Math.min(segmentCapacity, 1) * 5000
      + Math.min(peopleUtilization, 1) * 1500
      + closesItem * 500
      + preferred * 25
      - productivityRowPriority(configuration) * 0.01
    );
  }
  return (
    Math.min(peopleUtilization, 1) * 100000
    + Math.min(segmentCapacity, 1) * 25000
    + number(configuration.ratePerMinute) * 500
    + closesItem * 250
    + preferred * 25
    - productivityRowPriority(configuration) * 0.01
  );
}

function allocateWorkItemsByUtilization(workItems, state, edges, cutoff, baseline = {}, policies = {}) {
  const items = workItems.map(item => ({
    ...item,
    _remainingQuantity: item.remainingQuantity,
    _configurations: eligibleConfigurationsForItem(item, state),
    _segmentIndex: nextSegmentIndexForParent(item.parentOperationId, [
      ...state.frozenAllocations,
      ...state.scheduledAllocations
    ])
  }));
  const byParent = new Map(items.map(item => [item.parentOperationId, item]));
  const completion = new Map();
  let totalRemaining = round(items.reduce((sum, item) => sum + number(item._remainingQuantity), 0));
  for (let dayGuard = 0; totalRemaining > EPSILON && dayGuard < MAX_SEARCH_DAYS; dayGuard += 1) {
    const date = dayGuard === 0 ? cutoff.date : addDays(cutoff.date, dayGuard);
    if (!isWorkingDate(date, state.calendar)) continue;
    for (const shift of state.calendar.shifts) {
      let minute = Math.max(shift.start, date === cutoff.date ? cutoff.minutes : shift.start);
      while (minute < shift.end && totalRemaining > EPSILON) {
        const dayIntervals = intervalsForDate([...state.frozenAllocations, ...state.scheduledAllocations], date);
        const active = dayIntervals.filter(interval => interval.start < minute + 1 && interval.end > minute);
        const boundary = nextBoundary(minute, shift.end, dayIntervals);
        const peopleUsed = active.reduce((sum, interval) => sum + interval.people, 0);
        const available = availablePeople(date, shift, state.calendar);
        let selected = null;
        for (const item of items) {
          if (!(item._remainingQuantity > EPSILON)) continue;
          const hasOpenPredecessor = edges.some(edge => edge.consumer === item.parentOperationId && byParent.get(edge.producer)?._remainingQuantity > EPSILON);
          if (hasOpenPredecessor) continue;
          const pinStart = item.pinnedConstraints.find(value => value.type === 'PIN_START');
          const predecessorStart = maxCursor(...edges
            .filter(edge => edge.consumer === item.parentOperationId)
            .map(edge => completion.get(edge.producer))
            .filter(Boolean)
            .map(end => ({ date: end.date, minutes: end.minutes + number(baseline.dependencyCompletionBufferMinutes, 60) })));
          const earliest = maxCursor(cutoff, minimumStartCursor(item), predecessorStart, pinStart ? cursor(pinStart.date, pinStart.time) : null);
          if (compareCursor({ date, minutes: minute }, earliest) < 0) continue;
          if (pinStart && (date !== pinStart.date || minute !== timeMinutes(pinStart.time))) continue;
          const scopedEditConfigurations = item.scopedEditConfiguration && date === item.scopedEditDate
            ? [item.scopedEditConfiguration]
            : item._configurations;
          for (const configuration of scopedEditConfigurations) {
            const machineBusy = active.some(interval => machineKeys(interval.allocation).some(key => machineKeys(configuration).includes(key)));
            if (machineBusy || configuration.peopleCount + peopleUsed > available) continue;
            const duration = Math.min(boundary - minute, Math.ceil(item._remainingQuantity / configuration.ratePerMinute));
            if (!(duration > 0)) continue;
            const quantity = round(Math.min(item._remainingQuantity, duration * configuration.ratePerMinute));
            const score = utilizationCandidateScore({ item, configuration, quantity, peopleUsed, available, mode: policies.mode });
            if (!selected || score > selected.score) selected = { item, configuration, duration, quantity, score };
          }
        }
        if (!selected) {
          minute = Math.max(boundary, minute + 1);
          continue;
        }
        selected.item._segmentIndex += 1;
        const allocationId = `reopt:${selected.item.parentOperationId}:${String(selected.item._segmentIndex).padStart(3, '0')}`;
        const allocation = createReoptimizedAllocation(selected.item, selected.configuration, {
          allocationId,
          date,
          minute,
          duration: selected.duration,
          quantity: selected.quantity
        });
        state.scheduledAllocations.push(allocation);
        selected.item._remainingQuantity = round(selected.item._remainingQuantity - selected.quantity);
        totalRemaining = round(totalRemaining - selected.quantity);
        if (selected.item._remainingQuantity <= EPSILON) completion.set(selected.item.parentOperationId, allocationEnd(allocation));
      }
    }
  }
  const unfinished = items.find(item => item._remainingQuantity > EPSILON);
  if (unfinished) {
    throw Object.assign(new Error(`Nenhum slot de mÃ¡quina foi encontrado para ${unfinished.materialName}.`), {
      code: 'NO_MACHINE_SLOT_AVAILABLE', details: { parentOperationId: unfinished.parentOperationId, materialId: unfinished.materialId }
    });
  }
  return completion;
}

function compatibleDailyMergeKey(allocation = {}) {
  return [
    allocation.materialId || allocation.materialCode || allocation.materialName,
    allocation.machineId || allocation.machineName,
    allocation.date,
    allocation.unit
  ].map(value => normalizeProductivityIdentity(value)).join('|');
}

function mergeDailyAllocations(group) {
  const ordered = [...group].sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)) || String(left.allocationId).localeCompare(String(right.allocationId)));
  const last = [...ordered].sort((left, right) => {
    const leftEnd = timeMinutes(left.endTime || left.startTime || '00:00');
    const rightEnd = timeMinutes(right.endTime || right.startTime || '00:00');
    return leftEnd - rightEnd || String(left.allocationId).localeCompare(String(right.allocationId));
  }).at(-1) || ordered.at(-1);
  const first = [...ordered].sort((left, right) => (
    number(right.maxDailyCapacity ?? right.maximumDailyQuantity ?? right.capacityMaxPerDay)
    - number(left.maxDailyCapacity ?? left.maximumDailyQuantity ?? left.capacityMaxPerDay)
    || number(right.peopleCount) - number(left.peopleCount)
  ))[0];
  const quantity = round(ordered.reduce((sum, allocation) => sum + number(allocation.quantity), 0));
  const capacity = Math.max(...ordered.map(allocation => number(allocation.maxDailyCapacity ?? allocation.maximumDailyQuantity ?? allocation.capacityMaxPerDay)));
  const ratePerMinute = number(first.productivity?.ratePerMinute, capacity > 0 ? capacity / 480 : 0);
  const durationMinutes = ratePerMinute > 0
    ? Math.max(Math.ceil(quantity / ratePerMinute), 1)
    : ordered.reduce((sum, allocation) => sum + number(allocation.durationMinutes), 0);
  const startTime = ordered[0]?.startTime || first.startTime;
  return {
    ...clone(first),
    allocationId: first.allocationId,
    quantity,
    durationMinutes,
    startTime,
    endDate: last?.endDate || last?.date || first.endDate || first.date,
    endTime: last?.endTime || minutesTime(timeMinutes(startTime) + durationMinutes),
    capacityPercent: capacity > 0 ? round((quantity / capacity) * 100) : round(ordered.reduce((sum, allocation) => sum + number(allocation.capacityPercent), 0)),
    maxDailyCapacity: capacity || first.maxDailyCapacity,
    maximumDailyQuantity: capacity || first.maximumDailyQuantity,
    source: ordered.some(allocation => allocation.source === 'manual') ? 'manual' : first.source,
    pinned: ordered.some(allocation => allocation.pinned),
    productionMemberships: uniqueBy(ordered.flatMap(allocation => allocation.productionMemberships || []), item => String(item.productionId ?? item.productionIndex)),
    sourceAllocationIds: uniqueBy(ordered.flatMap(allocation => allocation.sourceAllocationIds || [allocation.allocationId]), String),
    sourceParentOperationIds: uniqueBy(ordered.flatMap(allocation => allocation.sourceParentOperationIds || [parentId(allocation)]), String),
    components: ordered.flatMap(allocation => Array.isArray(allocation.components) && allocation.components.length
      ? allocation.components.map(clone)
      : [{ allocationId: allocation.allocationId, parentOperationId: parentId(allocation), productionId: allocation.productionId, quantity: allocation.quantity }])
  };
}

function canMergeDailyAllocations(group = []) {
  if (group.length <= 1) return false;
  const ordered = [...group].sort((left, right) => (
    String(left.date).localeCompare(String(right.date))
    || String(left.startTime).localeCompare(String(right.startTime))
    || String(left.allocationId).localeCompare(String(right.allocationId))
  ));
  return ordered.every((allocation, index) => {
    if (String(allocation.endDate || allocation.date) !== String(allocation.date)) return false;
    if (index === 0) return true;
    const previous = ordered[index - 1];
    return String(previous.endDate || previous.date) === String(allocation.date)
      && String(previous.endTime || '') === String(allocation.startTime || '');
  });
}

function consolidateCompatibleDailyAllocations(allocations = []) {
  const groups = new Map();
  for (const allocation of allocations) {
    const key = compatibleDailyMergeKey(allocation);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(allocation);
  }
  const result = [];
  for (const group of groups.values()) {
    const totalCapacity = group.reduce((sum, allocation) => sum + number(allocation.capacityPercent), 0);
    if (group.length > 1 && totalCapacity <= 100 + EPSILON) result.push(mergeDailyAllocations(group));
    else result.push(...group.map(clone));
  }
  return result.sort((left, right) => (
    String(left.date).localeCompare(String(right.date))
    || String(left.startTime).localeCompare(String(right.startTime))
    || String(left.machineId).localeCompare(String(right.machineId))
    || String(left.allocationId).localeCompare(String(right.allocationId))
  ));
}

function rebuildOperations(baselineOperations, workItems, allocations) {
  const byParent = new Map();
  allocations.forEach(allocation => {
    const id = parentId(allocation);
    if (!byParent.has(id)) byParent.set(id, []);
    byParent.get(id).push(allocation);
  });
  const itemByParent = new Map(workItems.map(item => [item.parentOperationId, item]));
  return (baselineOperations || []).map(operation => {
    const id = String(operation.calendarParentOperationId || operation.splitParentOperationId || operation.operationId || operation.materialId || '');
    const parts = (byParent.get(id) || []).sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.startTime).localeCompare(String(right.startTime)));
    if (!parts.length) return clone(operation);
    const first = parts[0];
    const last = parts.at(-1);
    const item = itemByParent.get(id);
    return {
      ...clone(operation),
      machineName: first.machineName,
      machineId: first.machineId,
      peopleCount: first.peopleCount,
      produceQty: round(parts.reduce((sum, part) => sum + number(part.quantity), 0)),
      totalMinutes: parts.reduce((sum, part) => sum + number(part.durationMinutes), 0),
      startDate: first.date,
      startTime: first.startTime,
      endDate: last.date,
      endTime: last.endTime,
      segments: parts.map(part => ({ date: part.date, startTime: part.startTime, endTime: part.endTime, minutes: part.durationMinutes })),
      productionMemberships: clone(item?.productionMemberships || operation.productionMemberships),
      _reoptimizationWorkItemId: item?.workItemId || null
    };
  });
}

function pastFingerprint(allocations, cutoff) {
  return JSON.stringify((allocations || []).filter(item => compareCursor(allocationEnd(item), cutoff.cursor) <= 0)
    .sort((left, right) => String(left.allocationId).localeCompare(String(right.allocationId))));
}

function validationContext(baseline, calendar, stockContext, candidateDraft) {
  return {
    draft: candidateDraft,
    shifts: baseline.shifts || calendar.shifts.map(shift => ({ shiftId: shift.shiftId, label: shift.label, startTime: minutesTime(shift.start), endTime: minutesTime(shift.end), teamAvailable: shift.teamAvailable })),
    manualWorkDates: candidateDraft.manualWorkDates || [],
    holidays: baseline.holidays || [],
    timezone: baseline.timezone || 'America/Sao_Paulo',
    operations: baseline.operations || [],
    dependencies: baseline.dependencies || [],
    transports: baseline.transports || [],
    minimumStartRatio: 1,
    dependencyCompletionBufferMinutes: number(baseline.dependencyCompletionBufferMinutes, 60),
    stock: stockContext.stock ?? baseline.stock ?? [],
    stockMinimums: stockContext.stockMinimums ?? baseline.stockMinimums ?? [],
    stockLocations: stockContext.stockLocations ?? baseline.stockLocations ?? [],
    setupMinutes: number(baseline.setupMinutes),
    dailyTeamOverrides: candidateDraft.dailyTeamOverrides || {},
    setupRules: baseline.setupRules || [],
    teamOverrides: baseline.teamOverrides || [],
    setupOverrides: baseline.setupOverrides || []
  };
}

export function reoptimizePlanningFuture({
  baseline = {}, acceptedDraft, cutoff, constraintChanges = {}, productivityMatrix = [], calendar = {}, stockContext = {}, policies = {}
} = {}) {
  const previous = clone(acceptedDraft);
  try {
    const nextSettings = {
      manualWorkDates: clone(constraintChanges.manualWorkDates ?? calendar.manualWorkDates ?? previous.manualWorkDates ?? []),
      dailyTeamOverrides: clone(constraintChanges.dailyTeamOverrides ?? calendar.dailyTeamOverrides ?? previous.dailyTeamOverrides ?? {})
    };
    const nextCalendar = calendarContext({ ...calendar, ...nextSettings }, previous);
    const dailyMinutes = number(
      baseline.dailyMinutes ?? baseline.productionDailyMinutes ?? baseline.planningDailyMinutes,
      totalShiftMinutes(baseline.shifts || calendar.shifts) || DEFAULT_REOPTIMIZATION_DAILY_MINUTES
    );
    const built = buildRemainingWorkItems({
      acceptedDraft: previous,
      cutoff,
      productivityMatrix,
      baseline,
      operationResourceEdits: constraintChanges.operationResourceEdits,
      scopeParentOperationIds: constraintChanges.scopeParentOperationIds,
      dailyMinutes
    });
    applyOperationResourceEdits(built.workItems, constraintChanges.operationResourceEdits);
    const edges = dependencyEdges(built.workItems, baseline.dependencies);
    const ordered = topologicalWorkItems(built.workItems, edges, {
      ...stockContext,
      stockProjection: stockContext.stockProjection || previous?.validation?.stockProjection
    });
    if (!ordered) {
      const diagnostic = issue('DEPENDENCY_CANNOT_BE_SCHEDULED', 'As dependências futuras possuem um ciclo e não podem ser reagendadas.');
      const diagnostics = emptyValidation([diagnostic]);
      return { accepted: false, operations: clone(baseline.operations || []), allocations: clone(previous.allocations), manualScheduleDraft: previous, diagnostics, ...failurePolicy(diagnostics) };
    }
    const state = { calendar: nextCalendar, frozenAllocations: clone(built.frozenAllocations), scheduledAllocations: [] };
    if (['utilization', 'fastest'].includes(policies?.mode)) {
      allocateWorkItemsByUtilization(ordered, state, edges, built.cutoff.cursor, baseline, policies);
    } else {
      const completion = new Map();
      for (const item of ordered) {
        const predecessorEnd = maxCursor(...edges.filter(edge => edge.consumer === item.parentOperationId).map(edge => completion.get(edge.producer)).filter(Boolean));
        const earliest = maxCursor(built.cutoff.cursor, predecessorEnd
          ? { date: predecessorEnd.date, minutes: predecessorEnd.minutes + number(baseline.dependencyCompletionBufferMinutes, 60) }
          : null);
        const parts = allocateWorkItem(item, state, earliest, policies);
        const last = parts.at(-1);
        completion.set(item.parentOperationId, allocationEnd(last));
      }
    }
    const allocations = consolidateCompatibleDailyAllocations([...built.frozenAllocations, ...state.scheduledAllocations].sort((left, right) => (
      String(left.date).localeCompare(String(right.date))
      || String(left.startTime).localeCompare(String(right.startTime))
      || String(left.machineId).localeCompare(String(right.machineId))
      || String(left.allocationId).localeCompare(String(right.allocationId))
    )));
    if (pastFingerprint(previous.allocations, built.cutoff) !== pastFingerprint(allocations, built.cutoff)) {
      const diagnostic = issue('PAST_ALLOCATION_CHANGED', 'A reotimização tentou alterar uma allocation concluída antes do corte.', { date: built.cutoff.date });
      const diagnostics = emptyValidation([diagnostic]);
      return { accepted: false, operations: clone(baseline.operations || []), allocations: clone(previous.allocations), manualScheduleDraft: previous, diagnostics, ...failurePolicy(diagnostics) };
    }
    const totalBefore = round((previous.allocations || []).reduce((sum, item) => sum + number(item.quantity), 0));
    const totalAfter = round(allocations.reduce((sum, item) => sum + number(item.quantity), 0));
    if (Math.abs(totalBefore - totalAfter) > EPSILON) {
      const diagnostic = issue('IDENTITY_CONSERVATION_FAILED', 'A quantidade total não foi conservada durante a reotimização.', { before: totalBefore, after: totalAfter });
      const diagnostics = emptyValidation([diagnostic]);
      return { accepted: false, operations: clone(baseline.operations || []), allocations: clone(previous.allocations), manualScheduleDraft: previous, diagnostics, ...failurePolicy(diagnostics) };
    }
    const editedParentIds = new Set(operationResourceEdits(constraintChanges.operationResourceEdits).map(edit => String(edit.parentOperationId || '')));
    const constraints = uniqueBy([
      ...(previous.constraints || []).filter(constraint => !(
        constraint.type === 'OPERATION_RESOURCES' && editedParentIds.has(String(constraint.parentOperationId || ''))
      )),
      ...built.workItems.flatMap(item => item.pinnedConstraints)
    ], item => JSON.stringify([
      item.type,
      item.transportId,
      item.producerAllocationId,
      item.parentOperationId,
      item.allocationId,
      item.machineId,
      item.machineName,
      item.materialId,
      item.date,
      item.time,
      item.source
    ]));
    const identityMap = Object.fromEntries(built.workItems.map(item => [item.workItemId, {
      parentOperationId: item.parentOperationId,
      sourceAllocationIds: clone(item.sourceAllocationIds),
      allocationIds: allocations.filter(allocation => parentId(allocation) === item.parentOperationId).map(allocation => allocation.allocationId)
    }]));
    const candidateDraft = {
      ...previous,
      version: Math.max(number(previous.version), 2),
      allocations,
      constraints,
      frozenThrough: { date: built.cutoff.date, time: built.cutoff.time },
      schedulerState: {
        workItems: built.workItems.map(item => ({
          workItemId: item.workItemId,
          parentOperationId: item.parentOperationId,
          originalQuantity: item.originalQuantity,
          completedQuantity: item.completedQuantity,
          remainingQuantity: item.remainingQuantity,
          productionMemberships: clone(item.productionMemberships)
        })),
        operationRevisions: Object.entries(identityMap).map(([workItemId, value]) => ({ workItemId, ...clone(value) }))
      },
      identityMap,
      ...nextSettings,
      dirty: true,
      updatedAt: String(constraintChanges.now || new Date().toISOString()),
      lastManualAction: { type: 'REOPTIMIZE_FUTURE', cutoff: { date: built.cutoff.date, time: built.cutoff.time }, changes: clone(constraintChanges) }
    };
    const previousCalendar = calendarContext({
      ...calendar,
      manualWorkDates: previous.manualWorkDates || [],
      dailyTeamOverrides: previous.dailyTeamOverrides || {}
    }, previous);
    const previousDiagnostics = validateManualScheduleTemporalRules(
      validationContext(baseline, previousCalendar, stockContext, previous)
    );
    const diagnostics = validateManualScheduleTemporalRules(validationContext(baseline, nextCalendar, stockContext, candidateDraft));
    const diagnosticDelta = compareBlockingDiagnostics({ previousDiagnostics, candidateDiagnostics: diagnostics });
    const blockingRegressions = blockingRegressionsForDelta(diagnosticDelta, diagnostics);
    const accepted = blockingRegressions.length === 0;
    const candidateValidation = {
      ...clone(diagnostics),
      diagnosticDelta: clone(diagnosticDelta),
      blockingRegressions: clone(blockingRegressions),
      incrementallyAccepted: accepted
    };
    const operations = rebuildOperations(baseline.operations || [], built.workItems, allocations);
    return {
      accepted,
      operations,
      allocations,
      manualScheduleDraft: { ...candidateDraft, validation: candidateValidation },
      diagnostics,
      previousDiagnostics,
      diagnosticDelta,
      blockingRegressions,
      stockProjection: clone(diagnostics.stockProjection),
      dependencyProjection: clone(diagnostics.dependencyStatus),
      changeSet: {
        preservedAllocationIds: built.frozenAllocations.map(item => item.allocationId),
        removedAllocationIds: (previous.allocations || []).filter(item => compareCursor(allocationStart(item), built.cutoff.cursor) >= 0).map(item => item.allocationId),
        createdAllocationIds: state.scheduledAllocations.map(item => item.allocationId)
      },
      identityMap,
      cutoffSnapshot: {
        cutoff: { date: built.cutoff.date, time: built.cutoff.time },
        allocationFingerprint: pastFingerprint(previous.allocations, built.cutoff),
        frozenAllocationIds: built.frozenAllocations.map(item => item.allocationId)
      }
    };
  } catch (error) {
    const diagnostic = issue(error.code || 'PLANNING_REOPTIMIZATION_FAILED', error.message || 'Não foi possível reotimizar o planejamento.', error.details || {});
    const diagnostics = emptyValidation([diagnostic]);
    return {
      accepted: false,
      operations: clone(baseline.operations || []),
      allocations: clone(previous?.allocations || []),
      manualScheduleDraft: previous,
      diagnostics,
      ...failurePolicy(diagnostics),
      stockProjection: clone(previous?.validation?.stockProjection || {}),
      dependencyProjection: clone(previous?.validation?.dependencyStatus || {}),
      changeSet: { preservedAllocationIds: [], removedAllocationIds: [], createdAllocationIds: [] },
      identityMap: clone(previous?.identityMap || {}),
      cutoffSnapshot: null
    };
  }
}
