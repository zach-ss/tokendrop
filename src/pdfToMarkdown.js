import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let workerInstance = null;

async function getWorker() {
  if (workerInstance) return workerInstance;

  const absoluteWorkerUrl = new URL(workerUrl, window.location.href).toString();

  // Fetch the worker script text on the main thread where fetch() works reliably,
  // then inline it into a blob so the worker never needs to call import().
  // This sidesteps Safari 17.6's silent killing of dynamic import() in blob workers.
  let workerText;
  try {
    const response = await fetch(absoluteWorkerUrl);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    workerText = await response.text();
  } catch (err) {
    throw new Error('Could not load PDF worker: ' + err.message);
  }

  // Prepend Promise.try polyfill since the worker scope is isolated from main thread
  const polyfill = `
    if (typeof Promise.try !== 'function') {
      Promise.try = function(fn) {
        return new Promise(function(resolve) { resolve(fn()); });
      };
    }
  `;

  const blob = new Blob([polyfill + workerText], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);

  workerInstance = worker;
  return worker;
}

export async function pdfToMarkdown(arrayBuffer) {
  const worker = await getWorker();
  pdfjsLib.GlobalWorkerOptions.workerPort = worker;

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer.slice(0),
    standardFontDataUrl: new URL(
      'pdfjs-dist/standard_fonts/',
      import.meta.url
    ).toString(),
  });

  let pdf;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('PDF conversion timed out.')),
        15000
      )
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
