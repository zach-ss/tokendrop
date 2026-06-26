export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { url } = req.query

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, { signal: controller.signal })
    const html = await response.text()
    return res.status(200).json({ html })
  } catch {
    return res.status(500).json({ error: 'Failed to fetch URL' })
  } finally {
    clearTimeout(timeout)
  }
}
