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

assert.equal(normalizePlanningScheduleRenderer('production-calendar-v2'), 'production-calendar-v2');
assert.equal(normalizePlanningScheduleRenderer('gantt-aps'), 'gantt-aps');
assert.equal(normalizePlanningScheduleRenderer('invalid'), 'auto');
assert.equal(resolvePlanningScheduleRenderer('auto'), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer(undefined), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer('auto', { autoPolicy: () => 'gantt-aps' }), 'gantt-aps');
assert.equal(resolvePlanningScheduleRenderer('auto', { autoPolicy: () => 'production-calendar-v2' }), 'production-calendar-v2');

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

{
  const host = createPlanningScheduleRendererHost();
  assert.equal(host.focusAllocation('allocation-before-mount'), false, 'focus antes de mount deve ser seguro');
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events),
      [PLANNING_SCHEDULE_RENDERERS.PRODUCTION_CALENDAR_V2]: () => lifecycle('v2', events)
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
    'v2:mount',
    'v2:focus:allocation-v2'
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
      [PLANNING_SCHEDULE_RENDERERS.PRODUCTION_CALENDAR_V2]: () => lifecycle('v2', events)
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
      [PLANNING_SCHEDULE_RENDERERS.PRODUCTION_CALENDAR_V2]: () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' });
  assert.deepEqual(events, ['gantt:mount', 'gantt:destroy', 'v2:mount']);
  assert.equal(host.activeRendererId, 'production-calendar-v2');
  assert.equal(host.focusAllocation('allocation-1'), true);
}

{
  const events = [];
  const host = createPlanningScheduleRendererHost({
    factories: {
      [PLANNING_SCHEDULE_RENDERERS.GANTT_APS]: () => lifecycle('gantt', events, { failUpdate: true }),
      [PLANNING_SCHEDULE_RENDERERS.PRODUCTION_CALENDAR_V2]: () => lifecycle('v2', events)
    }
  });
  host.mount({}, { tasks: [] }, { renderer: 'gantt-aps' });
  host.update({ tasks: [{ id: 'allocation-1' }] });
  assert.deepEqual(events, ['gantt:mount', 'gantt:update', 'gantt:destroy', 'v2:mount']);
  assert.equal(host.activeRendererId, 'production-calendar-v2');
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
assert.match(pageSource, /function focusFlowNodeInSchedule\(flowNode\)/);
assert.match(pageSource, /focusPlanningFlowAllocation\(\{[\s\S]*rendererHost:\s*planningScheduleRendererHost/);
assert.doesNotMatch(pageSource, /production-calendar-card\[data-allocation-id/, 'foco externo nao deve conhecer DOM do renderer');
assert.doesNotMatch(pageSource, /gantt-aps__bar/, 'foco externo nao deve conhecer DOM do Gantt APS');
assert.match(pageSource, /globalThis\.PLANNING_SCHEDULE_RENDERER\s*\|\|\s*'auto'/);
assert.match(pageSource, /'production-calendar-v2':\s*\(\)\s*=>\s*createProductionCalendarV2Renderer/);
assert.match(
  pageSource,
  /'gantt-aps':\s*\(\)\s*=>\s*createGanttApsRenderer\(\{\s*onRequestMove:\s*handleProductionCalendarMoveRequest\s*\}\)/
);

console.log('planningScheduleRenderer.test.js ok');
