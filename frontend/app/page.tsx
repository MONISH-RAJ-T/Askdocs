'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase/client'
import { fetchWithAuth } from '@/lib/api'
import UploadZone from '@/components/UploadZone'
import DocumentList from '@/components/DocumentList'
import ChatWindow from '@/components/ChatWindow'
import MyDocumentsView from '@/components/MyDocumentsView'
import FoldersView from '@/components/FoldersView'
import { LogOut, FileText, Bot, Upload, Loader2, RefreshCw, MessageSquare, Folder, Settings, Search, MoreVertical, ChevronDown, Plus, Layout, HardDrive, Filter, Download, Trash2, Sun, Moon, PanelLeft } from 'lucide-react'

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


export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [checkingSession, setCheckingSession] = useState(true)
  const pollingIntervals = useRef<{ [key: string]: NodeJS.Timeout }>({})
  const router = useRouter()
  const supabase = createSupabaseClient()

  const [storageUsage, setStorageUsage] = useState<{used_bytes: number, total_bytes: number, percentage: number} | null>(null)
  const [folders, setFolders] = useState<any[]>([])
  const [showPdf, setShowPdf] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeTab, setActiveTab] = useState<'chat' | 'documents' | 'folders'>('chat')
  const [chatConversations, setChatConversations] = useState<any[]>([])
  const [activeChatConversationId, setActiveChatConversationId] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Custom premium modal and toast states
  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'success' | 'error' | 'info' }[]>([])
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    isDestructive?: boolean
    showInput?: boolean
    inputPlaceholder?: string
    onConfirm: () => void
    onConfirmInput?: (val: string) => void
  } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }

  const showConfirmModal = (options: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    isDestructive?: boolean
    showInput?: boolean
    inputPlaceholder?: string
    onConfirm?: () => void
    onConfirmInput?: (val: string) => void
  }) => {
    setConfirmModal({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      isDestructive: options.isDestructive || false,
      showInput: options.showInput || false,
      inputPlaceholder: options.inputPlaceholder || '',
      onConfirm: options.onConfirm || (() => {}),
      onConfirmInput: options.onConfirmInput
    })
  }

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light'
    setTheme(savedTheme as 'light' | 'dark')
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // 1. Session check on load
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
        fetchDocuments()
        fetchStorageUsage()
        fetchFolders()
      }
      setCheckingSession(false)
    }

    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    })

    return () => {
      subscription.unsubscribe()
      // Clear any active polling timers on unmount
      Object.values(pollingIntervals.current).forEach(clearInterval)
    }
  }, [router])

  const fetchStorageUsage = async () => {
    try {
      const res = await fetchWithAuth('/api/storage')
      if (res.ok) setStorageUsage(await res.json())
    } catch (err) {}
  }
  const fetchFolders = async () => {
    try {
      const res = await fetchWithAuth('/api/folders')
      if (res.ok) setFolders(await res.json())
    } catch (err) {}
  }

  const handleCreateFolder = async () => {
    showConfirmModal({
      title: 'Create Folder',
      message: 'Please enter a name for the new folder:',
      confirmText: 'Create',
      showInput: true,
      inputPlaceholder: 'e.g., Invoices, Resumes...',
      onConfirmInput: async (name) => {
        if (!name || !name.trim()) return
        try {
          const res = await fetchWithAuth('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() })
          })
          if (res.ok) {
            fetchFolders()
            showToast('Folder created successfully', 'success')
          } else {
            showToast('Failed to create folder', 'error')
          }
        } catch (err) {
          showToast('Error creating folder', 'error')
        }
      }
    })
  }

  // Fetch PDF signed URL when selection changes
  useEffect(() => {
    if (selectedDoc) {
      fetchPdfUrl(selectedDoc.id)
    } else {
      setPdfUrl(null)
    }
  }, [selectedDoc])

  const fetchPdfUrl = async (docId: string) => {
    try {
      const res = await fetchWithAuth(`/api/documents/${docId}/view`)
      if (res.ok) {
        const { url } = await res.json()
        setPdfUrl(url)
      }
    } catch (err) {
      console.error("Failed to load PDF view link:", err)
    }
  }

  // 2. Fetch all user documents
  const fetchDocuments = async () => {
    setLoadingDocs(true)
    try {
      const response = await fetchWithAuth('/api/documents')
      if (response.ok) {
        const data = await response.json()
        setDocuments(data)
        
        // Resume polling for any documents that are still in processing/pending state
        data.forEach((doc: Document) => {
          const statusLower = doc.status.toLowerCase()
          if (statusLower === 'processing' || statusLower === 'pending' || statusLower === 'extracting' || statusLower === 'embedding') {
            startStatusPolling(doc.id, doc.name)
          }
        })
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoadingDocs(false)
    }
  };

  // 3. Status Polling trigger for background processing
  const startStatusPolling = (docId: string, filename: string) => {
    if (pollingIntervals.current[docId]) return // already polling this document

    const interval = setInterval(async () => {
      try {
        const res = await fetchWithAuth(`/api/documents/${docId}/status`)
        if (res.ok) {
          const docData = await res.json()
          const status = docData.status
          
          // Update status and error messages dynamically
          setDocuments(prev => 
            prev.map(doc => doc.id === docId ? { 
              ...doc, 
              status, 
              error_message: docData.error_message,
              page_count: docData.page_count,
              chunk_count: docData.chunk_count
            } : doc)
          )
          
          if (selectedDoc && selectedDoc.id === docId) {
            setSelectedDoc(prev => 
              prev ? { 
                ...prev, 
                status, 
                error_message: docData.error_message,
                page_count: docData.page_count,
                chunk_count: docData.chunk_count
              } : null
            )
          }

          if (status === 'ready' || status === 'failed') {
            clearInterval(pollingIntervals.current[docId])
            delete pollingIntervals.current[docId]

            if (status === 'ready') {
              showToast(`Document "${filename}" is ready for chat!`, 'success')
            } else {
              showToast(`Processing failed for document "${filename}".`, 'error')
            }
          }
        }
      } catch (err) {
        console.error(`Error polling status for doc ${docId}:`, err)
      }
    }, 3000)

    pollingIntervals.current[docId] = interval
  }

  // Document Operations
  const handleRenameDocument = async (docId: string, newName: string) => {
    try {
      const res = await fetchWithAuth(`/api/documents/${docId}/rename?new_name=${encodeURIComponent(newName)}`, {
        method: 'PATCH'
      })
      if (res.ok) {
        const updated = await res.json()
        setDocuments(prev => prev.map(doc => doc.id === docId ? { ...doc, name: updated.name } : doc))
        if (selectedDoc && selectedDoc.id === docId) {
          setSelectedDoc(prev => prev ? { ...prev, name: updated.name } : null)
        }
        showToast('Document renamed successfully', 'success')
      } else {
        showToast('Failed to rename document', 'error')
      }
    } catch (err) {
      console.error("Failed to rename document:", err)
      showToast('Error renaming document', 'error')
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    try {
      const res = await fetchWithAuth(`/api/documents/${docId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== docId))
        if (selectedDoc && selectedDoc.id === docId) {
          setSelectedDoc(null)
        }
        if (pollingIntervals.current[docId]) {
          clearInterval(pollingIntervals.current[docId])
          delete pollingIntervals.current[docId]
        }
        showToast('Document deleted successfully', 'success')
      } else {
        showToast('Failed to delete document', 'error')
      }
    } catch (err) {
      console.error("Failed to delete document:", err)
      showToast('Error deleting document', 'error')
    }
  }

  const handleDownloadDocument = (doc: Document) => {
    if (pdfUrl) {
      const a = window.document.createElement('a')
      a.href = pdfUrl
      a.download = doc.name
      window.document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }

  const handleRetryDocument = async (docId: string) => {
    try {
      const res = await fetchWithAuth(`/api/documents/${docId}/retry`, {
        method: 'POST'
      })
      if (res.ok) {
        setDocuments(prev => prev.map(doc => doc.id === docId ? { ...doc, status: 'processing', error_message: undefined } : doc))
        const doc = documents.find(d => d.id === docId)
        startStatusPolling(docId, doc ? doc.name : 'Document')
      }
    } catch (err) {
      console.error("Failed to retry processing:", err)
    }
  }

  const handleMoveToFolder = async (docId: string, folderId: string | null) => {
    try {
      const res = await fetchWithAuth(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId })
      })
      if (res.ok) {
        setDocuments(prev => prev.map(doc => doc.id === docId ? { ...doc, folder_id: folderId } : doc))
      }
    } catch (err) {
      console.error("Failed to move document:", err)
    }
  }

  const handleDeleteFolder = async (folderId: string) => {
    try {
      const res = await fetchWithAuth(`/api/folders/${folderId}`, { method: 'DELETE' })
      if (res.ok) {
        setFolders(prev => prev.filter(f => f.id !== folderId))
        setDocuments(prev => prev.map(doc => doc.folder_id === folderId ? { ...doc, folder_id: null } : doc))
        showToast('Folder deleted successfully', 'success')
      } else {
        showToast('Failed to delete folder', 'error')
      }
    } catch (err) {
      console.error("Failed to delete folder:", err)
      showToast('Error deleting folder', 'error')
    }
  }

  // 4. Triggered when UploadZone finishes uploading a PDF successfully
  const handleUploadSuccess = (docId: string, filename: string) => {
    const newDoc: Document = {
      id: docId,
      name: filename,
      file_size: 0,
      status: 'pending',
      created_at: new Date().toISOString()
    }
    setDocuments(prev => [newDoc, ...prev])
    startStatusPolling(docId, filename)
    showToast(`Document "${filename}" uploaded successfully!`, 'success')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checkingSession || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-xs text-zinc-500 mt-2 font-medium">Loading session...</p>
      </div>
    )
  }

  return (
    <main className="h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex relative overflow-hidden font-sans">
      
      {/* 1. Far Left Nav Sidebar */}
      <nav className={`${isSidebarCollapsed ? 'w-20' : 'w-20 md:w-64'} transition-all duration-300 ease-in-out bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col items-center md:items-start shrink-0 z-20`}>
        <div className={`p-4 md:p-6 w-full border-b border-zinc-100 dark:border-zinc-800 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-center md:justify-start'} gap-3`}>
          <div className="bg-violet-600 p-2 rounded-lg shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <h1 className={`text-sm font-bold text-zinc-900 dark:text-white ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>AskDocs</h1>
        </div>

        <div className="flex-1 w-full flex flex-col gap-2 p-3 md:p-4">
          <button 
            onClick={() => setShowUploadModal(true)}
            className={`w-full flex items-center gap-3 px-3 md:px-4 py-3 rounded-xl font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors mb-2 shadow-sm ${isSidebarCollapsed ? 'justify-center px-3' : ''}`}
            title="Upload PDF"
          >
            <Upload className="w-5 h-5 shrink-0" />
            <span className={`text-sm ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>Upload PDF</span>
          </button>

          <button 
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center gap-3 px-3 md:px-4 py-3 rounded-xl font-semibold transition-colors ${
              activeTab === 'chat' 
                ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950 font-medium'
            } ${isSidebarCollapsed ? 'justify-center px-3' : ''}`}
            title="Chat"
          >
            <MessageSquare className="w-5 h-5 shrink-0" />
            <span className={`text-sm ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>Chat</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('documents')}
            className={`w-full flex items-center gap-3 px-3 md:px-4 py-3 rounded-xl transition-colors ${
              activeTab === 'documents' 
                ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 font-semibold' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950 font-medium'
            } ${isSidebarCollapsed ? 'justify-center px-3' : ''}`}
            title="My Documents"
          >
            <FileText className="w-5 h-5 shrink-0" />
            <span className={`text-sm ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>My Documents</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('folders')}
            className={`w-full flex items-center gap-3 px-3 md:px-4 py-3 rounded-xl transition-colors ${
              activeTab === 'folders' 
                ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 font-semibold' 
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-950 font-medium'
            } ${isSidebarCollapsed ? 'justify-center px-3' : ''}`}
            title="Folders"
          >
            <Folder className="w-5 h-5 shrink-0" />
            <span className={`text-sm ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>Folders</span>
          </button>
          <button onClick={() => showToast('Settings module coming soon', 'info')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-3 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:bg-zinc-950 transition-colors font-medium ${isSidebarCollapsed ? 'justify-center px-3' : ''}`} title="Settings">
            <Settings className="w-5 h-5 shrink-0" />
            <span className={`text-sm ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>Settings</span>
          </button>
        </div>
        
        <div className="p-4 w-full border-t border-zinc-100 dark:border-zinc-800 mt-auto flex flex-col gap-2">

          <button onClick={handleLogout} className={`w-full flex items-center gap-3 px-3 md:px-4 py-3 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-medium ${isSidebarCollapsed ? 'justify-center px-3' : ''}`} title="Logout">
            <LogOut className="w-5 h-5 shrink-0" />
            <span className={`text-sm ${isSidebarCollapsed ? 'hidden' : 'hidden md:block'}`}>Logout</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-50 dark:bg-zinc-950">
        
        {/* Top Header (User Profile) */}
        <header className="h-[72px] bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 flex items-center justify-between shrink-0 z-10">
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              title="Toggle Sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-semibold text-zinc-400 capitalize hidden sm:block">
              {activeTab === 'documents' ? 'My Documents' : activeTab}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={toggleTheme} className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-400 transition-colors">
              {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-xs">
                {user?.email?.substring(0, 2).toUpperCase() || 'MR'}
              </div>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 hidden sm:block">
                {user?.email}
              </span>
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </header>

        {/* 3-Column Work Area */}
        <div className="flex-1 flex overflow-hidden">
          
          {activeTab === 'chat' && (
            <>

              {/* Column 3: Chat Area */}
              <section className="flex-1 flex flex-col min-w-0 bg-zinc-50 dark:bg-zinc-950 relative p-6">
                <ChatWindow
                  activeDocumentId={selectedDoc?.id || null}
                  activeDocumentName={selectedDoc?.name || null}
                  onViewPdfClick={() => setShowPdf(true)}
                  onConversationsChange={setChatConversations}
                  onActiveConversationChange={setActiveChatConversationId}
                  externalActiveConversationId={activeChatConversationId}
                />
                
                {/* PDF Modal/Overlay */}
                {showPdf && pdfUrl && (
                  <div className="absolute inset-0 z-50 bg-white dark:bg-zinc-900/95 backdrop-blur-sm p-6 flex flex-col shadow-2xl m-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-4 bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-red-500" />
                        {selectedDoc?.name}
                      </h3>
                      <button onClick={() => setShowPdf(false)} className="text-sm font-semibold text-zinc-500 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 px-4 py-1.5 rounded-lg transition-colors">
                        Close PDF
                      </button>
                    </div>
                    <div className="flex-1 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-inner bg-zinc-100">
                      <iframe 
                        src={pdfUrl} 
                        className="w-full h-full border-0"
                        title="PDF Preview"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Column 4: Right Sidebar (Chat History & Doc Info) */}
              <section className="w-72 bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 flex flex-col shrink-0 h-full overflow-y-auto custom-scrollbar p-6 space-y-6">
                
                {/* Chat History Card */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-4">Chat History</h3>
                  
                  {!selectedDoc ? (
                    <div className="text-center py-6 text-zinc-400 text-xs">
                      No document selected
                    </div>
                  ) : chatConversations.length === 0 ? (
                    <div className="text-center py-6 text-zinc-400 text-xs">
                      No previous chats
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chatConversations.map(conv => (
                        <button
                          key={conv.id}
                          onClick={() => setActiveChatConversationId(conv.id)}
                          className={`w-full text-left p-3 rounded-xl transition-colors ${
                            activeChatConversationId === conv.id
                              ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-950 text-zinc-700 dark:text-zinc-300 border border-transparent'
                          }`}
                        >
                          <div className="text-xs font-semibold truncate mb-1">{conv.title || 'Untitled Chat'}</div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(conv.created_at).toLocaleDateString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Document Info Card */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm">
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white mb-4">Document Info</h3>
                  
                  {selectedDoc ? (
                    <>
                      <div className="flex items-start gap-3 mb-4">
                        <div className="bg-red-50 p-2 rounded-lg shrink-0">
                          <FileText className="w-4 h-4 text-red-500" />
                        </div>
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white leading-tight mt-1">
                          {selectedDoc.name}
                        </span>
                      </div>

                      <div className="space-y-3 mb-5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Pages</span>
                          <span className="font-semibold text-zinc-900">{selectedDoc.page_count || '-'}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">Size</span>
                          <span className="font-semibold text-zinc-900">{(selectedDoc.file_size / 1e6).toFixed(1)} MB</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => setShowPdf(true)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" /> View Full PDF
                      </button>
                    </>
                  ) : (
                    <div className="text-center py-6 text-zinc-400 text-xs">
                      No document selected
                    </div>
                  )}
                </div>

              </section>
            </>
          )}

          {activeTab === 'documents' && (
            <MyDocumentsView
              documents={documents}
              folders={folders}
              onDeleteDocument={handleDeleteDocument}
              onMoveToFolder={handleMoveToFolder}
              onUploadSuccess={(docId, filename) => {
                 handleUploadSuccess(docId, filename)
                 setActiveTab('chat')
              }}
              onSelectDocument={(doc) => {
                setSelectedDoc(doc)
                setActiveTab('chat')
              }}
              onConfirm={showConfirmModal}
            />
          )}

          {activeTab === 'folders' && (
            <FoldersView
              documents={documents}
              folders={folders}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
              onSelectDocument={(doc) => {
                setSelectedDoc(doc)
                setActiveTab('chat')
              }}
              onConfirm={showConfirmModal}
            />
          )}

        </div>
      </div>

      {/* Quick Upload Modal */}
      {showUploadModal && (
        <div className="absolute inset-0 z-[100] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-zinc-900 dark:text-white">Upload Document</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-zinc-400 hover:text-zinc-700 p-2">
                ✕
              </button>
            </div>
            <div className="p-6 bg-zinc-50 dark:bg-zinc-950/50">
              <UploadZone onUploadSuccess={(docId, filename) => {
                handleUploadSuccess(docId, filename)
                setShowUploadModal(false)
                setActiveTab('chat')
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-[160] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <ConfirmModalContent 
            confirmModal={confirmModal} 
            setConfirmModal={setConfirmModal} 
          />
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400'
            }`}
          >
            {toast.type === 'success' && (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-semibold leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </main>
  )
}

// Custom confirmation modal content helper (manages input state locally)
const ConfirmModalContent = ({ confirmModal, setConfirmModal }: { confirmModal: any, setConfirmModal: any }) => {
  const [inputValue, setInputValue] = React.useState('')
  
  const handleConfirm = () => {
    if (confirmModal.showInput) {
      confirmModal.onConfirmInput?.(inputValue)
    } else {
      confirmModal.onConfirm?.()
    }
    setConfirmModal(null)
  }
  
  return (
    <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-scale-up">
      <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="font-bold text-zinc-900 dark:text-white">{confirmModal.title}</h3>
        <button 
          onClick={() => setConfirmModal(null)} 
          className="text-zinc-400 hover:text-zinc-750 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {confirmModal.message}
        </p>
        
        {confirmModal.showInput && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmModal.inputPlaceholder}
            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 font-semibold"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
          />
        )}
      </div>
      <div className="p-5 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
        <button
          onClick={() => setConfirmModal(null)}
          className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-xl transition-colors"
        >
          {confirmModal.cancelText || 'Cancel'}
        </button>
        <button
          onClick={handleConfirm}
          className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition-colors ${
            confirmModal.isDestructive 
              ? 'bg-red-600 hover:bg-red-700 dark:bg-red-650 dark:hover:bg-red-700' 
              : 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-700'
          }`}
        >
          {confirmModal.confirmText || 'Confirm'}
        </button>
      </div>
    </div>
  )
}
