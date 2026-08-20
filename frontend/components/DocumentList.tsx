'use client'

import React from 'react'
import { FileText, CheckCircle, AlertTriangle, Loader2, Edit2, Trash2, Download, RefreshCw } from 'lucide-react'

interface Document {
  id: string
  name: string
  file_size: number
  status: string
  created_at: string
  error_message?: string
  page_count?: number
  chunk_count?: number
  folder_id?: string | null
}

interface DocumentListProps {
  documents: Document[]
  selectedId: string | null
  onSelectDocument: (doc: Document) => void
  onRenameDocument: (id: string, newName: string) => Promise<void>
  onDeleteDocument: (id: string) => Promise<void>
  onDownloadDocument: (doc: Document) => void
  onRetryDocument: (id: string) => Promise<void>
}

export default function DocumentList({
  documents,
  selectedId,
  onSelectDocument,
  onRenameDocument,
  onDeleteDocument,
  onDownloadDocument,
  onRetryDocument
}: DocumentListProps) {
  
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  }

  const renderStatusBadge = (doc: Document) => {
    switch (doc.status.toLowerCase()) {
      case 'ready':
        return (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Processed
          </span>
        )
      case 'extracting':
        return (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
            <Loader2 className="w-3 h-3 animate-spin" /> Extracting
          </span>
        )
      case 'embedding':
        return (
          <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200">
            <Loader2 className="w-3 h-3 animate-spin" /> Vectorizing
          </span>
        )
      case 'processing':
        return (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
            <Loader2 className="w-3 h-3 animate-spin" /> Processing
          </span>
        )
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800">
            <Loader2 className="w-3 h-3 animate-spin" /> Queued
          </span>
        )
      case 'failed':
        return (
          <span 
            title={doc.error_message || "Unknown processing error occurred"} 
            className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-200 cursor-help"
          >
            <AlertTriangle className="w-3 h-3" /> Failed
          </span>
        )
      default:
        return (
          <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md">
            {doc.status}
          </span>
        )
    }
  }

  const handleRename = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation()
    const rawName = doc.name.replace(/\.pdf$/i, '')
    const newName = window.prompt("Rename PDF:", rawName)
    if (newName && newName.trim() && newName.trim() !== rawName) {
      onRenameDocument(doc.id, newName.trim())
    }
  }

  const handleDelete = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation()
    if (window.confirm(`Are you sure you want to delete "${doc.name}"?\nThis will clear all chunks and chat memory.`)) {
      onDeleteDocument(doc.id)
    }
  }

  const handleDownload = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation()
    onDownloadDocument(doc)
  }

  const handleRetry = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation()
    onRetryDocument(doc.id)
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-zinc-200 bg-zinc-50 dark:bg-zinc-950 rounded-2xl">
        <FileText className="w-8 h-8 text-zinc-300 mb-2" />
        <p className="text-xs text-zinc-500 font-medium">No documents uploaded yet</p>
        <p className="text-[11px] text-zinc-400 mt-1">Upload a PDF below to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
      {documents.map((doc) => {
        const isSelected = doc.id === selectedId
        const isReady = doc.status.toLowerCase() === 'ready'
        const isFailed = doc.status.toLowerCase() === 'failed'
        
        return (
          <div
            key={doc.id}
            onClick={() => isReady && onSelectDocument(doc)}
            className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
              isSelected
                ? 'bg-violet-50 border-violet-200 shadow-sm shadow-violet-100'
                : isReady
                ? 'border-zinc-200 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:bg-zinc-950 hover:border-zinc-300 cursor-pointer shadow-sm'
                : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 opacity-75'
            }`}
          >
            <div className={`p-2 rounded-lg shrink-0 ${
              isSelected 
                ? 'bg-red-50 text-red-500 border border-red-100' 
                : 'bg-zinc-50 dark:bg-zinc-950 text-red-400 border border-zinc-100 dark:border-zinc-800'
            }`}>
              <FileText className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate flex-1">
                  {doc.name}
                </p>
                {/* Actions Toolbar */}
                <div className="flex items-center gap-1 shrink-0 text-zinc-400 opacity-40 hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => handleRename(e, doc)} 
                    className="p-1 hover:text-violet-500 transition-colors" 
                    title="Rename"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {isReady && (
                    <button 
                      onClick={(e) => handleDownload(e, doc)} 
                      className="p-1 hover:text-emerald-500 transition-colors" 
                      title="Download PDF"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  )}
                  {isFailed && (
                    <button 
                      onClick={(e) => handleRetry(e, doc)} 
                      className="p-1 hover:text-amber-500 transition-colors animate-pulse" 
                      title="Retry processing"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                  <button 
                    onClick={(e) => handleDelete(e, doc)} 
                    className="p-1 hover:text-red-500 transition-colors" 
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-zinc-500 font-mono">
                  {formatBytes(doc.file_size)}
                  {doc.page_count ? ` | ${doc.page_count} pgs` : ''}
                </span>
                {renderStatusBadge(doc)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
