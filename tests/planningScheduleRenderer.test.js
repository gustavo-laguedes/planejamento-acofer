import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createPlanningScheduleRendererHost,
  normalizePlanningScheduleRenderer,
  PLANNING_SCHEDULE_RENDERERS,
  resolvePlanningScheduleRenderer
} from '../shared/planning-schedule-view/planningScheduleRenderer.js';
import {
  createProductionCalendarV2Renderer
} from '../shared/planning-schedule-view/productionCalendarV2.renderer.js';

assert.equal(normalizePlanningScheduleRenderer('production-calendar-v2'), 'auto');
assert.equal(normalizePlanningScheduleRenderer('gantt-aps'), 'gantt-aps');
assert.equal(normalizePlanningScheduleRenderer('invalid'), 'auto');
assert.equal(resolvePlanningScheduleRenderer('production-calendar-v2'), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer('auto'), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer(undefined), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer('auto', { autoPolicy: () => 'gantt-aps' }), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer('auto', { autoPolicy: () => 'production-calendar-v2' }), 'gantt-aps');

function lifecycle(name, events, { failMount = false, failUpdate = false } = {}) {
  return {
    mount() {
      events.push(`${name}:mount`);
      if (failMount) throw new Error(`${name} mount failed`);
    },
    update() {
      events.push(`${name}:update`);
      if (failUpdate) throw new Error(`${name} update failed`);
    },
    focusAllocation(allocationId) {
      events.push(`${name}:focus:${allocationId}`);
      return true;
    },
    getViewportState() {
      return { renderer: name };
    },
    destroy() {
      events.push(`${name}:destroy`);
    }
  };
}

function assertThrowsMessage(callback, expectedMessage) {
  let thrown = null;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `esperava erro: ${expectedMessage}`);
  assert.equal(thrown.message, expectedMessage);
  return thrown;
}

{
  const host = createPlanningScheduleRendererHost();
  assert.equal(host.focusAllocation('allocation-before-mount'), false, 'focus antes de mount deve ser seguro');
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events),
      'production-calendar-v2': () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] });
  host.update({ tasks: [{ id: 'allocation-default' }] });
  assert.equal(host.activeRendererId, 'gantt-aps');
  assert.deepEqual(events, ['gantt:mount', 'gantt:update']);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events),
      'production-calendar-v2': () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' });
  assert.equal(host.focusAllocation('allocation-after-mount'), true);
  assert.deepEqual(events, ['gantt:mount', 'gantt:focus:allocation-after-mount']);
  host.mount({}, { tasks: [] }, { renderer: 'production-calendar-v2' });
  assert.equal(host.focusAllocation('allocation-v2'), true);
  assert.deepEqual(events, [
    'gantt:mount',
    'gantt:focus:allocation-after-mount',
    'gantt:destroy',
    'gantt:mount',
    'gantt:focus:allocation-v2'
  ]);
  host.destroy();
  assert.equal(host.focusAllocation('allocation-after-destroy'), false);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => ({
        mount() { events.push('gantt:mount'); },
        update() { events.push('gantt:update'); },
        getViewportState() { return { renderer: 'gantt' }; },
        destroy() { events.push('gantt:destroy'); }
      }),
      'production-calendar-v2': () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' });
  assert.equal(host.focusAllocation('allocation-without-focus'), false, 'renderer sem focusAllocation nao deve quebrar o host');
  assert.deepEqual(events, ['gantt:mount']);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events, { failMount: true }),
      'production-calendar-v2': () => lifecycle('v2', events)
    }
  });
  const error = assertThrowsMessage(
    () => host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' }),
    'gantt mount failed'
  );
  assert.equal(error.cause, undefined);
  assert.deepEqual(events, ['gantt:mount', 'gantt:destroy']);
  assert.equal(host.activeRendererId, null);
  assert.equal(host.focusAllocation('allocation-1'), false);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events, { failUpdate: true }),
      'production-calendar-v2': () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' });
  assertThrowsMessage(
    () => host.update({ tasks: [{ id: 'allocation-1' }] }),
    'gantt update failed'
  );
  assert.deepEqual(events, ['gantt:mount', 'gantt:update', 'gantt:destroy']);
  assert.equal(host.activeRendererId, null);
}

{
  const events = [];
  const lifecycleErrors = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events, { failMount: true }),
      'production-calendar-v2': () => lifecycle('v2', events)
    },
    onLifecycleError: event => lifecycleErrors.push({
      message: event.error.message,
      rendererId: event.rendererId,
      phase: event.phase
    })
  });
  assertThrowsMessage(
    () => host.mount({}, { tasks: [] }, { renderer: 'auto' }),
    'gantt mount failed'
  );
  assert.deepEqual(events, ['gantt:mount', 'gantt:destroy']);
  assert.deepEqual(lifecycleErrors, [{ message: 'gantt mount failed', rendererId: 'gantt-aps', phase: 'mount' }]);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events),
      'production-calendar-v2': () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] }, { renderer: 'production-calendar-v2' });
  host.update({ tasks: [{ id: 'allocation-v2' }] });
  assert.equal(host.activeRendererId, 'gantt-aps');
  assert.deepEqual(events, ['gantt:mount', 'gantt:update']);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events, { failMount: true }),
      'production-calendar-v2': () => lifecycle('v2', events)
    },
    fallbackRenderer: 'production-calendar-v2'
  });
  assertThrowsMessage(
    () => host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' }),
    'gantt mount failed'
  );
  assert.deepEqual(events, ['gantt:mount', 'gantt:destroy']);
}

