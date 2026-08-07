const DEFAULT_TITLE = 'Não foi possível concluir a movimentação';
const DEFAULT_MESSAGE = 'A programação resultante possui uma inconsistência que precisa ser revisada.';
const TECHNICAL_TOKEN = /(?:alloc:|\b(?:parentOperationId|operationId|dependencyId|__default__|stack)\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\bNaN\b)/i;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function first(...values) {
  return values.map(text).find(Boolean) || '';
}

function idOf(value, fields) {
  for (const field of fields) {
    const result = text(value?.[field]);
    if (result) return result;
  }
  return '';
}

function byAliases(values, aliases, id) {
  const key = text(id);
  if (!key) return null;
  return list(values).find(value => aliases.some(alias => text(value?.[alias]) === key)) || null;
}

function unique(values) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function quantity(value) {
  const result = number(value);
  if (result === null) return '';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(Math.abs(result));
}

function dateLabel(value, time = '') {
  const raw = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}${text(time) ? ` às ${text(time).slice(0, 5)}` : ''}`;
}

function minutesLabel(value) {
  const result = number(value);
  return result === null ? '' : `${quantity(result)} min`;
}

function allocationFor(issue, context) {
  const ids = unique(issue?.allocationIds);
  return ids.map(id => byAliases(context.allocations, ['allocationId', 'id'], id)).filter(Boolean);
}

function operationFor(issue, context) {
  const ids = unique(issue?.parentOperationIds);
  return ids.map(id => byAliases(context.operations, ['parentOperationId', 'operationId', 'id'], id)).filter(Boolean);
}

function materialForId(context, id) {
  return byAliases(context.materials, ['materialId', 'id'], id);
}

function materialName(value) {
  return first(value?.materialName, value?.material_name, value?.name, value?.description, value?.code);
}

function machineName(value) {
  return first(value?.machineName, value?.machine_name, value?.name, value?.description);
}

function locationName(value) {
  return first(value?.locationName, value?.location_name, value?.name, value?.description);
}

function resolved(issue, context = {}) {
  const allocations = allocationFor(issue, context);
  const operations = operationFor(issue, context);
  const materialIds = unique([
    ...list(issue?.materialIds),
    ...allocations.map(item => item.materialId ?? item.material_id),
    ...operations.map(item => item.materialId ?? item.material_id)
  ]);
  const materials = materialIds.map(id => materialForId(context, id)).filter(Boolean);
  const materialNames = unique([
    ...materials.map(materialName),
    ...allocations.map(materialName),
    ...operations.map(materialName)
  ]);
  const machineId = first(list(issue?.machineIds)[0], allocations[0]?.machineId, allocations[0]?.machine_id);
  const machine = byAliases(context.machines, ['machineId', 'id', 'machineName', 'name'], machineId);
  const locationId = text(issue?.locationId);
  const location = locationId && locationId !== '__default__'
    ? byAliases(context.locations, ['locationId', 'id'], locationId)
    : null;
  const details = issue?.details && typeof issue.details === 'object' ? issue.details : {};
  const shiftId = first(list(issue?.shiftIds)[0], issue?.shiftId);
  const shift = byAliases(context.shifts, ['shiftId', 'id'], shiftId);
  return {
    allocations,
    operations,
    materialIds,
    materialNames,
    materialName: materialNames[0] || '',
    machineId,
    machineName: first(machineName(machine), allocations.map(machineName).find(Boolean)),
    locationName: locationName(location),
    date: text(issue?.date || allocations[0]?.date),
    startTime: text(issue?.startTime || allocations[0]?.startTime),
    unit: first(issue?.unit, allocations.map(item => item.unit).find(Boolean), operations.map(item => item.unit).find(Boolean), materials.map(item => item.unit).find(Boolean)),
    required: number(issue?.requiredQuantity ?? details.requiredQuantity ?? details.totalRequiredAtStart),
    available: number(issue?.availableQuantity ?? details.availableQuantity),
    deficit: number(issue?.deficitQuantity ?? details.deficit ?? (number(issue?.balanceAfter) !== null && number(issue?.balanceAfter) < 0 ? Math.abs(number(issue?.balanceAfter)) : null)),
    requiredPeople: number(issue?.requiredPeople),
    availablePeople: number(issue?.availablePeople),
    shiftName: first(issue?.shiftName, details.shiftName, shift?.label, shift?.name)
  };
}

function stockPresentation(code, data, issue) {
  const material = data.materialName ? ` de ${data.materialName}` : ' do material';
  const where = data.locationName ? ` no local ${data.locationName}` : '';
  const when = dateLabel(data.date, data.startTime);
  const deficit = data.deficit === null ? '' : ` em ${quantity(data.deficit)}${data.unit ? ` ${data.unit}` : ''}`;
  if (code === 'STOCK_LOCATION_MISMATCH') return {
    title: 'Estoque indisponível no local',
    message: `O estoque${material} não está disponível${where || ' no local necessário'}${when ? ` em ${when}` : ''}.`
  };
  if (code === 'STOCK_MINIMUM_REACHED') return {
    title: 'Estoque mínimo atingido',
    message: `Após esta movimentação, o estoque${material}${where} atingiria o limite mínimo${data.available === null ? '' : ` com saldo de ${quantity(data.available)}${data.unit ? ` ${data.unit}` : ''}`}${when ? ` em ${when}` : ''}.`
  };
  if (code === 'STOCK_TRANSPORT_DISPATCH_SHORTAGE') return {
    title: 'Estoque insuficiente para transporte',
    message: `Não há saldo suficiente${material}${where} para o despacho${deficit ? `; faltariam ${deficit.replace(/^ em /, '')}` : ''}${when ? ` em ${when}` : ''}.`
  };
  return {
    title: 'Estoque insuficiente',
    message: `Após esta movimentação, o consumo simultâneo${material}${where} deixaria o estoque negativo${deficit}${when ? ` em ${when}` : ''}.`
  };
}

function dependencyPresentation(code, data, issue) {
  const details = issue?.details || {};
  const input = data.materialName || 'o insumo necessário';
  const consumer = data.allocations.map(materialName).find(name => name && name !== data.materialName) || 'o material consumidor';
  if (code === 'DEPENDENCY_MINIMUM_NOT_AVAILABLE') {
    const required = data.required === null ? '' : `${quantity(data.required)}${data.unit ? ` ${data.unit}` : ''} de `;
    return { title: 'Insumo insuficiente para iniciar', message: `A produção de ${consumer} precisa de pelo menos ${required}${input} disponível antes de começar${dateLabel(data.date, data.startTime) ? ` em ${dateLabel(data.date, data.startTime)}` : ''}.` };
  }
  if (code === 'DEPENDENCY_FULL_QUANTITY_NOT_AVAILABLE') return { title: 'Insumo insuficiente durante a produção', message: `A quantidade completa de ${input} não estará disponível no ritmo necessário para a produção de ${consumer}${data.deficit === null ? '' : `; faltariam ${quantity(data.deficit)}${data.unit ? ` ${data.unit}` : ''}`}.` };
  if (code === 'DEPENDENCY_CYCLE_DETECTED') return { title: 'Dependências em ciclo', message: 'As dependências entre as produções formam um ciclo e precisam ser revisadas.' };
  return { title: 'Configuração de dependência inválida', message: 'A relação de dependência entre as produções está incompleta ou inválida e precisa ser revisada.' };
}

function setupPresentation(code, data, issue) {
  if (code === 'INVALID_SETUP_CONFIGURATION') return { title: 'Configuração de setup inválida', message: 'O tempo ou a regra de setup da máquina precisa ser revisado.' };
  const names = data.materialNames.slice(0, 2);
  const transition = names.length > 1 ? ` para trocar de ${names[0]} para ${names[1]}` : ' para realizar a troca de produção';
  const machine = data.machineName ? `A máquina ${data.machineName}` : 'A máquina selecionada';
  const onDate = dateLabel(data.date) ? ` em ${dateLabel(data.date)}` : '';
  const titles = {
    SETUP_INTERVAL_INSUFFICIENT: 'Tempo de setup insuficiente',
    SETUP_OUTSIDE_WORK_WINDOW: 'Setup fora do período de trabalho',
    SETUP_OVERLAP: 'Conflito no período de setup'
  };
  const message = code === 'SETUP_INTERVAL_INSUFFICIENT'
    ? `${machine} não possui intervalo suficiente${transition}${onDate}.`
    : code === 'SETUP_OUTSIDE_WORK_WINDOW'
      ? `${machine} precisaria realizar o setup fora do turno ou de uma data liberada${transition}${onDate}.`
      : `${machine} possui outra atividade durante o intervalo necessário${transition}${onDate}.`;
  return { title: titles[code] || 'Conflito de setup', message, details: [issue?.requiredSetupMinutes !== null && issue?.requiredSetupMinutes !== undefined ? `Setup necessário: ${minutesLabel(issue.requiredSetupMinutes)}` : '', issue?.availableSetupMinutes !== null && issue?.availableSetupMinutes !== undefined ? `Intervalo disponível: ${minutesLabel(issue.availableSetupMinutes)}` : ''].filter(Boolean) };
}

function teamPresentation(code, data, issue) {
  const date = dateLabel(data.date);
  const shift = data.shiftName ? ` no turno ${data.shiftName}` : '';
  const people = data.requiredPeople === null ? '' : ` São necessárias ${quantity(data.requiredPeople)} pessoa(s), mas há ${quantity(data.availablePeople ?? 0)} disponível(is).`;
  if (code === 'TEAM_CAPACITY_OVERRIDE_USED') return { title: 'Capacidade extraordinária', message: `Esta produção estava autorizada a operar acima da capacidade normal${date ? ` em ${date}` : ''}.${people}` };
  if (code === 'TEAM_CAPACITY_EXCEEDED') return { title: 'Equipe insuficiente', message: `A equipe disponível${shift}${date ? ` em ${date}` : ''} não atende às produções simultâneas.${people}` };
  if (code === 'TEAM_SHIFT_NOT_FOUND') return { title: 'Turno da equipe não encontrado', message: `Não foi encontrado um turno que cubra toda a produção${date ? ` em ${date}` : ''}.${data.requiredPeople === null ? '' : ` A produção requer ${quantity(data.requiredPeople)} pessoa(s).`}` };
  return { title: 'Autorização de equipe inválida', message: 'A autorização de capacidade da equipe está incompleta ou inválida e precisa ser revisada.' };
}

function calendarPresentation(code, data) {
  const date = dateLabel(data.date);
  const machine = data.machineName ? ` na máquina ${data.machineName}` : '';
  const material = data.materialName ? ` para ${data.materialName}` : '';
  const messages = {
    NON_WORKING_DATE_NOT_RELEASED: ['Data não útil sem liberação', `A data ${date || 'informada'} não é útil e não foi liberada para produção manual${material}${machine}.`],
    ALLOCATION_OUTSIDE_SHIFT: ['Produção fora do turno', `A produção${material}${machine}${date ? ` em ${date}` : ''} não está integralmente coberta por um turno válido.`],
    MACHINE_TIME_OVERLAP: ['Horários sobrepostos na máquina', `Há produções com horários sobrepostos${machine}${date ? ` em ${date}` : ''}.`],
    INVALID_SHIFT_CONFIGURATION: ['Configuração de turno inválida', 'O horário inicial ou final de um turno está inválido e precisa ser revisado.'],
    SHIFT_NOT_FOUND: ['Turno não encontrado', `Não existe um turno válido para cobrir a produção${material}${machine}${date ? ` em ${date}` : ''}.`]
  };
  const [title, message] = messages[code] || [DEFAULT_TITLE, DEFAULT_MESSAGE];
  return { title, message };
}

function productivityPresentation(data) {
  const people = data.allocations[0]?.peopleCount ?? data.operations[0]?.peopleCount;
  const context = [
    data.materialName ? `Material: ${data.materialName}.` : '',
    data.machineName ? `Máquina: ${data.machineName}.` : '',
    number(people) === null ? '' : `Pessoas: ${quantity(people)}.`
  ].filter(Boolean).join(' ');
  return { title: 'Produtividade não cadastrada', message: `Não existe produtividade cadastrada para este material na máquina selecionada com esta quantidade de pessoas.${context ? ` ${context}` : ''}` };
}

function translate(issue, data) {
  const code = text(issue?.code);
  if (code.startsWith('STOCK_') || code === 'NEGATIVE_INITIAL_STOCK') return stockPresentation(code, data, issue);
  if (code.startsWith('DEPENDENCY_') || code === 'INVALID_DEPENDENCY_CONFIGURATION') return dependencyPresentation(code, data, issue);
  if (code.startsWith('SETUP_') || code === 'INVALID_SETUP_CONFIGURATION') return setupPresentation(code, data, issue);
  if (code.startsWith('TEAM_') || code === 'INVALID_TEAM_OVERRIDE') return teamPresentation(code, data, issue);
  if (['NON_WORKING_DATE_NOT_RELEASED', 'ALLOCATION_OUTSIDE_SHIFT', 'MACHINE_TIME_OVERLAP', 'INVALID_SHIFT_CONFIGURATION', 'SHIFT_NOT_FOUND'].includes(code)) return calendarPresentation(code, data);
  if (['PRODUCTIVITY_NOT_FOUND', 'MISSING_PRODUCTIVITY', 'NO_PRODUCTIVITY'].includes(code)) return productivityPresentation(data);
  if (code === 'EXTRAORDINARY_CAPACITY_AUTHORIZED') return { title: 'Capacidade extraordinária', message: `Esta produção estava autorizada a operar acima da capacidade normal${dateLabel(data.date) ? ` em ${dateLabel(data.date)}` : ''}.` };
  return { title: DEFAULT_TITLE, message: DEFAULT_MESSAGE };
}

function safeVisible(value, fallback) {
  const result = text(value);
  return result && !TECHNICAL_TOKEN.test(result) ? result : fallback;
}

function priority(item) {
  if (item.severity === 'warning' || item.blocking === false) return 2;
  if (/INVALID_|CONFIGURATION|CYCLE|OVERLAP/.test(item.code)) return 1;
  return 0;
}

export function presentManualScheduleIssue(issue = {}, context = {}) {
  const data = resolved(issue, context);
  const translated = translate(issue, data);
  const severity = issue?.severity === 'warning' || issue?.blocking === false ? 'warning' : (issue?.severity || 'error');
  const result = {
    code: text(issue?.code) || 'UNKNOWN_MANUAL_SCHEDULE_ISSUE',
    severity,
    blocking: issue?.blocking !== false,
    title: safeVisible(translated.title, DEFAULT_TITLE),
    message: safeVisible(translated.message, DEFAULT_MESSAGE),
    summary: safeVisible(translated.message, DEFAULT_MESSAGE),
    details: list(translated.details).map(value => safeVisible(value, '')).filter(Boolean),
    allocationIds: unique(issue?.allocationIds),
    sourceIssueIds: unique([issue?.issueId]),
    date: data.date || null,
    machineName: data.machineName || null,
    materialNames: data.materialNames,
    quantity: data.deficit ?? data.required,
    unit: data.unit || null,
    technicalDetails: { ...issue }
  };
  return result;
}

function causeKey(item) {
  const technical = item.technicalDetails || {};
  const setupTransition = ['SETUP_INTERVAL_INSUFFICIENT', 'SETUP_OVERLAP'].includes(item.code);
  const stockRupture = ['STOCK_COMMITMENT_SHORTAGE', 'STOCK_NEGATIVE_BALANCE'].includes(item.code);
  const code = setupTransition ? 'SETUP_TRANSITION' : (stockRupture ? 'STOCK_RUPTURE' : item.code);
  const cause = setupTransition || stockRupture ? '' : (technical.rule || technical.details?.cause || '');
  return [code, item.severity, [...item.allocationIds].sort(), item.date, item.machineName, [...item.materialNames].sort(), cause, item.quantity, item.unit].map(value => JSON.stringify(value ?? '')).join('|');
}

function mergePresented(target, source) {
  target.sourceIssueIds = unique([...target.sourceIssueIds, ...source.sourceIssueIds]);
  target.allocationIds = unique([...target.allocationIds, ...source.allocationIds]);
  target.technicalDetails = [target.technicalDetails, source.technicalDetails].flat();
  return target;
}

export function presentManualScheduleValidation(validation = {}, context = {}) {
  const source = [...list(validation?.errors), ...list(validation?.warnings)];
  const presented = [];
  const byKey = new Map();
  source.forEach(issue => {
    const item = presentManualScheduleIssue(issue, context);
    const key = causeKey(item);
    if (byKey.has(key)) mergePresented(byKey.get(key), item);
    else {
      byKey.set(key, item);
      presented.push(item);
    }
  });
  presented.sort((left, right) => priority(left) - priority(right) || left.title.localeCompare(right.title, 'pt-BR'));
  const errors = presented.filter(item => item.severity !== 'warning' && item.blocking !== false);
  const warnings = presented.filter(item => item.severity === 'warning' || item.blocking === false);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues: [...errors, ...warnings],
    primaryIssue: errors[0] || warnings[0] || null,
    technicalIssueCount: source.length
  };
}
