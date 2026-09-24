import { holidayForDate } from '../shared/holidays.js';

const MINUTES_PER_DAY = 24 * 60;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function clockMinutes(value) {
  if (!TIME_PATTERN.test(String(value || ''))) return null;
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function productiveMinutes(value) {
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
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : null;
}

function clockTime(minutes) {
  const normalized = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function dateMinute(date, time) {
  if (!DATE_PATTERN.test(String(date || ''))) return null;
  const minutes = clockMinutes(time);
  if (minutes === null) return null;
  const [year, month, day] = String(date).split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) return null;
  return Math.floor(instant.getTime() / 60000) + minutes;
}

function minuteFields(value) {
  const instant = new Date(value * 60000);
  const date = `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, '0')}-${String(instant.getUTCDate()).padStart(2, '0')}`;
  const time = `${String(instant.getUTCHours()).padStart(2, '0')}:${String(instant.getUTCMinutes()).padStart(2, '0')}`;
  return { date, time, timestamp: `${date}T${time}` };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unique(values) {
  return [...new Set(values.map(String).filter(Boolean))].sort();
}

function normalizeAllocation(allocation, index) {
  const allocationId = String(allocation?.allocationId ?? allocation?.id ?? `allocation-${index + 1}`);
  const date = String(allocation?.date ?? allocation?.startDate ?? '');
  const startTime = String(allocation?.startTime ?? '');
  const endTime = String(allocation?.endTime ?? '');
  let endDate = String(allocation?.endDate ?? date);
  const start = dateMinute(date, startTime);
  let end = dateMinute(endDate, endTime);
  if (!allocation?.endDate && start !== null && end !== null && end <= start) {
    end += MINUTES_PER_DAY;
    endDate = minuteFields(end).date;
  }
  const materialId = String(allocation?.materialId ?? allocation?.material_id ?? '');
  const materialCode = String(allocation?.materialCode ?? allocation?.material_code ?? allocation?.productionModelName ?? allocation?.model ?? '');
  const unit = String(allocation?.unit ?? allocation?.outputUnit ?? allocation?.plannedUnit ?? '');
  const peopleValue = allocation?.peopleCount ?? allocation?.people_count;
  const peopleCount = peopleValue === undefined || peopleValue === null || peopleValue === '' ? 0 : Number(peopleValue);
  const capacityValue = allocation?.capacityPercent ?? allocation?.capacity_percent;
  const capacityPercent = capacityValue === undefined || capacityValue === null || capacityValue === '' ? null : Number(capacityValue);
  return {
    allocationId,
    machineId: String(allocation?.machineId ?? allocation?.machine_id ?? allocation?.machineName ?? ''),
    date,
    endDate,
    startTime,
    endTime,
    start,
    end,
    valid: start !== null && end !== null && end > start,
    peopleCount: Number.isFinite(peopleCount) && peopleCount >= 0 ? peopleCount : 0,
    capacityPercent: Number.isFinite(capacityPercent) ? capacityPercent : null,
    configurationKey: [materialId, materialCode, unit].map(value => value.trim().toLowerCase()).join('|')
  };
}

function normalizeShift(shift, index) {
  const startTime = String(shift?.startTime ?? shift?.shiftStartTime ?? '');
  const startMinutes = clockMinutes(startTime);
  const suppliedEndTime = shift?.endTime ?? shift?.shiftEndTime;
  const endTime = String(suppliedEndTime ?? (
    startMinutes !== null && productiveMinutes(shift?.hoursPerDay)
      ? clockTime(startMinutes + productiveMinutes(shift.hoursPerDay))
      : ''
  ));
  const endClock = clockMinutes(endTime);
  const valid = startMinutes !== null && endClock !== null && startMinutes !== endClock;
  return {
    shiftId: String(shift?.shiftId ?? shift?.id ?? `shift-${index + 1}`),
    label: String(shift?.label ?? `Turno ${index + 1}`),
    startTime,
    endTime,
    startMinutes,
    endMinutes: valid ? endClock + (endClock < startMinutes ? MINUTES_PER_DAY : 0) : null,
    availablePeople: Number(shift?.availablePeople ?? shift?.teamAvailable),
    valid
  };
}

function shiftIntervalsBetween(shifts, start, end) {
  if (start === null || end === null) return [];
  const firstDay = Math.floor(start / MINUTES_PER_DAY) - 1;
  const lastDay = Math.floor((end - 1) / MINUTES_PER_DAY);
  const intervals = [];
  for (let day = firstDay; day <= lastDay; day += 1) {
    shifts.forEach(shift => {
      const interval = { shiftId: shift.shiftId, label: shift.label, start: day * MINUTES_PER_DAY + shift.startMinutes, end: day * MINUTES_PER_DAY + shift.endMinutes };
      if (interval.end > start && interval.start < end) intervals.push(interval);
    });
  }
  return intervals.sort((left, right) => left.start - right.start || left.end - right.end || left.shiftId.localeCompare(right.shiftId));
}

function intervalCovered(start, end, intervals) {
  let cursor = start;
  for (const interval of intervals) {
    if (interval.end <= cursor) continue;
    if (interval.start > cursor) return false;
    cursor = Math.max(cursor, interval.end);
    if (cursor >= end) return true;
  }
  return false;
}

function isWeekend(date) {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function normalizeHolidayDates(values) {
  return new Set((Array.isArray(values) ? values : []).map(value => String(value?.date ?? value ?? '')).filter(value => DATE_PATTERN.test(value)));
}

function isHoliday(date, holidayDates) {
  return holidayDates.has(date) || Boolean(holidayForDate(date));
}

function materialTransition(rule) {
  const from = String(rule?.fromConfigurationKey ?? rule?.fromMaterialId ?? rule?.fromMaterial ?? rule?.from ?? '').trim().toLowerCase();
  const to = String(rule?.toConfigurationKey ?? rule?.toMaterialId ?? rule?.toMaterial ?? rule?.to ?? '').trim().toLowerCase();
  return { from, to };
}

function configurationMatches(key, wanted) {
  if (!wanted || wanted === '*') return true;
  return key === wanted || key.split('|').includes(wanted);
}

function normalizeSetupRules(setupRules) {
  if (Array.isArray(setupRules)) return setupRules.map((rule, index) => ({ ...rule, _order: index }));
  if (!setupRules || typeof setupRules !== 'object') return [];
  const rules = [];
  Object.entries(setupRules).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, value], index) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) rules.push({ ...value, machineId: value.machineId ?? (key === 'default' ? '' : key), _order: index });
    else rules.push({ machineId: key === 'default' ? '' : key, setupMinutes: value, _order: index });
  });
  return rules;
}

