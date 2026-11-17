import React from 'react';
import { StyleSheet } from 'react-native';
// The mobile app uses these standard SVG elements for icons, routes and signatures.
// Render them directly in the browser, preserving their original path data.
function element(tag: string) {
  return React.forwardRef<any, any>(function SvgElement({ style, onPress, ...props }, ref) {
    return React.createElement(tag, { ...props, onClick: onPress, style: StyleSheet.flatten(style), ref });
  });
}
const SvgElement = element('svg');
export default React.forwardRef<any, any>(function Svg({ width = '100%', height = '100%', ...props }, ref) {
  return <SvgElement {...props} ref={ref} width={width} height={height} xmlns="http://www.w3.org/2000/svg" />;
});
export const Circle = element('circle');
export const Path = element('path');
export const Line = element('line');
export const Polyline = element('polyline');
export const G = element('g');
export const Defs = element('defs');
export const LinearGradient = element('linearGradient');
export const Stop = element('stop');
