'use client'

import React, { useState, useCallback } from 'react'
import { fetchWithAuth } from '@/lib/api'
import { Upload, FileText, Loader2, AlertCircle, CheckCircle } from 'lucide-react'

interface UploadZoneProps {
  onUploadSuccess: (documentId: string, filename: string) => void
}

export default function UploadZone({ onUploadSuccess }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successFilename, setSuccessFilename] = useState<string | null>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const processFile = async (file: File) => {
    if (!file) return

    // 1. Validation checks
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF documents are supported.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds 10 MB limit.')
      return
    }

    setError(null)
    setLoading(true)
    setSuccessFilename(null)

    try {
      // Step 2: Get presigned upload URL from backend
      setStatusText('Requesting secure upload authorization...')
      const presignResponse = await fetchWithAuth('/api/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          filesize: file.size
        })
      })

      if (!presignResponse.ok) {
        const errData = await presignResponse.json()
        throw new Error(errData.detail || 'Failed to request signed upload URL.')
      }

      const { signed_url, document_id } = await presignResponse.json()

      // Step 3: Direct PUT to Supabase Storage (bypasses Vercel/Render size limits)
      setStatusText('Uploading PDF directly to secure storage...')
      const uploadResponse = await fetch(signed_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'application/pdf'
        }
      })

      if (!uploadResponse.ok) {
        throw new Error('S3 direct storage upload failed.')
      }

      // Step 4: Trigger background extraction & embedding on Hugging Face
      setStatusText('Queueing background AI processing...')
      const processResponse = await fetchWithAuth(`/api/documents/process/${document_id}`, {
        method: 'POST'
      })

      if (!processResponse.ok) {
        throw new Error('Failed to initiate document text processing.')
      }

      setSuccessFilename(file.name)
      // Call parent trigger to start status polling
      onUploadSuccess(document_id, file.name)

    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.')
    } finally {
      setLoading(false)
      setStatusText('')
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0])
    }
  }

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all ${
          dragActive 
            ? 'border-violet-500 bg-violet-50' 
            : 'border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'
        } ${loading ? 'opacity-80 pointer-events-none' : ''}`}
      >
        <input
          type="file"
          id="pdf-file-upload"
          className="hidden"
          accept=".pdf,application/pdf"
          onChange={handleFileInput}
          disabled={loading}
        />

        {loading ? (
          <div className="flex flex-col items-center py-4 text-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{statusText}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Please do not close this window</p>
          </div>
        ) : successFilename ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Upload Complete!</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 font-mono max-w-[250px] truncate">
              {successFilename}
            </p>
            <p className="text-[11px] text-violet-600 mt-2 bg-violet-100 px-2 py-0.5 rounded-full animate-pulse">
              AI embedding queued...
            </p>
          </div>
        ) : (
          <label 
            htmlFor="pdf-file-upload" 
            className="flex flex-col items-center cursor-pointer py-4 text-center group"
          >
            <div className="bg-white border border-zinc-100 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform shadow-sm shadow-violet-100">
              <Upload className="w-6 h-6 text-zinc-400 group-hover:text-violet-500 transition-colors" />
            </div>
            <p className="text-sm font-semibold text-zinc-900">
              Drag & drop your PDF here, or <span className="text-blue-600 group-hover:underline">browse</span>
            </p>
            <p className="text-xs text-zinc-400 mt-1.5">
              Only digital PDFs, maximum 10 MB
            </p>
          </label>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2 items-start text-xs text-red-400 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
