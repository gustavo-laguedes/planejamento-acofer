import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  addProductionCalendarDays,
  extendProductionCalendarDayRange,
  getProductionCalendarProductionLimitDate,
  isProductionCalendarNonWorkingDay
} from '../shared/production-calendar/productionCalendar.utils.js';

let visibleEndDate = '2026-07-21';
visibleEndDate = addProductionCalendarDays(visibleEndDate, 7);
assert.equal(visibleEndDate, '2026-07-28');
visibleEndDate = addProductionCalendarDays(visibleEndDate, 15);
assert.equal(visibleEndDate, '2026-08-12');
visibleEndDate = addProductionCalendarDays(visibleEndDate, 30);
assert.equal(visibleEndDate, '2026-09-11', 'expansao por data deve ser cumulativa');
assert.equal(getProductionCalendarProductionLimitDate([
  { date: '2026-07-21' },
  { date: '2026-07-28' }
]), '2026-07-28', 'limite da producao deve vir das allocations aceitas atuais');

const extendedDays = extendProductionCalendarDayRange([{ date: '2026-09-05' }], '2026-09-08');
assert.deepEqual(extendedDays.map(day => day.date), [
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
  '2026-09-08'
]);
assert.equal(isProductionCalendarNonWorkingDay(extendedDays[2]), true, 'feriado gerado deve manter regra de dia nao util');

const planningSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const ganttSource = readFileSync(new URL('../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js', import.meta.url), 'utf8');
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarState.js', import.meta.url)), false);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarToolbar.js', import.meta.url)), false);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarGrid.js', import.meta.url)), false);
assert.match(planningSource, /openProductionCalendarExclusiveView/);
assert.match(planningSource, /function expandProductionCalendarHorizon\(\{ days \} = \{\}\)/);
assert.match(planningSource, /visibleEndDate:\s*addProductionCalendarDays\(currentEndDate,\s*dayCount\)/);
assert.match(planningSource, /const validationDaysByDate = new Map/);
assert.match(planningSource, /fillProductionCalendarDayRange\(baseDays\)\.map/);
assert.match(planningSource, /refreshTimelineOnly\(\)/);
assert.match(planningSource, /planningScheduleRendererHost\?\.focusAllocation\?\.\(createdAllocationId\)/);
assert.match(ganttSource, /\[7,\s*15,\s*30\]\.forEach\(dayCount/);
assert.match(ganttSource, /onRequestExpandHorizon\(\{\s*days:\s*Number/);
assert.doesNotMatch(planningSource, /\bProductionCalendar\(\{/);
assert.doesNotMatch(planningSource, /requestFullscreen|exitFullscreen/);

console.log('productionCalendarHorizon.test.js: ok');
