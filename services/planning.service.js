function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00`);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

export function buildPlan({ materialName, materialCode, machineName, peopleCount, plannedQty, plannedUnit, startDate, hoursPerDay }, matrixEntry) {
  if (!matrixEntry) {
    const error = new Error('Nenhuma produtividade ativa encontrada para o material, maquina e quantidade de pessoas.');
    error.status = 404;
    throw error;
  }

  const dailyMinutes = Math.max(Number(hoursPerDay || 8) * 60, 1);
  const qty = Number(plannedQty || 0);
  const outputQty = Number(matrixEntry.output_qty || 1);
  const timeMinutes = Number(matrixEntry.time_seconds || Number(matrixEntry.time_minutes || 1) * 60) / 60;
  const minutesPerUnit = timeMinutes / outputQty;
  const totalMinutes = Math.ceil(qty * minutesPerUnit);
  const daysNeeded = Math.max(Math.ceil(totalMinutes / dailyMinutes), 1);
  const qtyPerFullDay = dailyMinutes / minutesPerUnit;
  const days = [];
  let remaining = qty;

  for (let index = 0; index < daysNeeded; index += 1) {
    const plannedDate = addDays(startDate, index);
    const dayQty = index === daysNeeded - 1 ? remaining : Math.min(remaining, qtyPerFullDay);
    remaining = Math.max(remaining - dayQty, 0);
    days.push({
      planned_date: plannedDate,
      material_name: materialName,
      material_code: materialCode || null,
      machine_name: machineName,
      people_count: Number(peopleCount),
      planned_qty: Number(dayQty.toFixed(3)),
      planned_unit: plannedUnit || matrixEntry.output_unit || 'un'
    });
  }

  return {
    summary: {
      materialName,
      materialCode: materialCode || null,
      machineName,
      peopleCount: Number(peopleCount),
      plannedQty: qty,
      plannedUnit: plannedUnit || matrixEntry.output_unit || 'un',
      productivityUsed: `${matrixEntry.output_qty} ${matrixEntry.output_unit} / ${Math.round(timeMinutes * 60)} seg`,
      totalMinutes,
      daysNeeded,
      startDate,
      endDate: days[days.length - 1].planned_date
    },
    days
  };
}
