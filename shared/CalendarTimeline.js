export function CalendarTimeline(days = []) {
  const wrapper = document.createElement('section');
  wrapper.className = 'calendar';
  const grouped = days.reduce((acc, day) => {
    acc[day.planned_date] ||= [];
    acc[day.planned_date].push(day);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort();
  if (!dates.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar a semana.</div>';
    return wrapper;
  }

  wrapper.innerHTML = dates.map(date => `
    <div class="calendar-day">
      <div class="calendar-date">${date}</div>
      <div class="calendar-list">
        ${grouped[date].map(item => `
          <article class="production-card">
            <strong>${item.material_name}</strong>
            <span>${item.machine_name} · ${item.people_count} pessoas</span>
            <b>${Number(item.planned_qty).toLocaleString('pt-BR')} ${item.planned_unit}</b>
          </article>
        `).join('')}
      </div>
    </div>
  `).join('');

  return wrapper;
}
