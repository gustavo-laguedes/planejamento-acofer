import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const storage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  setInterval: () => 0,
  clearInterval() {},
  addEventListener() {},
  location: { hostname: 'localhost' }
};
const { planningFlowNodeStockBalanceChecked, shouldUsePlanningStockBalance } = await import('../pages/PlanningPage.js');

assert.equal(shouldUsePlanningStockBalance(null, 3453), true, 'Utilizar saldo deve iniciar marcado quando houver estoque');
assert.equal(shouldUsePlanningStockBalance({ useStock: true }, 3453), true);
assert.equal(shouldUsePlanningStockBalance({ useStock: false }, 3453), false, 'a escolha manual de desmarcar deve ser respeitada');
assert.equal(shouldUsePlanningStockBalance(null, 0), false, 'sem estoque não há saldo que possa ser utilizado');

assert.equal(planningFlowNodeStockBalanceChecked({
  node: { stockUsedQty: 3453, forceStockOnly: false },
  checked: false,
  canUseStock: true
}), true, 'card compartilhado deve mostrar Utilizar saldo marcado quando o recálculo consumiu saldo');
assert.equal(planningFlowNodeStockBalanceChecked({
  node: { stockUsedQty: 0, forceStockOnly: false },
  checked: false,
  canUseStock: true
}), false);
assert.equal(planningFlowNodeStockBalanceChecked({
  node: { stockUsedQty: 3453, isFinalProduct: true },
  checked: false,
  canUseStock: true
}), false, 'produto final não deve oferecer saldo no fluxo produtivo');

const source = readFileSync(new URL('../pages/PlanningPage.js', import.meta.url), 'utf8');
assert.match(source, /applyAcceptedManualSimulation\('Recalculando produção\.\.\.', snapshot\)/);
assert.match(source, /checkbox\.disabled = true/);
assert.match(source, /restoreDraftPlanningState\(snapshot\)/);
assert.doesNotMatch(source, /downstreamStockOnlyCheckboxes/);

console.log('planningStockBalanceToggle.test.js: ok');
