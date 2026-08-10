const PREFERRED_MACHINE_ORDER = [
  'trefila',
  'ec125',
  'ec60',
  'aco8',
  'focus8',
  'mt200',
  'mt150',
  'mt100'
];

const PREFERRED_MACHINE_POSITIONS = new Map(
  PREFERRED_MACHINE_ORDER.map((name, index) => [name, index])
);

export function normalizePlanningMachineName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

export function comparePlanningMachineOrder(left, right) {
  const machineName = machine => String(
    machine?.machineName
      ?? machine?.name
      ?? machine?.machineId
      ?? machine?.id
      ?? ''
  );
  const leftPosition = PREFERRED_MACHINE_POSITIONS.get(
    normalizePlanningMachineName(machineName(left))
  ) ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = PREFERRED_MACHINE_POSITIONS.get(
    normalizePlanningMachineName(machineName(right))
  ) ?? Number.MAX_SAFE_INTEGER;
  return leftPosition - rightPosition;
}
