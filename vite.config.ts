import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    resolve: {
      alias: [
        { find: /^react-native$/, replacement: path.resolve('web/react-native.tsx') },
        { find: '@react-native/assets-registry/registry', replacement: path.resolve('node_modules/react-native-web/dist/modules/AssetRegistry/index.js') },
        { find: 'lucide-react-native', replacement: 'lucide-react' },
        { find: 'react-native-svg', replacement: path.resolve('web/svg.tsx') },
        { find: '@react-native-community/datetimepicker', replacement: path.resolve('web/DateTimePicker.tsx') },
        { find: 'react-native-image-picker', replacement: path.resolve('web/image-picker.ts') },
        { find: 'react-native-vision-camera', replacement: path.resolve('web/vision-camera.tsx') },
      ],
      extensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.js', '.js', '.json'],
    },
    define: { __DEV__: mode !== 'production', global: 'globalThis', 'process.env.NODE_ENV': JSON.stringify(mode) },
    optimizeDeps: { exclude: ['react-native-safe-area-context', 'react-native-svg'] },
    server: {
      port: 5173,
    },
    build: { chunkSizeWarningLimit: 1800 },
    test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  };
});
