const PRODUCTION_DISPLAY_PALETTE = Object.freeze([
  '#2563EB',
  '#EA580C',
  '#16A34A',
  '#7C3AED',
  '#CA8A04',
  '#0891B2',
  '#DB2777',
  '#475569',
  '#65A30D',
  '#0F766E',
  '#C2410C',
  '#9333EA'
]);

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

export { PRODUCTION_DISPLAY_PALETTE };
