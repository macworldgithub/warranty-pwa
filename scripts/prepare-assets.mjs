import fs from 'node:fs/promises';
await fs.mkdir('public/ocr', { recursive: true });
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  await fs.copyFile(`node_modules/tesseract.js-core/${name}`, `public/ocr/${name}`);
}
await fs.copyFile('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
await fs.copyFile('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'public/ocr/eng.traineddata.gz');
console.log('Offline OCR worker, cores and English language data prepared.');
