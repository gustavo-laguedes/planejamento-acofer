function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function SummaryCard({ label, labelHtml = '', value, detail = '', className = '' } = {}) {
  return `
    <article class="${escapeHtml(`metric-card ${className}`.trim())}">
      <span>${labelHtml || escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
    </article>
  `;
}

export function SummaryCards(cards = []) {
  return cards.map(card => SummaryCard(card)).join('');
}
