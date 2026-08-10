function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

export function getPlanningAllocationStage(allocation) {
  const stage = Number(allocation?.productionStage);
  return Number.isInteger(stage) && stage > 0 ? stage : null;
}

export function getPlanningAllocationMemberships(allocation) {
  return (Array.isArray(allocation?.productionMemberships) ? allocation.productionMemberships : [])
    .filter(membership => membership && membership.productionId)
    .slice()
    .sort((left, right) => (
      Number(left.productionIndex ?? left.productionOrder ?? Number.MAX_SAFE_INTEGER)
        - Number(right.productionIndex ?? right.productionOrder ?? Number.MAX_SAFE_INTEGER)
      || String(left.productionId).localeCompare(String(right.productionId))
    ));
}

export function getPlanningAllocationMembershipDisplayNumber(membership) {
  const productionIndex = firstExisting(membership?.productionIndex);
  if (productionIndex !== undefined) {
    const numericIndex = Number(productionIndex);
    return Number.isFinite(numericIndex) ? numericIndex + 1 : productionIndex;
  }
  const productionOrder = firstExisting(membership?.productionOrder);
  if (productionOrder !== undefined) {
    const numericOrder = Number(productionOrder);
    return Number.isFinite(numericOrder) ? numericOrder + 1 : productionOrder;
  }
  return '';
}
