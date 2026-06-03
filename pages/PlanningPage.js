import { api } from '../shared/api.js';
import { CalendarTimeline } from '../shared/CalendarTimeline.js';

export function PlanningPage() {
  const page = document.createElement('section');
  page.className = 'stack';
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Planejamento</h1>
        <p>Simule prazos a partir da matriz de produtividade e salve a programacao.</p>
      </div>
    </div>
    <div class="panel">
      <form class="grid-form planning-form">
        <label>Material<input name="materialName" required /></label>
        <label>Codigo<input name="materialCode" /></label>
        <label>Quantidade<input name="plannedQty" type="number" step="0.001" required /></label>
        <label>Unidade<input name="plannedUnit" value="un" /></label>
        <label>Data inicial<input name="startDate" type="date" required /></label>
        <label>Maquina<input name="machineName" required /></label>
        <label>Pessoas<input name="peopleCount" type="number" min="1" required /></label>
        <label>Horas/dia<input name="hoursPerDay" type="number" step="0.5" value="8" /></label>
        <div class="form-actions">
          <button class="primary-button" name="simulate" type="submit">Simular planejamento</button>
          <button class="secondary-button" name="save" type="button" disabled>Salvar programacao</button>
          <button class="secondary-button" name="pdf" type="button" disabled>Gerar PDF</button>
        </div>
      </form>
    </div>
    <div class="summary-grid"></div>
    <div class="panel">
      <h2>Linha do tempo</h2>
      <div class="timeline-target"></div>
    </div>
  `;

  const form = page.querySelector('form');
  const saveButton = page.querySelector('[name="save"]');
  const pdfButton = page.querySelector('[name="pdf"]');
  const summaryGrid = page.querySelector('.summary-grid');
  const timelineTarget = page.querySelector('.timeline-target');
  let lastPayload = null;
  let savedPlan = null;

  timelineTarget.appendChild(CalendarTimeline([]));

  function payload() {
    const data = Object.fromEntries(new FormData(form));
    data.peopleCount = Number(data.peopleCount);
    data.plannedQty = Number(data.plannedQty);
    data.hoursPerDay = Number(data.hoursPerDay || 8);
    return data;
  }

  function renderSimulation(result) {
    const cards = [
      ['Material', result.summary.materialName],
      ['Quantidade total', `${result.summary.plannedQty} ${result.summary.plannedUnit}`],
      ['Maquina', result.summary.machineName],
      ['Pessoas', result.summary.peopleCount],
      ['Produtividade usada', result.summary.productivityUsed],
      ['Dias necessarios', result.summary.daysNeeded],
      ['Data inicial', result.summary.startDate],
      ['Data final estimada', result.summary.endDate]
    ];
    summaryGrid.innerHTML = cards.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
    timelineTarget.innerHTML = '';
    timelineTarget.appendChild(CalendarTimeline(result.days));
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      lastPayload = payload();
      const result = await api('/planning/simulate', { method: 'POST', body: lastPayload });
      renderSimulation(result);
      saveButton.disabled = false;
      savedPlan = null;
      pdfButton.disabled = true;
    } catch (error) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
    }
  });

  saveButton.addEventListener('click', async () => {
    try {
      savedPlan = await api('/planning/plans', { method: 'POST', body: lastPayload || payload() });
      pdfButton.disabled = false;
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: 'Programacao salva.' }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('planejamento:toast', { detail: error.message }));
    }
  });

  pdfButton.addEventListener('click', async () => {
    if (!savedPlan?.plan?.id) return;
    const blob = await api(`/planning/plans/${savedPlan.plan.id}/pdf`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `programacao-${savedPlan.plan.id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  });

  return page;
}
