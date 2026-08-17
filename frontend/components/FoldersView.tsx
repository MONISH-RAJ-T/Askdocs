import React, { useState } from 'react'
import { Folder, FileText, ChevronRight, Trash2, Plus, Loader2 } from 'lucide-react'

interface FoldersViewProps {
  documents: any[]
  folders: any[]
  onCreateFolder: () => void
  onDeleteFolder: (id: string) => void
  onSelectDocument: (doc: any) => void
  onConfirm: (options: any) => void
}

export default function FoldersView({
  documents,
  folders,
  onCreateFolder,
  onDeleteFolder,
  onSelectDocument,
  onConfirm
}: FoldersViewProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

  const activeFolder = folders.find(f => f.id === selectedFolderId)
  const folderDocuments = activeFolder 
    ? documents.filter(d => d.folder_id === activeFolder.id)
    : []

  const handleDeleteFolder = (e: React.MouseEvent, folder: any) => {
    e.stopPropagation()
    onConfirm({
      title: 'Delete Folder',
      message: `Delete folder "${folder.name}"? Documents inside will not be deleted, but will be removed from this folder.`,
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: () => {
        onDeleteFolder(folder.id)
        if (selectedFolderId === folder.id) {
          setSelectedFolderId(null)
        }
      }
    })
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      
      {/* Left pane: Folders List */}
      <div className="w-1/3 min-w-[250px] border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col h-full">
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Folders</h2>
          <button 
            onClick={onCreateFolder}
            className="p-2 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
            title="New Folder"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {folders.length === 0 ? (
            <div className="text-center p-6 text-zinc-400">
              <Folder className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No folders created yet</p>
            </div>
          ) : (
            folders.map(folder => {
              const docCount = documents.filter(d => d.folder_id === folder.id).length
              return (
                <div 
                  key={folder.id}
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors group ${
                    selectedFolderId === folder.id 
                      ? 'bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20' 
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-950 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Folder className={`w-5 h-5 ${selectedFolderId === folder.id ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400'}`} />
                    <div>
                      <h4 className={`text-sm font-semibold ${selectedFolderId === folder.id ? 'text-violet-900 dark:text-violet-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {folder.name}
                      </h4>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{docCount} documents</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleDeleteFolder(e, folder)}
                      className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className={`w-4 h-4 ${selectedFolderId === folder.id ? 'text-violet-400' : 'text-zinc-300'}`} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right pane: Documents in Folder */}
      <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
        {activeFolder ? (
          <>
            <div className="p-6 md:p-10 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                <Folder className="w-6 h-6 text-violet-500" />
                {activeFolder.name}
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm">
                Contains {folderDocuments.length} documents
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {folderDocuments.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-zinc-400">
                    <p>No documents in this folder.</p>
                    <p className="text-sm mt-1">Go to My Documents to assign files here.</p>
                  </div>
                ) : (
                  folderDocuments.map(doc => (
                    <div 
                      key={doc.id}
                      onClick={() => onSelectDocument(doc)}
                      className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2 bg-violet-50 dark:bg-violet-500/10 rounded-lg text-violet-600 dark:text-violet-400">
                          <FileText className="w-5 h-5" />
                        </div>
                        {doc.status === 'ready' ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        ) : (
                          <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
                        )}
                      </div>
                      <h4 className="font-semibold text-zinc-900 dark:text-white text-sm line-clamp-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                        {doc.name}
                      </h4>
                      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                        <span className="text-violet-600 dark:text-violet-400 font-sans font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          Chat →
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400">
            <Folder className="w-16 h-16 text-zinc-200 dark:text-zinc-800 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-600 dark:text-zinc-300">Select a folder</h3>
            <p className="text-sm mt-1 max-w-[250px] text-center">Choose a folder from the sidebar to view its documents.</p>
          </div>
        )}
      </div>
    </div>
  )
}
