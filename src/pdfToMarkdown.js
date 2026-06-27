import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let workerBlobUrl = null;

async function getWorkerBlobUrl() {
  if (workerBlobUrl) return workerBlobUrl;

  const absoluteWorkerUrl = new URL(workerUrl, window.location.href).toString();

  const response = await fetch(absoluteWorkerUrl);
  if (!response.ok) throw new Error('Failed to fetch PDF worker: HTTP ' + response.status);
  let workerText = await response.text();
  console.log('[TokenDrop] worker tail:', workerText.slice(-200));

  // Replace import.meta.url so internal URL resolution works from blob context
  workerText = workerText.replace(/import\.meta\.url/g, JSON.stringify(absoluteWorkerUrl));

  // Strip sourcemap comment to prevent Safari access control errors
  workerText = workerText.replace(/\/\/# sourceMappingURL=\S+/g, '');
  console.log('[TokenDrop] sourcemap stripped:', !workerText.includes('sourceMappingURL'));

  const blob = new Blob([workerText], { type: 'text/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}

export async function pdfToMarkdown(arrayBuffer) {
  const blobUrl = await getWorkerBlobUrl();
  pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl;

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