function selectSetupConfiguration(previous, next, defaultMinutes, rules, overrides) {
  const matchingOverride = (Array.isArray(overrides) ? overrides : []).find(item => (
    String(item?.fromAllocationId ?? '') === previous.allocationId
    && String(item?.toAllocationId ?? '') === next.allocationId
  ));
  if (matchingOverride) {
    const minutes = Number(matchingOverride.setupMinutes ?? matchingOverride.durationMinutes ?? defaultMinutes);
    return { minutes, allowOutsideShift: matchingOverride.allowOutsideShift === true, overrideId: String(matchingOverride.overrideId ?? matchingOverride.setupOverrideId ?? '') || null, source: 'override' };
  }
  const candidates = rules.map(rule => {
    const transition = materialTransition(rule);
    const machine = String(rule?.machineId ?? rule?.machine ?? '');
    if (machine && machine !== next.machineId) return null;
    if (!configurationMatches(previous.configurationKey, transition.from) || !configurationMatches(next.configurationKey, transition.to)) return null;
    return { rule, score: (machine ? 4 : 0) + (transition.from ? 2 : 0) + (transition.to ? 1 : 0) };
  }).filter(Boolean).sort((left, right) => right.score - left.score || left.rule._order - right.rule._order);
  const selected = candidates[0]?.rule;
  return {
    minutes: Number(selected?.setupMinutes ?? selected?.durationMinutes ?? defaultMinutes),
    allowOutsideShift: selected?.allowOutsideShift === true || selected?.setupOutsideShift === true,
    overrideId: String(selected?.ruleId ?? selected?.setupRuleId ?? '') || null,
    source: selected ? 'rule' : 'default'
  };
}

