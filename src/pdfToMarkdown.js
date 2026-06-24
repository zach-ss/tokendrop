import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// Chars extracted below this threshold per page → treat as scanned
const SCANNED_CHARS_PER_PAGE = 30

export async function pdfToMarkdown(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages

  const pageBlocks = []
  let totalChars = 0

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    totalChars += content.items.reduce((n, item) => n + (item.str || '').length, 0)
    pageBlocks.push(extractPageBlocks(content.items, page))
  }

  const avgCharsPerPage = totalChars / numPages
  if (avgCharsPerPage < SCANNED_CHARS_PER_PAGE) {
    return { markdown: '', scanned: true }
  }

  const rawText = pageBlocks.flat().map((b) => b.text).join(' ')
  const markdown = pageBlocks.map(renderBlocks).join('\n\n---\n\n').trim()
  return { markdown, rawText, scanned: false }
}

function extractPageBlocks(items, _page) {
  if (!items.length) return []

  // Group items into lines by their Y coordinate (within 2pt tolerance)
  const lines = []
  for (const item of items) {
    if (!item.str) continue
    const y = Math.round(item.transform[5])
    const existing = lines.find((l) => Math.abs(l.y - y) <= 2)
    if (existing) {
      existing.items.push(item)
    } else {
      lines.push({ y, items: [item] })
    }
  }

  // Sort lines top-to-bottom (PDF Y axis is bottom-up)
  lines.sort((a, b) => b.y - a.y)

  // Collect font sizes to determine heading thresholds
  const sizes = lines.flatMap((l) => l.items.map((it) => it.height || 0)).filter(Boolean)
  const bodySize = sizes.length ? median(sizes) : 12

  return lines.map((line) => {
    const text = line.items.map((it) => it.str).join('').trim()
    if (!text) return null
    const size = Math.max(...line.items.map((it) => it.height || 0))
    const isBold = line.items.some((it) => /bold/i.test(it.fontName || ''))

    let type = 'p'
    if (size >= bodySize * 1.6 || (size >= bodySize * 1.3 && isBold)) type = 'h1'
    else if (size >= bodySize * 1.25 || (size >= bodySize * 1.1 && isBold)) type = 'h2'
    else if (isBold && size >= bodySize) type = 'h3'

    const isBullet = /^[•‣◦⁃∙\-*]\s/.test(text)

    return { type: isBullet ? 'li' : type, text: isBullet ? text.replace(/^.\s+/, '') : text }
  }).filter(Boolean)
}

function renderBlocks(blocks) {
  const out = []
  for (const block of blocks) {
    if (block.type === 'h1') out.push(`# ${block.text}`)
    else if (block.type === 'h2') out.push(`## ${block.text}`)
    else if (block.type === 'h3') out.push(`### ${block.text}`)
    else if (block.type === 'li') out.push(`- ${block.text}`)
    else out.push(block.text)
  }
  return out.join('\n')
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
