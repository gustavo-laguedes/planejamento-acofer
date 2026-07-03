const STATUS_CLASS_MAP = {
  programado: 'scheduled',
  pendente: 'scheduled',
  parcial: 'partial',
  'em andamento': 'partial',
  cumprido: 'done',
  concluido: 'done',
  excedido: 'exceeded',
  canceled: 'canceled',
  cancelled: 'canceled',
  cancelado: 'canceled',
  cancelada: 'canceled',
  'planejamento cancelado': 'canceled',
  antecipado: 'anticipated',
  planejado: 'planned',
  critico: 'critical',
  atencao: 'attention',
  'alerta de producao': 'production-alert',
  'meta nao batida': 'missed'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function statusPillClass(value, fallback = 'neutral') {
  return STATUS_CLASS_MAP[normalizeStatus(value)] || fallback;
}

export function StatusPill({
  label,
  value = label,
  className = 'status-pill',
  statusClass = statusPillClass(value),
  emptyLabel = 'Sem status'
} = {}) {
  const text = label || value || emptyLabel;
  return `<span class="${escapeHtml(`${className} ${statusClass}`.trim())}">${escapeHtml(text)}</span>`;
}

export function TrackingStatusPill(value, options = {}) {
  const label = value === 'Pendente' ? 'Programado' : value || options.emptyLabel || 'Sem status';
  return StatusPill({
    ...options,
    label,
    value: label,
    className: options.className || 'tracking-status-pill',
    statusClass: options.statusClass || statusPillClass(label)
  });
}

export function PlanningStatusPill(value, options = {}) {
  const statusClass = options.statusClass || (statusPillClass(value, '') || '');
  return StatusPill({
    ...options,
    label: options.label || value || 'Sem status',
    value,
    className: options.className || 'planning-status-pill',
    statusClass
  });
}

export function PcpStatusPill(status = {}, options = {}) {
  return StatusPill({
    ...options,
    label: status.label,
    value: status.key || status.label,
    className: options.className || 'pcp-status-pill',
    statusClass: options.statusClass || status.className || statusPillClass(status.label)
  });
}