function setupIssue(code, setup, values = {}) {
  const startFields = minuteFields(setup.start);
  const endFields = minuteFields(setup.end);
  return {
    code,
    rule: code.toLowerCase(),
    message: values.message || `Conflito de setup entre ${setup.fromAllocationId} e ${setup.toAllocationId}.`,
    allocationIds: [setup.fromAllocationId, setup.toAllocationId],
    machineIds: [setup.machineId],
    date: startFields.date,
    startTime: startFields.time,
    endTime: endFields.time,
    shiftIds: values.shiftIds || [],
    requiredSetupMinutes: setup.durationMinutes,
    availableSetupMinutes: setup.availableMinutes,
    intervals: [{ start: startFields.timestamp, end: endFields.timestamp }],
    overrideId: setup.overrideId,
    details: { setupId: setup.setupId, setupStart: startFields.timestamp, setupEnd: endFields.timestamp, ...values.details }
  };
}

function buildSetups({ allocations, shifts, setupMinutes, setupRules, setupOverrides, releasedDates, holidayDates }) {
  const diagnostics = [];
  const setups = [];
  const rules = normalizeSetupRules(setupRules);
  rules.filter(rule => {
    if (!Object.hasOwn(rule, 'setupMinutes') && !Object.hasOwn(rule, 'durationMinutes')) return false;
    const minutes = Number(rule?.setupMinutes ?? rule?.durationMinutes);
    return !Number.isFinite(minutes) || minutes < 0;
  }).forEach(rule => diagnostics.push({
    code: 'INVALID_SETUP_CONFIGURATION', rule: 'invalid_setup_configuration', message: 'setupRule possui duração inválida.',
    allocationIds: [], machineIds: rule?.machineId ? [String(rule.machineId)] : [], date: null, shiftIds: [],
    requiredSetupMinutes: null, availableSetupMinutes: null, intervals: [], overrideId: String(rule?.ruleId ?? rule?.setupRuleId ?? '') || null,
    details: {}
  }));
  (Array.isArray(setupOverrides) ? setupOverrides : []).forEach(override => {
    const fromId = String(override?.fromAllocationId ?? '');
    const toId = String(override?.toAllocationId ?? '');
    const previous = allocations.find(item => item.allocationId === fromId);
    const next = allocations.find(item => item.allocationId === toId);
    const minutes = Number(override?.setupMinutes ?? override?.durationMinutes ?? setupMinutes);
    if (previous && next && previous.machineId === next.machineId && previous.start < next.start && Number.isFinite(minutes) && minutes >= 0) return;
    diagnostics.push({
      code: 'INVALID_SETUP_CONFIGURATION', rule: 'invalid_setup_configuration', message: 'setupOverride não referencia uma transição válida na mesma máquina.',
      allocationIds: unique([fromId, toId]), machineIds: unique([previous?.machineId, next?.machineId]), date: next?.date || previous?.date || null,
      shiftIds: [], requiredSetupMinutes: Number.isFinite(minutes) ? minutes : null, availableSetupMinutes: null, intervals: [],
      overrideId: String(override?.overrideId ?? override?.setupOverrideId ?? '') || null, details: {}
    });
  });
  const byMachine = new Map();
  allocations.filter(item => item.valid && item.machineId).forEach(item => {
    if (!byMachine.has(item.machineId)) byMachine.set(item.machineId, []);
    byMachine.get(item.machineId).push(item);
  });
  [...byMachine.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([machineId, items]) => {
    items.sort((left, right) => left.start - right.start || left.end - right.end || left.allocationId.localeCompare(right.allocationId));
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const next = items[index];
      if (previous.configurationKey === next.configurationKey) continue;
      const config = selectSetupConfiguration(previous, next, setupMinutes, rules, setupOverrides);
      const availableMinutes = Math.max(next.start - previous.end, 0);
      const setupBase = {
        setupId: `setup:${stableHash([machineId, previous.allocationId, next.allocationId, previous.configurationKey, next.configurationKey].join('|'))}`,
        machineId,
        fromAllocationId: previous.allocationId,
        toAllocationId: next.allocationId,
        start: next.start - (Number.isFinite(config.minutes) ? config.minutes : 0),
        end: next.start,
        durationMinutes: config.minutes,
        availableMinutes,
        overrideId: config.overrideId,
        allowOutsideShift: config.allowOutsideShift
      };
      if (!Number.isFinite(config.minutes) || config.minutes < 0) {
        diagnostics.push(setupIssue('INVALID_SETUP_CONFIGURATION', { ...setupBase, durationMinutes: null }, { message: 'A configuração de setup possui duração inválida.' }));
        continue;
      }
      if (config.minutes === 0) continue;
      setups.push(setupBase);
      if (availableMinutes < config.minutes) diagnostics.push(setupIssue('SETUP_INTERVAL_INSUFFICIENT', setupBase));
      const coveringShifts = shiftIntervalsBetween(shifts, setupBase.start, setupBase.end);
      const setupDates = new Set();
      for (let point = Math.floor(setupBase.start / MINUTES_PER_DAY); point <= Math.floor((setupBase.end - 1) / MINUTES_PER_DAY); point += 1) setupDates.add(minuteFields(point * MINUTES_PER_DAY).date);
      const invalidDate = [...setupDates].some(date => !releasedDates.has(date) && (isWeekend(date) || isHoliday(date, holidayDates)));
      if (invalidDate || (!config.allowOutsideShift && !intervalCovered(setupBase.start, setupBase.end, coveringShifts))) {
        diagnostics.push(setupIssue('SETUP_OUTSIDE_WORK_WINDOW', setupBase, { shiftIds: unique(coveringShifts.map(item => item.shiftId)), details: { invalidDates: [...setupDates].filter(date => !releasedDates.has(date) && (isWeekend(date) || isHoliday(date, holidayDates))).sort() } }));
      }
    }
  });
  for (let index = 0; index < setups.length; index += 1) {
    const setup = setups[index];
    const overlappingAllocations = allocations.filter(item => item.valid && item.machineId === setup.machineId && item.start < setup.end && setup.start < item.end);
    const overlappingSetups = setups.slice(index + 1).filter(item => item.machineId === setup.machineId && item.start < setup.end && setup.start < item.end);
    if (overlappingAllocations.length || overlappingSetups.length) {
      diagnostics.push(setupIssue('SETUP_OVERLAP', setup, {
        details: {
          overlappingAllocationIds: unique(overlappingAllocations.map(item => item.allocationId)),
          overlappingSetupIds: unique(overlappingSetups.map(item => item.setupId))
        }
      }));
    }
  }
  return { setups, diagnostics };
}

