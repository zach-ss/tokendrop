import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, cpSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-pdfjs-worker',
      buildStart() {
        const src = resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
        const dest = resolve('public/pdf.worker.min.mjs');
        copyFileSync(src, dest);

        const fontsDir = resolve('node_modules/pdfjs-dist/standard_fonts');
        const destFontsDir = resolve('public/standard_fonts');
        cpSync(fontsDir, destFontsDir, { recursive: true });
      },
    },
  ],
})
