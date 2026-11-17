export function signatureToDataUrl(paths: string[]) {
  if (!paths.length) throw new Error('A customer signature is required.');
  const points = paths.join(' ').matchAll(/(-?[\d.]+),(-?[\d.]+)/g);
  const pairs = Array.from(points, match => [Number(match[1]), Number(match[2])]);
  if (!pairs.length) throw new Error('Please draw a customer signature.');
  const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
  const minX = Math.min(...xs) - 12, minY = Math.min(...ys) - 12;
  const width = Math.max(...xs) - minX + 12, height = Math.max(...ys) - minY + 12;
  const escaped = paths.map(path => path.replace(/[^MmLlCcSsQqTtAaHhVvZz\d.,\s-]/g, ''));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">${escaped.map(d => `<path d="${d}" fill="none" stroke="#1E3A8A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
