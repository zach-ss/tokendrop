import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerPortReady = null;

function getWorkerPort() {
  if (workerPortReady) return workerPortReady;

  workerPortReady = (async () => {
    // Build an absolute URL for the worker asset
    const absoluteWorkerUrl = new URL(workerUrl, window.location.href).toString();

    // Wrap in a classic blob worker that dynamically imports the ESM worker.
    // This avoids spawning a module worker ({ type: 'module' }) which hangs
    // silently on Safari due to a WebKit bug with ESM worker message channels.
    const wrapperBlob = new Blob(
      [
        `self.onerror = (e) => { self.postMessage({ __pdfjsError: e.message || String(e) }); };` +
        `(async () => {` +
        `  try {` +
        `    await import("${absoluteWorkerUrl}");` +
        `    self.postMessage({ __pdfjsReady: true });` +
        `  } catch (err) {` +
        `    self.postMessage({ __pdfjsError: err.message || String(err) });` +
        `  }` +
        `})();`
      ],
      { type: 'text/javascript' }
    );
    const blobUrl = URL.createObjectURL(wrapperBlob);
    const worker = new Worker(blobUrl);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('PDF worker timed out during initialisation.'));
      }, 10000);

      worker.addEventListener('message', function handler(e) {
        if (e.data?.__pdfjsReady) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          resolve();
        } else if (e.data?.__pdfjsError) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          console.error('[TokenDrop] PDF worker failed to initialise:', e.data.__pdfjsError);
          reject(new Error('PDF worker failed to initialise: ' + e.data.__pdfjsError));
        }
      });
    });

    return worker;
  })();

  return workerPortReady;
}

export async function pdfToMarkdown(arrayBuffer) {
  const worker = await getWorkerPort();

  // Assign to workerPort (not workerSrc) so pdfjs uses our manually-constructed worker
  pdfjsLib.GlobalWorkerOptions.workerPort = worker;

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });

  let pdf;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF conversion timed out. This may be a browser compatibility issue.')), 15000)
    );
    pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
  } catch (err) {
    throw new Error('Could not read this PDF. It may be scanned, encrypted, or corrupted.');
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

    pageTexts.push(lines.join(' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n'));
  }

  const fullText = pageTexts.join('\n\n---\n\n');

  return {
    markdown: fullText,
    rawText: fullText,
    scanned: false,
  };
}
