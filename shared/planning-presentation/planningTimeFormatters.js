export function formatDuration(minutes) {
  const total = Math.max(Math.round(Number(minutes || 0)), 0);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${String(mins).padStart(2, '0')}min` : `${hours}h`;
}

export function formatHourDuration(value) {
  const totalMinutes = Math.max(Math.round(Number(value || 0) * 60), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} h/dia`;
}

export function minutesToTime(minutes) {
  const normalized = ((Math.round(minutes) % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function timeToMinutes(value) {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}
