import React from 'react'
import { FileText, Trash2, Folder, Loader2 } from 'lucide-react'
import UploadZone from './UploadZone'

interface MyDocumentsViewProps {
  documents: any[]
  folders: any[]
  onDeleteDocument: (id: string) => void
  onMoveToFolder: (docId: string, folderId: string | null) => void
  onUploadSuccess: (docId: string, filename: string) => void
  onSelectDocument: (doc: any) => void
  onConfirm: (options: any) => void
}

export default function MyDocumentsView({ 
  documents, 
  folders, 
  onDeleteDocument, 
  onMoveToFolder,
  onUploadSuccess,
  onSelectDocument,
  onConfirm
}: MyDocumentsViewProps) {

  const handleDelete = (doc: any) => {
    onConfirm({
      title: 'Delete Document',
      message: `Are you sure you want to delete "${doc.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: () => onDeleteDocument(doc.id)
    })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-6 md:p-10 space-y-8">
      
      {/* Header & Upload */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">My Documents</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage all your uploaded files across the workspace.</p>
        </div>
      </div>

      {/* Documents Table */}
      {/* Documents Table - Desktop only */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Size</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Folder</th>
              <th className="px-6 py-4 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {documents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
                  <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                  <p>No documents uploaded yet.</p>
                </td>
              </tr>
            ) : (
              documents.map(doc => (
                <tr key={doc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div 
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => onSelectDocument(doc)}
                    >
                      <div className="p-2 bg-violet-50 dark:bg-violet-500/10 rounded-lg text-violet-600 dark:text-violet-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-zinc-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                        {doc.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {doc.status === 'ready' ? (
                      <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-full">
                        Ready
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 font-mono">
                    {(doc.file_size / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={doc.folder_id || ''}
                      onChange={(e) => onMoveToFolder(doc.id, e.target.value || null)}
                      className="text-xs bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">None</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => onSelectDocument(doc)}
                      className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Chat
                    </button>
                    <button 
                      onClick={() => handleDelete(doc)}
                      className="text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                      title="Delete Document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view - Mobile only */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {documents.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-12 text-center text-zinc-500 dark:text-zinc-400">
            <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          documents.map(doc => (
            <div key={doc.id} className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
              <div 
                className="flex items-start gap-3 cursor-pointer"
                onClick={() => onSelectDocument(doc)}
              >
                <div className="p-2 bg-violet-50 dark:bg-violet-500/10 rounded-lg text-violet-600 dark:text-violet-400 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-zinc-900 dark:text-white text-sm break-all leading-snug">
                    {doc.name}
                  </h4>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">{(doc.file_size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <div>
                  {doc.status === 'ready' ? (
                    <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-full">
                      Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                      <Loader2 className="w-3 h-3 animate-spin text-zinc-400" /> Processing
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-450 dark:text-zinc-400 font-semibold">Folder:</span>
                  <select
                    value={doc.folder_id || ''}
                    onChange={(e) => onMoveToFolder(doc.id, e.target.value || null)}
                    className="text-[10px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">None</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <button 
                  onClick={() => onSelectDocument(doc)}
                  className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 px-3 py-2 rounded-lg transition-colors flex-1 text-center bg-violet-500/5"
                >
                  Chat
                </button>
                <button 
                  onClick={() => handleDelete(doc)}
                  className="text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-550/10 p-1.5 rounded-lg transition-colors border border-zinc-250 dark:border-zinc-800"
                  title="Delete Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
