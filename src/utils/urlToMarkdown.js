import TurndownService from 'turndown';

export async function urlToMarkdown(url) {
  const response = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  const rawHtml = data.html;

  // Extract plain text for token baseline (Option B)
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = rawHtml;

  // Remove scripts, styles, nav, footer, header
  ['script', 'style', 'nav', 'footer', 'header', 'noscript'].forEach(tag => {
    tempDiv.querySelectorAll(tag).forEach(el => el.remove());
  });

  const plainText = tempDiv.innerText || tempDiv.textContent || '';

  // Convert cleaned HTML to Markdown
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  const markdown = turndown.turndown(tempDiv.innerHTML);

  // Strip URLs from markdown for token counting only (link text stays, URLs removed)
  const markdownForCounting = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // [text](url) → text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // ![alt](url) → alt
    .replace(/<https?:\/\/[^>]+>/g, '');       // <url> → removed

  return {
    markdown,
    originalTokenEstimate: Math.round(plainText.length / 4),
    convertedTokenEstimate: Math.min(
      Math.round(markdownForCounting.length / 4),
      Math.round(plainText.length / 4)
    ),
  };
}
