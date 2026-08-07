import assert from 'node:assert/strict';
import {
  formatDuration,
  formatHourDuration,
  minutesToTime,
  timeToMinutes
} from '../shared/planning-presentation/planningTimeFormatters.js';

assert.equal(formatDuration(0), '0 min');
assert.equal(formatDuration(1), '1 min');
assert.equal(formatDuration(59), '59 min');
assert.equal(formatDuration(60), '1h');
assert.equal(formatDuration(61), '1h 01min');
assert.equal(formatDuration(125), '2h 05min');
assert.equal(formatDuration(''), '0 min');
assert.equal(formatDuration(null), '0 min');
assert.equal(formatDuration(undefined), '0 min');
assert.equal(formatDuration(-15), '0 min');
assert.equal(formatDuration(90.4), '1h 30min');
assert.equal(formatDuration(90.5), '1h 31min');

assert.equal(formatHourDuration(0), '00:00 h/dia');
assert.equal(formatHourDuration(0.5), '00:30 h/dia');
assert.equal(formatHourDuration(1), '01:00 h/dia');
assert.equal(formatHourDuration(8.8), '08:48 h/dia');
assert.equal(formatHourDuration(12.25), '12:15 h/dia');
assert.equal(formatHourDuration(1.333), '01:20 h/dia');
assert.equal(formatHourDuration(null), '00:00 h/dia');
assert.equal(formatHourDuration(undefined), '00:00 h/dia');
assert.equal(formatHourDuration(-2), '00:00 h/dia');

assert.equal(minutesToTime(0), '00:00');
assert.equal(minutesToTime(1), '00:01');
assert.equal(minutesToTime(59), '00:59');
assert.equal(minutesToTime(60), '01:00');
assert.equal(minutesToTime(61), '01:01');
assert.equal(minutesToTime(12 * 60 + 30), '12:30');
assert.equal(minutesToTime(23 * 60 + 59), '23:59');
assert.equal(minutesToTime(24 * 60), '00:00');
assert.equal(minutesToTime(25 * 60 + 1), '01:01');
assert.equal(minutesToTime(-1), '23:59');
assert.equal(minutesToTime(-60), '23:00');
assert.equal(minutesToTime(90.4), '01:30');
assert.equal(minutesToTime(90.5), '01:31');
assert.equal(minutesToTime(null), '00:00');
assert.equal(minutesToTime(undefined), 'NaN:NaN');
assert.equal(minutesToTime('invalido'), 'NaN:NaN');

assert.equal(timeToMinutes('00:00'), 0);
assert.equal(timeToMinutes('00:01'), 1);
assert.equal(timeToMinutes('01:00'), 60);
assert.equal(timeToMinutes('07:00'), 420);
assert.equal(timeToMinutes('12:30'), 750);
assert.equal(timeToMinutes('17:00'), 1020);
assert.equal(timeToMinutes('23:59'), 1439);
assert.equal(timeToMinutes(''), 0);
assert.equal(timeToMinutes('invalido'), 0);
assert.equal(timeToMinutes(null), 0);
assert.equal(timeToMinutes(undefined), 0);
assert.equal(timeToMinutes('24:00'), 1440);
assert.equal(timeToMinutes('25:30'), 1530);

console.log('planningTimeFormatters.test.js ok');
