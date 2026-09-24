import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildProductionCalendarDayProductivity,
  buildProductionCalendarDayPresentation,
  fillProductionCalendarDayRange
} from '../shared/production-calendar/productionCalendar.utils.js';
import { resolveManualScheduleResourceByDate } from '../services/manualScheduleResourceValidation.service.js';

const shifts = [
  { shiftId: 'morning', label: 'Turno 1', teamAvailable: 6 },
  { shiftId: 'afternoon', label: 'Turno 2', teamAvailable: 3 }
];
const resource = {
  shifts: {
    morning: { peakPeople: 4, availablePeople: 6, overrideUsed: false },
    afternoon: { peakPeople: 2, availablePeople: 3, overrideUsed: false }
  }
};

const saturday = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-18' },
  resource,
  shifts,
  manualWorkDates: []
});
assert.equal(saturday.isNonWorkingDay, true);
assert.equal(saturday.isManuallyEnabled, false);
assert.equal(saturday.team.peakPeople, 4);
assert.equal(saturday.team.availablePeople, 6);
assert.deepEqual(saturday.team.shifts.map(shift => [shift.label, shift.peakPeople, shift.availablePeople]), [
  ['Turno 1', 4, 6],
  ['Turno 2', 2, 3]
]);

const released = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-18' },
  resource,
  shifts,
  manualWorkDates: ['2026-07-18']
});
assert.equal(released.isManuallyEnabled, true);
assert.equal(released.isWorkingDay, true);
assert.equal(released.isNonWorkingDay, false, 'sabado liberado nao pode manter hachura de dia nao util');
assert.equal(buildProductionCalendarDayPresentation({ day: { date: '2026-07-20', isWorkingDay: false }, resource, shifts }).isNonWorkingDay, true);
assert.equal(buildProductionCalendarDayPresentation({ day: { date: '2026-07-20' }, resource, shifts }).isNonWorkingDay, false);

const overridden = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' },
  resource: { shifts: { morning: { peakPeople: 4, availablePeople: 5 } } },
  shifts,
  dailyTeamOverrides: { '2026-07-20': { morning: 5 } }
});
assert.equal(overridden.team.availablePeople, 5);
assert.equal(overridden.team.state, 'override');
assert.equal(buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' },
  resource: { shifts: { morning: { peakPeople: 6, availablePeople: 6 } } },
  shifts
}).team.state, 'attention');
assert.equal(buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' },
  resource: { shifts: { morning: { peakPeople: 7, availablePeople: 6 } } },
  shifts
}).team.state, 'error');

const allocationResource = resolveManualScheduleResourceByDate({
  allocations: [{
    allocationId: 'eq45',
    machineId: 'mt200',
    date: '2026-07-20',
    startTime: '07:00',
    endTime: '12:00',
    peopleCount: 2
  }],
  shifts: [{ ...shifts[0], startTime: '07:00', endTime: '15:00' }]
});
const allocationDay = buildProductionCalendarDayPresentation({
  day: { date: '2026-07-20' },
  resource: allocationResource['2026-07-20'],
  shifts: [{ ...shifts[0], startTime: '07:00', endTime: '15:00' }]
});
assert.equal(allocationDay.team.peakPeople, 2, 'uso da pilula deve ser derivado das allocations sem validacao persistida');
assert.equal(allocationDay.team.availablePeople, 6);
const dailyTeamResource = resolveManualScheduleResourceByDate({
  allocations: [
    {
      allocationId: 'long42',
      machineId: 'ec125',
      date: '2026-09-14',
      startTime: '14:12',
      endTime: '15:48',
      peopleCount: 1,
      capacityPercent: 100
    },
    {
      allocationId: 'q113',
      machineId: 'mt200',
      date: '2026-09-14',
      startTime: '07:00',
      endTime: '12:12',
      peopleCount: 3,
      capacityPercent: 59.09
    }
  ],
  shifts: [{ ...shifts[0], startTime: '07:00', endTime: '15:48', teamAvailable: 3 }]
});
const dailyTeamDay = buildProductionCalendarDayPresentation({
  day: { date: '2026-09-14' },
  resource: dailyTeamResource['2026-09-14'],
  shifts: [{ ...shifts[0], startTime: '07:00', endTime: '15:48', teamAvailable: 3 }]
});
assert.equal(dailyTeamDay.team.peakPeople, 4, 'header deve representar pico temporal de peopleCount inteiro');
assert.equal(dailyTeamDay.team.availablePeople, 3);
assert.equal(dailyTeamDay.team.state, 'error');
const productivity = buildProductionCalendarDayProductivity({
  day: allocationDay,
  allocations: [
    { date: '2026-07-20', peopleCount: 3, capacityPercent: 60 },
    { date: '2026-07-20', peopleCount: 2, capacityPercent: 50 },
    { date: '2026-07-21', peopleCount: 6, capacityPercent: 100 }
  ]
});
assert.deepEqual(productivity, { productivePeople: 5, availablePeople: 6, percent: 83.33 });
const sequentialProductivity = buildProductionCalendarDayProductivity({
  day: { date: '2026-07-20', team: { availablePeople: 3 } },
  allocations: [
    { date: '2026-07-20', startTime: '07:00', endTime: '10:31', peopleCount: 1, capacityPercent: 40 },
    { date: '2026-07-20', startTime: '10:31', endTime: '14:02', peopleCount: 3, capacityPercent: 40 }
  ]
});
assert.deepEqual(sequentialProductivity, { productivePeople: 3, availablePeople: 3, percent: 100 });

const filledDays = fillProductionCalendarDayRange([
  { date: '2026-07-17' },
  { date: '2026-07-20' }
]).map(day => buildProductionCalendarDayPresentation({
  day,
  resource,
  shifts,
  manualWorkDates: ['2026-07-18']
}));
assert.deepEqual(filledDays.slice(1, 3).map(day => [day.date, day.isNonWorkingDay, day.isManuallyEnabled]), [
  ['2026-07-18', false, true],
  ['2026-07-19', true, false]
]);

assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendarGrid.js', import.meta.url)), false);
assert.equal(existsSync(new URL('../shared/production-calendar/ProductionCalendar.js', import.meta.url)), false);
const ganttSource = readFileSync(new URL('../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js', import.meta.url), 'utf8');
assert.match(ganttSource, /onRequestOpenDay/);
assert.match(ganttSource, /onRequestToggleManualWorkDate/);
assert.match(ganttSource, /onRequestEditDailyTeam/);
assert.match(ganttSource, /gantt-aps__day-team/);
assert.match(ganttSource, /gantt-aps__day-productivity/);
assert.match(ganttSource, /gantt-aps__day-stock/);

console.log('productionCalendarDayHeader.test.js: ok');
