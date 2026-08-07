import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getProductionDisplayColor,
  getProductionDisplayFallbackColor,
  getProductionDisplayTheme
} from '../shared/production-calendar/productionDisplayColor.js';
import {
  getProductionCalendarAllocationColor
} from '../shared/production-calendar/ProductionCalendarCard.js';
import {
  ganttApsProductionVisuals
} from '../shared/planning-schedule-view/gantt-aps/ganttAps.renderer.js';

const persistedColor = '#D9EEF7';
const displayColor = getProductionDisplayColor(persistedColor, { productionIndex: 0 });
assert.equal(persistedColor, '#D9EEF7', 'helper visual nao pode modificar a cor persistida');
assert.match(displayColor, /^#[0-9A-F]{6}$/);
assert.notEqual(displayColor, persistedColor, 'cor lavada deve ganhar saturacao apenas na apresentacao');
assert.equal(
  getProductionDisplayColor(persistedColor, { productionIndex: 0 }),
  displayColor,
  'identidade visual deve ser deterministica'
);

const fallbackColors = [0, 1, 2, 3, 4, 5].map(productionIndex => (
  getProductionDisplayFallbackColor({ productionIndex })
));
assert.equal(new Set(fallbackColors).size, fallbackColors.length);
assert.notEqual(
  getProductionDisplayColor('#777777', { productionIndex: 2 }),
  '#777777',
  'cor acromatica deve usar fallback vivo e distinguivel'
);

const displayTheme = getProductionDisplayTheme(persistedColor, { productionIndex: 0 });
assert.equal(displayTheme.base, displayColor);
assert.equal(displayTheme.border, displayColor);
assert.notEqual(displayTheme.soft, displayColor);
assert.notEqual(displayTheme.card, displayColor);

const allocation = {
  productionId: 'production-1',
  productionIndex: 0,
  productionColor: persistedColor
};
assert.equal(getProductionCalendarAllocationColor(allocation).accent, displayColor);
assert.equal(ganttApsProductionVisuals(allocation)[0].color, displayColor);

const planningPageSource = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
const planningFlowViewSource = readFileSync(
  new URL('../shared/planning-presentation/planningFlowView.js', import.meta.url),
  'utf8'
);
const cardSource = readFileSync(
  new URL('../shared/production-calendar/ProductionCalendarCard.js', import.meta.url),
  'utf8'
);
assert.match(planningPageSource, /getProductionDisplayColor,[\s\S]*getProductionDisplayTheme,[\s\S]*PRODUCTION_DISPLAY_PALETTE/);
assert.match(
  planningPageSource,
  /function productionTheme[\s\S]*getProductionDisplayTheme\(canonicalColor,\s*\{\s*productionIndex:\s*index\s*\}\)/
);
assert.match(
  planningPageSource,
  /production-flow-legend-item[\s\S]*productionThemeStyle\(productionIndex,\s*color\)/
);
assert.match(
  planningPageSource,
  /productionThemeStyle/
);
assert.match(
  planningPageSource,
  /productionCardSegmentStyle/
);
assert.match(
  planningPageSource,
  /productionSegmentStyle/
);
assert.match(
  planningFlowViewSource,
  /production-flow-node[\s\S]*productionThemeStyle\(productionIndex,[\s\S]*productionCardSegmentStyle\(productions\)/
);
assert.match(
  planningPageSource,
  /const color = productionTheme\(productionIndex,\s*edge\.color\)\.border/
);
assert.match(cardSource, /getProductionDisplayColor\(explicitColor,/);
assert.doesNotMatch(cardSource, /CARD_PALETTE/);
assert.doesNotMatch(planningPageSource, /const PRODUCTION_(?:COLOR_PALETTE|THEMES|THEME_SEQUENCE)/);

console.log('productionDisplayColor.test.js: ok');