function dailyOverrideEntries(input) {
  if (Array.isArray(input)) return input.map(item => ({ date: item?.date, shiftId: item?.shiftId ?? item?.shift, availablePeople: item?.availablePeople ?? item?.teamAvailable }));
  if (!input || typeof input !== 'object') return [];
  const result = [];
  Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).forEach(([date, shifts]) => {
    if (shifts && typeof shifts === 'object' && !Array.isArray(shifts)) {
      Object.entries(shifts).sort(([left], [right]) => left.localeCompare(right)).forEach(([shiftId, availablePeople]) => result.push({ date, shiftId, availablePeople }));
    }
  });
  return result;
}

function shiftForOverride(shifts, suppliedId) {
  const value = String(suppliedId ?? '');
  return shifts.find(item => (
    item.shiftId === value
    || item.label === value
    || item.label.replace(/^Turno\s*/i, 'T') === value
  ));
}

function teamIssue(code, group, interval, values = {}) {
  const start = minuteFields(interval.start);
  const end = minuteFields(interval.end);
  return {
    code,
    rule: code.toLowerCase(),
    message: values.message || `A equipe simultânea excede a capacidade no turno ${group.shiftId}.`,
    severity: values.severity,
    blocking: values.blocking,
    allocationIds: interval.allocationIds || [],
    machineIds: interval.machineIds || [],
    date: group.date,
    startTime: start.time,
    endTime: end.time,
    shiftIds: [group.shiftId],
    availablePeople: values.availablePeople,
    requiredPeople: interval.requiredPeople,
    excessPeople: Math.max(interval.requiredPeople - values.availablePeople, 0),
    intervals: [{ start: start.timestamp, end: end.timestamp }],
    overrideId: values.overrideId || null,
    details: values.details || {}
  };
}

