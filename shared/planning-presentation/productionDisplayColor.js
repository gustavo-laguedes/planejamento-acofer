const PRODUCTION_DISPLAY_PALETTE = Object.freeze([
  '#1D4ED8', // 01 - azul escuro
  '#F97316', // 02 - laranja
  '#16A34A', // 03 - verde
  '#7E22CE', // 04 - roxo
  '#DC2626', // 05 - vermelho
  '#06B6D4', // 06 - ciano
  '#D97706', // 07 - dourado
  '#EC4899', // 08 - rosa
  '#0F766E', // 09 - teal
  '#FB7185', // 10 - coral
  '#4338CA', // 11 - índigo
  '#65A30D', // 12 - verde-limão
  '#9F1239', // 13 - vinho
  '#38BDF8', // 14 - azul claro
  '#9333EA', // 15 - violeta
  '#F59E0B', // 16 - âmbar
  '#059669', // 17 - esmeralda
  '#DB2777', // 18 - pink
  '#0E7490', // 19 - azul petróleo
  '#F87171'  // 20 - vermelho claro
]);

function firstExisting(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '');
}

function expandedHex(value) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!match) return null;
  return match[1].length === 3
    ? match[1].split('').map(character => character.repeat(2)).join('')
    : match[1];
}

function hashString(value) {
  return String(value || '').split('').reduce((hash, character) => (
    ((hash << 5) - hash + character.charCodeAt(0)) | 0
  ), 0);
}

function fallbackPaletteIndex({ productionIndex, productionId, identity } = {}) {
  const numericIndex = Number(productionIndex);
  if (
    productionIndex !== null
    && productionIndex !== undefined
    && productionIndex !== ''
    && Number.isFinite(numericIndex)
  ) return Math.abs(Math.trunc(numericIndex)) % PRODUCTION_DISPLAY_PALETTE.length;
  return Math.abs(hashString(productionId ?? identity)) % PRODUCTION_DISPLAY_PALETTE.length;
}

function rgbToHsl(red, green, blue) {
  const channels = [red, green, blue].map(channel => channel / 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  if (!delta) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
  let hue = maximum === channels[0]
    ? ((channels[1] - channels[2]) / delta) % 6
    : maximum === channels[1]
      ? ((channels[2] - channels[0]) / delta) + 2
      : ((channels[0] - channels[1]) / delta) + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, saturation, lightness };
}

function hslToHex(hue, saturation, lightness) {
  const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const segment = hue / 60;
  const component = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] = segment < 1 ? [chroma, component, 0]
    : segment < 2 ? [component, chroma, 0]
      : segment < 3 ? [0, chroma, component]
        : segment < 4 ? [0, component, chroma]
          : segment < 5 ? [component, 0, chroma]
            : [chroma, 0, component];
  const offset = lightness - (chroma / 2);
  return `#${[red, green, blue]
    .map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function stripDailyOperationSuffix(value) {
  return String(value || '').replace(/:day-\d+$/i, '');
}

export function getProductionDisplayFallbackColor(options = {}) {
  return PRODUCTION_DISPLAY_PALETTE[fallbackPaletteIndex(options)];
}

export function getProductionDisplayColor(value, options = {}) {
  const fallback = expandedHex(options.fallbackColor)
    ? String(options.fallbackColor).toUpperCase()
    : getProductionDisplayFallbackColor(options);
  const hex = expandedHex(value);
  if (!hex) return fallback;
  const [red, green, blue] = [0, 2, 4]
    .map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const hsl = rgbToHsl(red, green, blue);
  if (hsl.saturation < 0.18) return fallback;
  const saturation = Math.max(0.62, Math.min(0.82, hsl.saturation));
  const lightness = Math.max(0.38, Math.min(0.54, hsl.lightness));
  return hslToHex(hsl.hue, saturation, lightness);
}

export function mixProductionDisplayColor(value, whiteRatio = 0.9) {
  const hex = expandedHex(value) || expandedHex(getProductionDisplayFallbackColor()) || '2563EB';
  const ratio = Math.max(0, Math.min(1, Number(whiteRatio)));
  const channels = [0, 2, 4].map(offset => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(channel + ((255 - channel) * ratio))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('').toUpperCase()}`;
}

export function getProductionDisplayTheme(value, options = {}) {
  const base = getProductionDisplayColor(value, options);
  return Object.freeze({
    base,
    accent: base,
    border: base,
    soft: mixProductionDisplayColor(base, 0.9),
    card: mixProductionDisplayColor(base, 0.92),
    text: '#1F2937'
  });
}

export function getProductionCalendarAllocationColor(allocation) {
  const explicitColor = String(allocation?.productionColor || '').trim();
  const identity = firstExisting(
    allocation?.productionId,
    allocation?.calendarParentOperationId,
    stripDailyOperationSuffix(allocation?.operationId)
  );
  const accent = getProductionDisplayColor(explicitColor, {
    productionIndex: firstExisting(allocation?.productionIndex, allocation?.productionOrder),
    productionId: allocation?.productionId,
    identity
  });
  return {
    accent,
    bg: mixProductionDisplayColor(accent, 0.88),
    border: mixProductionDisplayColor(accent, 0.58)
  };
}

export { PRODUCTION_DISPLAY_PALETTE };