{
  const events = [];
  const classes = new Set();
  const card = {
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value)
    },
    closest: () => null,
    scrollIntoView: () => events.push('card:scroll'),
    focus: () => events.push('card:focus')
  };
  const root = {
    dataset: { zoom: '1' },
    querySelector: selector => {
      events.push(`query:${selector}`);
      return selector.includes('allocation-1') ? card : null;
    },
    querySelectorAll: () => [],
    remove: () => events.push('root:remove'),
    __productionCalendarDestroy: () => events.push('root:destroy')
  };
  const renderer = createProductionCalendarV2Renderer({
    renderSnapshot: (_container, snapshot) => {
      events.push(`render:${snapshot.allocations[0].allocationId}`);
      return root;
    }
  });
  renderer.mount({}, {
    calendar: { days: [] },
    resources: [],
    tasks: [{
      id: 'allocation-1',
      resourceId: 'machine-1',
      start: { date: '2026-07-24', time: '07:00' },
      end: { date: '2026-07-24', time: '08:00' }
    }],
    projections: {},
    permissions: {},
    metadata: {}
  });
  assert.equal(renderer.focusAllocation('allocation-1'), true);
  assert.ok(classes.has('is-flow-focused'));
  renderer.destroy();
  assert.ok(events.indexOf('root:destroy') < events.indexOf('root:remove'));
}

const pageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const analysisSource = readFileSync(new URL('../pages/AnalysisPage.js', import.meta.url), 'utf8');
const calendarTimelineSource = readFileSync(new URL('../shared/CalendarTimeline.js', import.meta.url), 'utf8');
const productionCalendarV2RendererSource = readFileSync(new URL('../shared/planning-schedule-view/productionCalendarV2.renderer.js', import.meta.url), 'utf8');
assert.match(pageSource, /function focusFlowNodeInSchedule\(flowNode\)/);
assert.match(pageSource, /focusPlanningFlowAllocation\(\{[\s\S]*rendererHost:\s*planningScheduleRendererHost/);
assert.doesNotMatch(pageSource, /production-calendar-card\[data-allocation-id/, 'foco externo nao deve conhecer DOM do renderer');
assert.doesNotMatch(pageSource, /gantt-aps__bar/, 'foco externo nao deve conhecer DOM do Gantt APS');
assert.doesNotMatch(pageSource, /USE_PRODUCTION_CALENDAR_V2/);
assert.doesNotMatch(pageSource, /CalendarTimeline/);
assert.doesNotMatch(pageSource, /globalThis\.PLANNING_SCHEDULE_RENDERER/);
assert.doesNotMatch(pageSource, /'production-calendar-v2':\s*\(\)\s*=>\s*createProductionCalendarV2Renderer/);
assert.doesNotMatch(pageSource, /createProductionCalendarV2Renderer/);
assert.doesNotMatch(pageSource, /rollback para o Calendário V2/);
assert.match(
  pageSource,
  /'gantt-aps':\s*\(\)\s*=>\s*createGanttApsRenderer\(\{\s*onRequestMove:\s*handleProductionCalendarMoveRequest,\s*onRequestEdit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation\),\s*onRequestSplit:\s*allocation\s*=>\s*openProductionCalendarAllocationEditor\(allocation,\s*\{\s*startSplit:\s*true\s*\}\)/
);
assert.match(pageSource, /renderer:\s*'gantt-aps'/);
const indexSource = readFileSync(new URL('../shared/planning-schedule-view/index.js', import.meta.url), 'utf8');
assert.doesNotMatch(indexSource, /createProductionCalendarV2Renderer/);
assert.match(indexSource, /createGanttApsRenderer/);
assert.match(analysisSource, /import\s*\{\s*CalendarTimeline,\s*productionCalendarColor\s*\}\s*from\s*['"]\.\.\/shared\/CalendarTimeline\.js['"]/);
assert.match(analysisSource, /CalendarTimeline\(detail\.days\s*\|\|\s*\[\],\s*detail\.operations\s*\|\|\s*\[\],\s*summary\)/);
assert.match(analysisSource, /CalendarTimeline\(days,\s*currentEvents\.map\(commercialTimelineOperation\),\s*\{/);
assert.match(calendarTimelineSource, /export function CalendarTimeline\(days\s*=\s*\[\],\s*operations\s*=\s*\[\],\s*config\s*=\s*\{\}\)/);
assert.match(productionCalendarV2RendererSource, /export function createProductionCalendarV2Renderer/);

console.log('planningScheduleRenderer.test.js ok');