function buildTeamProjection({ allocations, shifts, dailyTeamOverrides, teamOverrides }) {
  const diagnostics = [];
  const overrideMap = new Map();
  dailyOverrideEntries(dailyTeamOverrides).forEach(entry => {
    const shift = shiftForOverride(shifts, entry.shiftId);
    const available = Number(entry.availablePeople);
    if (!DATE_PATTERN.test(String(entry.date || '')) || !shift || !Number.isFinite(available) || available < 0) {
      diagnostics.push({
        code: 'INVALID_TEAM_OVERRIDE', rule: 'invalid_team_override', message: 'dailyTeamOverride inválido.',
        allocationIds: [], machineIds: [], date: DATE_PATTERN.test(String(entry.date || '')) ? String(entry.date) : null,
        shiftIds: shift ? [shift.shiftId] : [], availablePeople: Number.isFinite(available) ? available : null,
        requiredPeople: null, excessPeople: null, intervals: [], overrideId: null,
        details: { suppliedShiftId: String(entry.shiftId ?? '') }
      });
      return;
    }
    overrideMap.set(`${entry.date}|${shift.shiftId}`, available);
  });
  const explicitOverrides = (Array.isArray(teamOverrides) ? teamOverrides : []).map(item => ({
    overrideId: String(item?.overrideId ?? ''), date: String(item?.date ?? ''), shiftId: String(item?.shiftId ?? ''),
    allowedPeople: Number(item?.allowedPeople), allocationIds: unique(Array.isArray(item?.allocationIds) ? item.allocationIds : []), reason: String(item?.reason ?? '')
  }));
  explicitOverrides.filter(item => !item.overrideId || !DATE_PATTERN.test(item.date) || !shifts.some(shift => shift.shiftId === item.shiftId) || !Number.isFinite(item.allowedPeople) || item.allowedPeople < 0 || !item.allocationIds.length || !item.reason).forEach(item => {
    diagnostics.push({ code: 'INVALID_TEAM_OVERRIDE', rule: 'invalid_team_override', message: 'teamOverride extraordinário inválido.', allocationIds: item.allocationIds, machineIds: [], date: DATE_PATTERN.test(item.date) ? item.date : null, shiftIds: item.shiftId ? [item.shiftId] : [], availablePeople: Number.isFinite(item.allowedPeople) ? item.allowedPeople : null, requiredPeople: null, excessPeople: null, intervals: [], overrideId: item.overrideId || null, details: {} });
  });
  const validExplicit = explicitOverrides.filter(item => item.overrideId && DATE_PATTERN.test(item.date) && shifts.some(shift => shift.shiftId === item.shiftId) && Number.isFinite(item.allowedPeople) && item.allowedPeople >= 0 && item.allocationIds.length && item.reason);
  const groups = new Map();
  allocations.filter(item => item.valid).forEach(allocation => {
    const intervals = shiftIntervalsBetween(shifts, allocation.start, allocation.end);
    intervals.forEach(shiftInterval => {
      const fullProductiveDay = Number(allocation.capacityPercent) >= 100;
      const start = fullProductiveDay ? shiftInterval.start : Math.max(allocation.start, shiftInterval.start);
      const end = fullProductiveDay ? shiftInterval.end : Math.min(allocation.end, shiftInterval.end);
      if (start >= end) return;
      const date = minuteFields(shiftInterval.start).date;
      const key = `${date}|${shiftInterval.shiftId}`;
      if (!groups.has(key)) groups.set(key, { date, shiftId: shiftInterval.shiftId, segments: [] });
      groups.get(key).segments.push({ start, end, allocationId: allocation.allocationId, machineId: allocation.machineId, peopleCount: allocation.peopleCount });
    });
    if (!intervalCovered(allocation.start, allocation.end, intervals)) {
      diagnostics.push({ code: 'TEAM_SHIFT_NOT_FOUND', rule: 'team_shift_not_found', message: `Não há turno para avaliar integralmente a equipe da allocation ${allocation.allocationId}.`, allocationIds: [allocation.allocationId], machineIds: [allocation.machineId], date: allocation.date, shiftIds: unique(intervals.map(item => item.shiftId)), availablePeople: null, requiredPeople: allocation.peopleCount, excessPeople: null, intervals: [{ start: minuteFields(allocation.start).timestamp, end: minuteFields(allocation.end).timestamp }], overrideId: null, details: {} });
    }
  });
  const byDate = {};
  let maximumTeamPeak = 0;
  [...groups.values()].sort((left, right) => left.date.localeCompare(right.date) || left.shiftId.localeCompare(right.shiftId)).forEach(group => {
    const shift = shifts.find(item => item.shiftId === group.shiftId);
    const baseAvailable = overrideMap.has(`${group.date}|${group.shiftId}`) ? overrideMap.get(`${group.date}|${group.shiftId}`) : shift.availablePeople;
    const availablePeople = Number.isFinite(baseAvailable) && baseAvailable >= 0 ? baseAvailable : 0;
    const events = group.segments.flatMap(segment => [
      { point: segment.start, type: 1, segment },
      { point: segment.end, type: 0, segment }
    ]).sort((left, right) => left.point - right.point || left.type - right.type || left.segment.allocationId.localeCompare(right.segment.allocationId));
    const active = new Map();
    const intervals = [];
    let cursor = null;
    let eventIndex = 0;
    while (eventIndex < events.length) {
      const point = events[eventIndex].point;
      if (cursor !== null && cursor < point && active.size) {
        const activeSegments = [...active.values()].sort((left, right) => left.allocationId.localeCompare(right.allocationId));
        intervals.push({ start: cursor, end: point, requiredPeople: activeSegments.reduce((sum, item) => sum + item.peopleCount, 0), allocationIds: unique(activeSegments.map(item => item.allocationId)), machineIds: unique(activeSegments.map(item => item.machineId)) });
      }
      while (eventIndex < events.length && events[eventIndex].point === point && events[eventIndex].type === 0) {
        active.delete(events[eventIndex].segment.allocationId);
        eventIndex += 1;
      }
      while (eventIndex < events.length && events[eventIndex].point === point) {
        active.set(events[eventIndex].segment.allocationId, events[eventIndex].segment);
        eventIndex += 1;
      }
      cursor = point;
    }
    let overrideUsed = false;
    intervals.filter(interval => interval.requiredPeople > availablePeople).forEach(interval => {
      const matching = validExplicit.filter(item => item.date === group.date && item.shiftId === group.shiftId && interval.allocationIds.every(id => item.allocationIds.includes(id)));
      const explicit = matching.filter(item => item.allowedPeople >= interval.requiredPeople)
        .sort((left, right) => left.allowedPeople - right.allowedPeople || left.overrideId.localeCompare(right.overrideId))[0]
        || matching.sort((left, right) => right.allowedPeople - left.allowedPeople || left.overrideId.localeCompare(right.overrideId))[0];
      if (explicit && interval.requiredPeople <= explicit.allowedPeople) {
        overrideUsed = true;
        diagnostics.push(teamIssue('TEAM_CAPACITY_OVERRIDE_USED', group, interval, { severity: 'warning', blocking: false, availablePeople, overrideId: explicit.overrideId, details: { allowedPeople: explicit.allowedPeople, reason: explicit.reason } }));
      } else {
        diagnostics.push(teamIssue('TEAM_CAPACITY_EXCEEDED', group, interval, { availablePeople, overrideId: explicit?.overrideId || null, details: explicit ? { allowedPeople: explicit.allowedPeople, reason: explicit.reason } : {} }));
      }
    });
    const peakPeople = intervals.reduce((max, interval) => Math.max(max, interval.requiredPeople), 0);
    maximumTeamPeak = Math.max(maximumTeamPeak, peakPeople);
    byDate[group.date] ||= { shifts: {} };
    byDate[group.date].shifts[group.shiftId] = {
      availablePeople,
      peakPeople,
      utilizationPercent: availablePeople > 0 ? Number(((peakPeople / availablePeople) * 100).toFixed(2)) : (peakPeople > 0 ? null : 0),
      overrideUsed,
      intervals: intervals.map(interval => ({ ...interval, start: minuteFields(interval.start).timestamp, end: minuteFields(interval.end).timestamp }))
    };
  });
  return { diagnostics, byDate, maximumTeamPeak };
}

