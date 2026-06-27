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
    const blob = new Blob(
      [`importScripts` + `(); self.onmessage=null; import("${absoluteWorkerUrl}");`],
      { type: 'text/javascript' }
    );

    // Use the simpler dynamic-import blob approach pdfjs itself uses internally
    const wrapperBlob = new Blob(
      [`(async()=>{ await import("${absoluteWorkerUrl}"); })();`],
      { type: 'text/javascript' }
    );
    const blobUrl = URL.createObjectURL(wrapperBlob);

    const worker = new Worker(blobUrl);
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
    pdf = await loadingTask.promise;
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
