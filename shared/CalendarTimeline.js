function addDays(date, days) {
  const copy = new Date(`${date}T00:00:00`);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function eachDate(startDate, endDate) {
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function formatDateLabel(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (!hours) return `${remainingMinutes}min`;
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

export function CalendarTimeline(days = [], operations = []) {
  const wrapper = document.createElement('section');
  wrapper.className = 'calendar-gantt';

  if (!days.length) {
    wrapper.innerHTML = '<div class="empty-state">Simule um planejamento para visualizar o calendário.</div>';
    return wrapper;
  }

  const datesFromDays = days.map(day => day.planned_date).filter(Boolean);
  const datesFromOperations = operations.flatMap(operation => [operation.startDate, operation.endDate]).filter(Boolean);
  const allKnownDates = [...datesFromDays, ...datesFromOperations].sort();
  const dates = eachDate(allKnownDates[0], allKnownDates[allKnownDates.length - 1]);
  const grouped = days.reduce((acc, day) => {
    acc[day.planned_date] ||= [];
    acc[day.planned_date].push(day);
    return acc;
  }, {});

  wrapper.innerHTML = `
    <div class="calendar-scroll">
      <div class="calendar-grid" style="--calendar-days: ${dates.length}">
        ${dates.map(date => `
          <div class="calendar-column">
            <div class="calendar-date">
              <strong>${formatDateLabel(date)}</strong>
              <span>${date}</span>
            </div>
            <div class="calendar-events">
              ${(grouped[date] || []).map(item => `
                <article class="production-card">
                  <strong>${item.material_name}</strong>
                  <span>${item.machine_name} &middot; ${item.people_count} pessoa${Number(item.people_count) === 1 ? '' : 's'}</span>
                  <b>${Number(item.planned_qty).toLocaleString('pt-BR')} ${item.planned_unit}</b>
                  ${item.daily_minutes ? `<small>${formatMinutes(item.daily_minutes)}</small>` : ''}
                </article>
              `).join('') || '<div class="calendar-empty-day"></div>'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  return wrapper;
}
