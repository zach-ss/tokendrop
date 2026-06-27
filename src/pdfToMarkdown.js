import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let workerInstance = null;

async function getWorker() {
  if (workerInstance) return workerInstance;

  const absoluteWorkerUrl = new URL(workerUrl, window.location.href).toString();

  // Safari 17.x silently kills ESM module workers spawned via workerSrc.
  // Instead we spawn a classic blob worker that dynamically imports the
  // legacy worker (which has all polyfills including Promise.try baked in).
  // Classic workers can use dynamic import() in Safari 15+ without issue.
  const blob = new Blob(
    [
      `(async () => {
        try {
          await import("${absoluteWorkerUrl}");
          self.postMessage({ __pdfjsReady: true });
        } catch (err) {
          self.postMessage({ __pdfjsError: String(err) });
        }
      })();`
    ],
    { type: 'text/javascript' }
  );

  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);

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
        reject(new Error('PDF worker failed: ' + e.data.__pdfjsError));
      }
    });
  });

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
