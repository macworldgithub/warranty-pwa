import { expect, it } from 'vitest';
import { signatureToDataUrl } from '../web/signature';
it('exports the drawn signature as a real SVG image with fitted bounds', () => {
  const uri = signatureToDataUrl(['M10,20 L100,40', 'M30,50 L110,80']);
  const svg = atob(uri.split(',')[1]);
  expect(svg).toContain('viewBox="-2 8 124 84"'); expect(svg).toContain('M10,20 L100,40'); expect(svg).toContain('<svg');
});
it('rejects an empty signature rather than fabricating customer approval', () => {
  expect(() => signatureToDataUrl([])).toThrow('signature');
});
