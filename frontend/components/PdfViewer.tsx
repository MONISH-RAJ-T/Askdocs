'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react'

// Use the bundled PDF.js worker from the CDN to avoid Next.js build issues
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  url: string
  onClose: () => void
  documentName?: string
}

export default function PdfViewer({ url, onClose, documentName }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setContainerWidth(node.getBoundingClientRect().width)
    }
  }, [])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setIsLoading(false)
    setError(null)
  }

  function onDocumentLoadError(err: Error) {
    setError('Failed to load PDF. Please try again.')
    setIsLoading(false)
    console.error('PDF load error:', err)
  }

  return (
    <div className="fixed inset-0 md:absolute md:inset-0 z-50 bg-white dark:bg-zinc-900 flex flex-col md:m-6 md:rounded-2xl md:border md:border-zinc-200 md:dark:border-zinc-800 md:shadow-2xl">
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0 gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-bold text-zinc-900 dark:text-white truncate">{documentName}</span>
        </div>

        {/* Page controls */}
        {numPages > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 px-2">
              {pageNumber} / {numPages}
            </span>
            <button
              onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          ✕ Close
        </button>
      </div>

      {/* PDF Content — scrollable on all devices */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-zinc-100 dark:bg-zinc-950"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 gap-4">
            {isLoading && (
              <div className="flex items-center gap-2 py-12 text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading PDF…</span>
              </div>
            )}
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading=""
            >
              <Page
                pageNumber={pageNumber}
                width={containerWidth ? Math.min(containerWidth - 24, 900) : undefined}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                loading=""
              />
            </Document>
          </div>
        )}
      </div>

      {/* Footer page nav for mobile thumb reach */}
      {numPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-3 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <button
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 disabled:opacity-30 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
            Page {pageNumber} of {numPages}
          </span>
          <button
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 disabled:opacity-30 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
