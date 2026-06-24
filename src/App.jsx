import { useState, useRef, useCallback, useEffect } from 'react'
import mammoth from 'mammoth'
import { pdfToMarkdown } from './pdfToMarkdown.js'

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const ACCEPTED = ['.docx', '.pdf']

function getFileType(file) {
  if (file.name.endsWith('.docx')) return 'docx'
  if (file.name.endsWith('.pdf')) return 'pdf'
  return null
}

export default function App() {
  const [view, setView] = useState('drop')
  const [markdown, setMarkdown] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef(null)
  const errorTimerRef = useRef(null)
  const copiedTimerRef = useRef(null)
  const dragCounterRef = useRef(0)

  // Clear timers on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      clearTimeout(errorTimerRef.current)
      clearTimeout(copiedTimerRef.current)
    }
  }, [])

  // Push a history entry when entering editor view; popstate resets to drop
  useEffect(() => {
    if (view === 'editor') {
      window.history.pushState({ tokendrop: true }, '')
    }
  }, [view])

  useEffect(() => {
    const onPop = () => {
      setView('drop')
      setMarkdown('')
      setFileName('')
      setFileSize(0)
      setCopied(false)
      setLoading(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const showError = useCallback((msg) => {
    setError(msg)
    clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(''), 5000)
  }, [])

  const processFile = useCallback((file) => {
    if (!file) return
    const type = getFileType(file)
    if (!type) {
      showError('Please upload a .docx or .pdf file.')
      return
    }

    setFileName(file.name)
    setFileSize(file.size)
    setLoading(true)

    const reader = new FileReader()
    reader.onload = (e) => {
      const arrayBuffer = e.target.result

      if (type === 'docx') {
        mammoth.convertToMarkdown({ arrayBuffer })
          .then((result) => {
            const cleaned = result.value
              .replace(/\\([()[\]{}*_`#|>!.+-])/g, '$1')
            setMarkdown(cleaned)
            setLoading(false)
            if (!cleaned.trim()) {
              showError('File converted but appears to contain no readable text.')
            }
            setView('editor')
          })
          .catch(() => {
            setLoading(false)
            showError('Could not convert this file. Make sure it is a valid .docx.')
          })
      }

      if (type === 'pdf') {
        pdfToMarkdown(arrayBuffer)
          .then(({ markdown: md, scanned }) => {
            setLoading(false)
            if (scanned) {
              showError(
                'This PDF appears to be a scanned image. Scanned PDFs don\'t contain selectable text, so conversion isn\'t possible yet. Try exporting your document as a .docx instead.'
              )
              return
            }
            setMarkdown(md)
            if (!md.trim()) {
              showError('PDF converted but no readable text was found.')
            }
            setView('editor')
          })
          .catch(() => {
            setLoading(false)
            showError('Could not read this PDF. Make sure it is a valid, text-based PDF.')
          })
      }
    }
    reader.onerror = () => {
      setLoading(false)
      showError('Could not read this file.')
    }
    reader.readAsArrayBuffer(file)
  }, [showError])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    processFile(file)
  }, [processFile])

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    dragCounterRef.current += 1
    setDragOver(true)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
  }, [])

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setDragOver(false)
  }, [])

  const handleFileInput = useCallback((e) => {
    processFile(e.target.files[0])
    e.target.value = ''
  }, [processFile])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true)
      clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      showError('Could not access clipboard. Please copy the text manually.')
    })
  }, [markdown, showError])

  const handleDownload = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/\.(docx|pdf)$/i, '.md')
    a.click()
    URL.revokeObjectURL(url)
  }, [markdown, fileName])

  const handleReset = useCallback(() => {
    setView('drop')
    setMarkdown('')
    setFileName('')
    setFileSize(0)
    setCopied(false)
    setLoading(false)
  }, [])

  if (view === 'editor') {
    return (
      <div className="editor-view">
        <aside className="left-panel">
          <div className="file-meta">
            <span className="file-name">{fileName}</span>
            <span className="file-size">{formatBytes(fileSize)}</span>
          </div>
          <hr className="divider" />
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy Markdown'}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleDownload}>
              Download .md
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleReset}>
              Convert Another
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-start-over" onClick={handleReset}>
            Start over
          </button>
          <p className="left-panel-footer">
            Powered by{' '}
            <a href="https://github.com/mwilliamson/mammoth.js" target="_blank" rel="noreferrer">
              mammoth.js
            </a>
            {' & '}
            <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noreferrer">
              pdf.js
            </a>
          </p>
        </aside>
        <main className="right-panel">
          <textarea
            className="markdown-textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck={false}
            aria-label="Markdown output"
          />
        </main>
      </div>
    )
  }

  return (
    <div className="dropzone-view">
      <span className="app-title">tokendrop</span>
      <p className="app-tagline">AI reads markdown better than Word or PDF. Convert instantly — no accounts, nothing leaves your browser.</p>
      <div
        className={`dropzone${dragOver ? ' drag-over' : ''}${loading ? ' loading' : ''}`}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !loading && fileInputRef.current.click()}
        onKeyDown={(e) => !loading && (e.key === 'Enter' || e.key === ' ') && fileInputRef.current.click()}
        tabIndex={0}
        role="button"
        aria-label="Upload a .docx or .pdf file"
        aria-busy={loading}
      >
        {loading ? (
          <div className="loading-state" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p className="dropzone-label">Converting…</p>
          </div>
        ) : (
          <>
            <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V8m0 0-3 3m3-3 3 3" />
              <path d="M20 16.5A4.5 4.5 0 0 0 15.5 12H14a6 6 0 1 0-11.8 1.5" />
            </svg>
            <p className="dropzone-label">Drop your file here</p>
            <p className="dropzone-sub">or click to browse</p>
            <p className="dropzone-hint">.docx and .pdf files supported</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
    </div>
  )
}
