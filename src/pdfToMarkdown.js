import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Polyfill Promise.try for Safari 17.x (runs on main thread)
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn) {
    return new Promise(function (resolve) { resolve(fn()); });
  };
}

// Worker is served as a plain static file from /pdf.worker.mjs
// This avoids all Safari ESM blob worker issues entirely
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

export async function pdfToMarkdown(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer.slice(0),
    standardFontDataUrl: '/standard_fonts/',
  });

  let pdf;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF conversion timed out.')), 15000)
    );
    pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
  } catch (err) {
    console.error('[TokenDrop] getDocument failed:', err);
    throw new Error(
      'Could not read this PDF. Make sure it is a valid, text-based PDF.'
    );
  }

  const numPages = pdf.numPages;
  const pageTexts = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const lines = [];
    let lastY = null;

    for (const item of textContent.items) {
      if (!item.str) continue;
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        lines.push('\n');
      }
      lines.push(item.str);
      lastY = y;
    }

    pageTexts.push(
      lines.join(' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n')
    );
  }

  const fullText = pageTexts.join('\n\n---\n\n');

  return {
    markdown: fullText,
    rawText: fullText,
    scanned: false,
  };
}
