import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'
import { Analytics } from '@vercel/analytics/react'
import mammoth from 'mammoth'
import { pdfToMarkdown } from './pdfToMarkdown.js'
import { urlToMarkdown } from './utils/urlToMarkdown'

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

function estimateTokens(str) {
  return Math.round(str.length / 4)
}

function TokenSavings({ stats }) {
  const [display, setDisplay] = useState(0)
  const [opacity, setOpacity] = useState(0)
  const prevSaving = useRef(null)

  useEffect(() => {
    if (!stats) return
    if (prevSaving.current === stats.saving) return
    prevSaving.current = stats.saving

    const duration = 2000
    const start = performance.now()
    const target = stats.saving
    let rafId

    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out: decelerate toward the end
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * target))
      setOpacity(eased)
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [stats])

  if (!stats) return null

  return (
    <div className="token-savings" style={{ opacity }}>
      <div className="token-savings-percent">{display}% fewer tokens</div>
      <p className="token-savings-raw">
        {stats.original.toLocaleString()} tokens → {stats.converted.toLocaleString()} tokens
      </p>
    </div>
  )
}
function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="faq-item">
      <button className="faq-question" onClick={() => setOpen(!open)} aria-expanded={open}>
        {question}
        <span className="faq-plus">{open ? '−' : '+'}</span>
      </button>
      {open && <p className="faq-answer">{answer}</p>}
    </div>
  )
}
function PromptBlock() {
  const [copied, setCopied] = useState(false)

  const prompt = `When I'm about to share a PDF, Word document, or any large file in this conversation, remind me to first run it through tokendrop (tokendrop.tech) to convert it to markdown. Token-efficient markdown typically uses 30–60% fewer tokens than pasting raw document content. Only remind me once per file, and only if the file appears large enough to matter (more than a page or two).`

  const handleCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => fallbackCopy())
    } else {
      fallbackCopy()
    }
  }

  const fallbackCopy = () => {
    const ta = document.createElement('textarea')
    ta.value = prompt
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="prompt-block-section">
      <h2>Use it every time</h2>
      <p>Copy this into your AI tool's memory or settings so it automatically prompts you to convert files with TokenDrop before every conversation.</p>
      <div className="prompt-block">
        <pre>{prompt}</pre>
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copied!' : <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'4px',verticalAlign:'middle'}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy</>}
        </button>
      </div>
    </section>
  )
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
  const [tokenStats, setTokenStats] = useState(null)
  const [scanned, setScanned] = useState(false)
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
      setTokenStats(null)
      setScanned(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const [mode, setMode] = useState('file') // 'file' or 'url'
  const [urlInput, setUrlInput] = useState('')

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('td-theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('td-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

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
            const original = Math.round(file.size / 4)
            const converted = estimateTokens(cleaned)
            setTokenStats({
              original,
              converted,
              saving: Math.max(0, Math.round((1 - converted / original) * 100)),
            })
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
            const original = Math.round(file.size / 4)
            const converted = estimateTokens(md)
            setTokenStats({
              original,
              converted,
              saving: Math.max(0, Math.round((1 - converted / original) * 100)),
            })
            setScanned(false)
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
    setTokenStats(null)
    setScanned(false)
  }, [])

  if (view === 'editor') {
    return (
      <div className="editor-view">
        <aside className="left-panel">
          <div className="file-meta">
            <span className="file-name">{fileName}</span>
            <span className="file-size">{formatBytes(fileSize)}</span>
          </div>
          <TokenSavings stats={tokenStats} />
          {scanned && <p className="scanned-warning">This PDF appears to be scanned. Text extraction may be incomplete.</p>}
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
    <>
      <div className="dropzone-view">
<div className="nav-bar">
  <button
    onClick={() => setDarkMode(prev => !prev)}
    aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    style={{
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '6px',
      color: 'var(--accent)',
      display: 'flex',
      alignItems: 'center',
      marginLeft: 'auto',
    }}
  >
    {darkMode ? (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
        <line x1="9" y1="1" x2="9" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="9" y1="15" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="1" y1="9" x2="3" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="15" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="13.54" y1="13.54" x2="14.95" y2="14.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="14.95" y1="3.05" x2="13.54" y2="4.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4.46" y1="13.54" x2="3.05" y2="14.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ) : (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <mask id="moon-mask">
            <rect width="20" height="20" fill="white"/>
            <circle cx="13" cy="7" r="6" fill="black"/>
          </mask>
        </defs>
        <circle cx="10" cy="10" r="7" fill="currentColor" mask="url(#moon-mask)"/>
      </svg>
    )}
  </button>
</div>
<span className="app-title"><span style={{display:'flex', alignItems:'center', gap:'8px'}}>
  <svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
    <rect width="48" height="48" rx="11" fill="#5f8c72"/>
    <circle cx="24" cy="18" r="7" stroke="white" strokeWidth="4"/>
    <circle cx="24" cy="30" r="7" fill="white"/>
  </svg>
  <span style={{display:'inline-flex', alignItems:'baseline', gap:'0px'}}>
    <span className="logo-token">Token</span><span className="logo-drop" style={{verticalAlign:'baseline', display:'inline'}}>Drop</span>
  </span>
</span></span><h1 className="hero-headline">Fewer tokens.<br /><em>Better results.</em></h1>
<p className="hero-sub">Upload a PDF or Word doc and get back clean, AI-ready text in seconds.</p>
        <div className="mode-tabs">
          <button
            className={`mode-tab ${mode === 'file' ? 'active' : ''}`}
            onClick={() => setMode('file')}
          >
            Upload File
          </button>
          <button
            className={`mode-tab ${mode === 'url' ? 'active' : ''}`}
            onClick={() => setMode('url')}
          >
            Paste URL
          </button>
        </div>

        {mode === 'url' && (
          <div className="url-input-wrapper">
            <input
              type="text"
              className="url-input"
              placeholder="https://..."
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            <button
              className="url-submit"
              onClick={async () => {
                if (!urlInput) return;
                try {
                  const { markdown, originalTokenEstimate, convertedTokenEstimate } = await urlToMarkdown(urlInput);
                  setMarkdown(markdown);
                  setTokenStats({
                    original: originalTokenEstimate,
                    converted: convertedTokenEstimate,
                    saving: Math.max(0, Math.round((1 - convertedTokenEstimate / originalTokenEstimate) * 100)),
                  });
                  setFileName(urlInput);
                  setView('editor');
                } catch (err) {
                  console.error(err);
                  showError('Could not fetch or convert that URL.');
                }
              }}
            >
              Convert
            </button>
          </div>
        )}

        {mode === 'file' && <div
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5f8c72" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="4"/>
                <path d="M12 16V8m0 0l-3 3m3-3l3 3"/>
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
        </div>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="pdf-warning">Works best with text-based PDFs. Tables, columns, and scanned pages may not convert well.</p>
      </div>
      <section className="edu-section">
        <p className="edu-intro">
          Most documents aren't built for AI. They're built for printers. When you upload a file, the AI wastes time processing fonts, page margins, and formatting it ignores entirely. TokenDrop converts your documents to Markdown — a simple, text-only format that AI reads directly — so the AI gets straight to your actual content. Sharper answers. Less wasted effort. Every session.
        </p>
        <div className="stat-cards">
          <div className="stat-card">
            <span className="stat-figure">up to 3×</span>
            <p className="stat-body">A typical PDF uses 3 times more tokens than the same content as Markdown. That's formatting noise the AI reads but doesn't need.</p>
            <p className="stat-why">Convert your files first and your AI tool works with less waste, so you get more out of every session.</p>
          </div>
          <div className="stat-divider" />
          <div className="stat-card">
            <span className="stat-figure">fit more in</span>
            <p className="stat-body">Every AI tool has a limit on how much it can read at once. Fewer tokens means more of your actual content fits: more pages, more sources, better answers.</p>
            <p className="stat-why">For students and professionals working with long documents, that extra space can be the difference between a partial answer and a complete one.</p>
          </div>
          <div className="stat-divider" />
          <div className="stat-card">
            <span className="stat-figure">just the words</span>
            <p className="stat-body">Markdown strips away invisible formatting clutter. What's left is clean, structured text. Exactly what AI is designed to read.</p>
            <p className="stat-why">Cleaner input means the AI spends its effort on your content, not your formatting.</p>
          </div>
        </div>
      </section>
      <section style={{padding:'3.5rem 2rem',background:'transparent'}}>
  <p style={{fontSize:'11px',fontWeight:'500',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--text-secondary)',textAlign:'center',marginBottom:'0.6rem'}}>How it works</p>
  <h2 style={{fontFamily:'Georgia,serif',fontSize:'26px',fontWeight:'400',color:'var(--text-primary)',textAlign:'center',marginBottom:'3rem',lineHeight:'1.3'}}>From file to AI-ready in seconds</h2>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1.5rem',maxWidth:'860px',margin:'0 auto'}}>

    <div style={{textAlign:'center',padding:'0 0.5rem',position:'relative'}}>
      <div style={{width:'56px',height:'56px',borderRadius:'50%',background:'rgba(95,140,114,0.12)',border:'1px solid rgba(95,140,114,0.3)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem',color:'#5f8c72',position:'relative'}}>
        <span style={{position:'absolute',top:'-3px',right:'-3px',width:'17px',height:'17px',borderRadius:'50%',background:'#5f8c72',color:'#fff',fontSize:'9px',fontWeight:'600',display:'flex',alignItems:'center',justifyContent:'center'}}>1</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>
      </div>
      <p style={{fontSize:'14px',fontWeight:'500',color:'var(--text-primary)',marginBottom:'6px'}}>Drop your file</p>
      <p style={{fontSize:'13px',color:'var(--text-secondary)',lineHeight:'1.65'}}>Upload a PDF or Word doc. Drag and drop, or click to browse.</p>
      <span style={{position:'absolute',right:'-14px',top:'26px',color:'var(--text-muted)',fontSize:'16px'}} aria-hidden="true">→</span>
    </div>

    <div style={{textAlign:'center',padding:'0 0.5rem',position:'relative'}}>
      <div style={{width:'56px',height:'56px',borderRadius:'50%',background:'rgba(95,140,114,0.12)',border:'1px solid rgba(95,140,114,0.3)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem',color:'#5f8c72',position:'relative'}}>
        <span style={{position:'absolute',top:'-3px',right:'-3px',width:'17px',height:'17px',borderRadius:'50%',background:'#5f8c72',color:'#fff',fontSize:'9px',fontWeight:'600',display:'flex',alignItems:'center',justifyContent:'center'}}>2</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </div>
      <p style={{fontSize:'14px',fontWeight:'500',color:'var(--text-primary)',marginBottom:'6px'}}>Instant conversion</p>
      <p style={{fontSize:'13px',color:'var(--text-secondary)',lineHeight:'1.65'}}>TokenDrop strips fonts, layout, and formatting — leaving only clean Markdown your AI can read directly.</p>
      <span style={{position:'absolute',right:'-14px',top:'26px',color:'var(--text-muted)',fontSize:'16px'}} aria-hidden="true">→</span>
    </div>

    <div style={{textAlign:'center',padding:'0 0.5rem'}}>
      <div style={{width:'56px',height:'56px',borderRadius:'50%',background:'rgba(95,140,114,0.12)',border:'1px solid rgba(95,140,114,0.3)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem',color:'#5f8c72',position:'relative'}}>
        <span style={{position:'absolute',top:'-3px',right:'-3px',width:'17px',height:'17px',borderRadius:'50%',background:'#5f8c72',color:'#fff',fontSize:'9px',fontWeight:'600',display:'flex',alignItems:'center',justifyContent:'center'}}>3</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </div>
      <p style={{fontSize:'14px',fontWeight:'500',color:'var(--text-primary)',marginBottom:'6px'}}>Copy and use</p>
      <p style={{fontSize:'13px',color:'var(--text-secondary)',lineHeight:'1.65'}}>Paste straight into your AI tool. No clutter. No wasted tokens.</p>
    </div>

  </div>
</section>
      <hr style={{maxWidth:'860px',margin:'0 auto',border:'none',borderTop:'1px solid var(--border)'}}/>
      <PromptBlock />
      <hr style={{maxWidth:'860px',margin:'0 auto',border:'none',borderTop:'1px solid var(--border)'}}/>
    <section className="faq-section">
        <p className="faq-label">Questions</p>
        <h2 className="faq-title">TokenDrop FAQs</h2>
        {[
          { q: "What is TokenDrop?", a: "A free browser-based tool that converts PDF and DOCX files into clean markdown — a lightweight format AI tools can read more efficiently." },
          { q: "Why does this exist?", a: "Built by Zachary Sullivan, a law student who kept watching lengthy cases and legal documents eat through his AI usage limits. So he built one." },
          { q: "How does it work?", a: "Upload your PDF or DOCX file and TokenDrop instantly converts it to markdown in your browser. Preview and edit the result, then copy or download it." },
          { q: "What is markdown, exactly?", a: "A simple plain-text format that uses minimal characters to convey structure. No hidden metadata or formatting overhead — just content." },
          { q: "Why does markdown use fewer tokens?", a: "PDFs and DOCX files carry invisible formatting data, layout instructions, and encoding overhead that all count toward your token limit. Markdown strips all of that out." },
          { q: "What file types does TokenDrop support?", a: "Currently PDF (text-based, not scanned) and DOCX. More formats are on the roadmap." },
          { q: "Is my data safe?", a: "Yes. Everything is processed directly in your browser. Your files are never uploaded to a server or stored anywhere." },
          { q: "Does it cost anything?", a: "No. TokenDrop is completely free with no account required." },
          { q: "Who is it for?", a: "Anyone who uses AI tools regularly — law students, researchers, analysts, writers, developers — and wants to get more out of every conversation without hitting token limits." },
          { q: "Can I edit the markdown before I use it?", a: "Yes. After conversion you get a live preview where you can make edits before copying or downloading the final output." },
        ].map((item, i) => (
          <FaqItem key={i} question={item.q} answer={item.a} />
        ))}
      </section>
    <footer className="app-footer">
        <div className="footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Use</a>
        </div>
        © 2026 Zachary Sullivan. All rights reserved.
      </footer>
      <Analytics />
    </>
  )
}