export function validateManualScheduleResources({
  draft,
  shifts = [],
  setupMinutes = 0,
  setupRules = [],
  dailyTeamOverrides = {},
  teamOverrides = [],
  setupOverrides = [],
  manualWorkDates = [],
  holidays = []
} = {}) {
  const allocations = (Array.isArray(draft?.allocations) ? draft.allocations : []).map(normalizeAllocation);
  const normalizedShifts = (Array.isArray(shifts) ? shifts : []).map(normalizeShift).filter(item => item.valid);
  const releasedDates = new Set((Array.isArray(manualWorkDates) ? manualWorkDates : []).map(value => String(value?.date ?? value ?? '')).filter(value => DATE_PATTERN.test(value)));
  const setupDefault = setupMinutes === undefined || setupMinutes === null || setupMinutes === '' ? 0 : Number(setupMinutes);
  const setupResult = buildSetups({ allocations, shifts: normalizedShifts, setupMinutes: setupDefault, setupRules, setupOverrides, releasedDates, holidayDates: normalizeHolidayDates(holidays) });
  if (!Number.isFinite(setupDefault) || setupDefault < 0) {
    setupResult.diagnostics.unshift({ code: 'INVALID_SETUP_CONFIGURATION', rule: 'invalid_setup_configuration', message: 'setupMinutes deve ser um número não negativo.', allocationIds: [], machineIds: [], date: null, shiftIds: [], requiredSetupMinutes: Number.isFinite(setupDefault) ? setupDefault : null, availableSetupMinutes: null, intervals: [], overrideId: null, details: {} });
  }
  const teamResult = buildTeamProjection({ allocations, shifts: normalizedShifts, dailyTeamOverrides, teamOverrides });
  const setupConflicts = setupResult.diagnostics;
  const teamConflicts = teamResult.diagnostics;
  const byMachine = {};
  allocations.filter(item => item.valid && item.machineId).sort((left, right) => left.machineId.localeCompare(right.machineId)).forEach(item => {
    byMachine[item.machineId] ||= { productionMinutes: 0, setupMinutes: 0, setupCount: 0, conflicts: 0 };
    byMachine[item.machineId].productionMinutes += item.end - item.start;
  });
  setupResult.setups.forEach(setup => {
    byMachine[setup.machineId] ||= { productionMinutes: 0, setupMinutes: 0, setupCount: 0, conflicts: 0 };
    byMachine[setup.machineId].setupMinutes += setup.durationMinutes;
    byMachine[setup.machineId].setupCount += 1;
  });
  Object.keys(byMachine).sort().forEach(machineId => {
    byMachine[machineId].conflicts = [...setupConflicts, ...teamConflicts].filter(item => item.machineIds.includes(machineId) && item.severity !== 'warning').length;
  });
  return {
    setupIntervals: setupResult.setups.map(setup => ({ ...setup, start: minuteFields(setup.start).timestamp, end: minuteFields(setup.end).timestamp })),
    setupConflicts,
    teamConflicts,
    resourceProjection: {
      byDate: teamResult.byDate,
      byMachine,
      summary: {
        setupCount: setupResult.setups.length,
        setupConflictCount: setupConflicts.length,
        teamConflictCount: teamConflicts.filter(item => item.severity !== 'warning').length,
        teamOverrideWarningCount: teamConflicts.filter(item => item.code === 'TEAM_CAPACITY_OVERRIDE_USED').length,
        maximumTeamPeak: teamResult.maximumTeamPeak,
        datesWithTeamConflict: unique(teamConflicts.filter(item => item.severity !== 'warning').map(item => item.date))
      }
    }
  };
}

export function resolveManualScheduleResourceByDate({
  validation,
  allocations = [],
  shifts = [],
  dailyTeamOverrides = {},
  manualWorkDates = [],
  holidays = []
} = {}) {
  const validatedByDate = validation?.resourceProjection?.byDate;
  if (validatedByDate && Object.keys(validatedByDate).length) return validatedByDate;
  return validateManualScheduleResources({
    draft: { allocations },
    shifts,
    dailyTeamOverrides,
    manualWorkDates,
    holidays
  }).resourceProjection.byDate;
}
