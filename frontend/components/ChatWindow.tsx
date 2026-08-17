'use client'

import React, { useState, useRef, useEffect } from 'react'
import { fetchWithAuth } from '@/lib/api'
import ChatBubble from './ChatBubble'
import { Send, Loader2, Bot, User, Trash2, Plus, StopCircle, MessageSquare } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatWindowProps {
  activeDocumentId: string | null
  activeDocumentName: string | null
  onViewPdfClick: () => void
  onConversationsChange?: (conversations: any[]) => void
  onActiveConversationChange?: (id: string | null) => void
  externalActiveConversationId?: string | null
}

export default function ChatWindow({ 
  activeDocumentId, 
  activeDocumentName, 
  onViewPdfClick,
  onConversationsChange,
  onActiveConversationChange,
  externalActiveConversationId
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Scroll to bottom when messages or loading states update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Fetch previous conversations when active document changes
  useEffect(() => {
    setMessages([])
    setConversations([])
    onConversationsChange?.([])
    setActiveConversationId(null)
    onActiveConversationChange?.(null)
    
    if (activeDocumentId) {
      loadConversations()
    }
  }, [activeDocumentId])

  useEffect(() => {
    if (externalActiveConversationId !== undefined && externalActiveConversationId !== activeConversationId) {
      setActiveConversationId(externalActiveConversationId)
    }
  }, [externalActiveConversationId])

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadMessages()
    } else {
      setMessages([])
    }
  }, [activeConversationId])

  const loadConversations = async () => {
    try {
      const res = await fetchWithAuth(`/api/chat/conversations?document_id=${activeDocumentId}`)
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
        onConversationsChange?.(data)
        if (data.length > 0) {
          setActiveConversationId(data[0].id)
          onActiveConversationChange?.(data[0].id)
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err)
    }
  }

  const loadMessages = async () => {
    try {
      const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.map((m: any) => ({ role: m.role, content: m.content })))
      }
    } catch (err) {
      console.error("Failed to load messages:", err)
    }
  }

  const handleNewConversation = async () => {
    if (!activeDocumentId) return
    const title = window.prompt("Enter Chat Title:", `Chat session ${conversations.length + 1}`)
    if (!title || !title.trim()) return

    try {
      const res = await fetchWithAuth('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: activeDocumentId,
          title: title.trim()
        })
      })
      if (res.ok) {
        const data = await res.json()
        setConversations(prev => [data, ...prev])
        setActiveConversationId(data.id)
        setMessages([])
      }
    } catch (err) {
      console.error("Failed to create conversation:", err)
    }
  }

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setLoading(false)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !activeDocumentId || loading) return

    const userQuery = input.trim()
    setInput('')

    let currentConvId = activeConversationId

    // 1. Auto-create conversation if none is active
    if (!currentConvId) {
      try {
        const title = userQuery.slice(0, 30) + (userQuery.length > 30 ? '...' : '')
        const convRes = await fetchWithAuth('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_id: activeDocumentId,
            title: title
          })
        })
        if (convRes.ok) {
          const convData = await convRes.json()
          setConversations(prev => [convData, ...prev])
          setActiveConversationId(convData.id)
          onActiveConversationChange?.(convData.id)
          currentConvId = convData.id
          
          // Trigger parent callback safely outside state setter block
          setTimeout(() => {
            onConversationsChange?.([convData, ...conversations])
          }, 0)
        } else {
          throw new Error("Could not initialize chat session.")
        }
      } catch (err) {
        console.error("Auto-conversation failure:", err)
        return
      }
    }

    // Append user message
    setMessages(prev => [...prev, { role: 'user', content: userQuery }])
    setLoading(true)

    // Pre-inject empty assistant bubble to receive tokens
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetchWithAuth('/api/chat/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          document_id: activeDocumentId,
          question: userQuery,
          conversation_id: currentConvId,
          // Sends up to the last 10 messages for conversational context
          history: messages.slice(-10)
        })
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.detail || 'Connection to chatbot failed.')
      }

      if (!response.body) {
        throw new Error('Readable stream not returned by server.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullResponseText = ''
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const cleanLine = line.trim()
          if (!cleanLine.startsWith('data: ')) continue

          const dataPayload = cleanLine.slice(6).trim()
          if (dataPayload === '[DONE]') break

          try {
            const parsed = JSON.parse(dataPayload)
            if (parsed.token) {
              fullResponseText += parsed.token
              setMessages(prev => {
                const updated = [...prev]
                if (updated.length > 0) {
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: fullResponseText
                  }
                }
                return updated
              })
            } else if (parsed.error) {
              // Show backend errors as a visible message in the chat bubble
              const errorMsg = `⚠️ ${parsed.error}`
              setMessages(prev => {
                const updated = [...prev]
                if (updated.length > 0) {
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: errorMsg
                  }
                }
                return updated
              })
            }
          } catch (jsonErr) {
            // Ignore incomplete JSON buffers in stream chunks
          }
        }
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream generation aborted by user.')
        return
      }
      console.error('SSE chat error:', err)
      setMessages(prev => {
        const updated = [...prev]
        if (updated.length > 0) {
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `Error: ${err.message || 'Failed to stream response.'}`
          }
        }
        return updated
      })
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  const clearChatHistory = async () => {
    if (!activeConversationId) {
      setMessages([])
      return
    }

    if (confirm('Are you sure you want to delete this chat conversation? This cannot be undone.')) {
      try {
        const res = await fetchWithAuth(`/api/chat/conversations/${activeConversationId}`, {
          method: 'DELETE'
        })
        if (res.ok) {
          setMessages([])
          
          // Remove from local conversations list
          const newConvs = conversations.filter(c => c.id !== activeConversationId)
          onConversationsChange?.(newConvs)
          onActiveConversationChange?.(null)
          
        } else {
          console.error("Failed to delete conversation on server")
        }
      } catch (err) {
        console.error("Error deleting conversation:", err)
      }
    }
  }

  if (!activeDocumentId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-zinc-900 min-h-0 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-sm">
        <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 p-6 rounded-3xl mb-4 shadow-sm animate-pulse">
          <Bot className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
        </div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1.5">No Active Document</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
          Select an uploaded PDF from the sidebar or drop a new file below to start chatting with the AI.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm relative min-h-0">
      {/* Header bar */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800 px-6 py-4 flex items-center justify-between gap-4 z-10">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-white truncate">
            Chatting with: <span className="font-mono text-violet-600 dark:text-violet-400">{activeDocumentName}</span>
          </h3>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-0.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            AI ready to analyze
          </p>
        </div>

        {/* Sessions & Actions Toolbar */}
        <div className="flex items-center gap-2 shrink-0">

          <button
            onClick={() => setActiveConversationId(null)}
            className="flex items-center gap-1 bg-violet-50 dark:bg-violet-500/20 hover:bg-violet-100 dark:hover:bg-violet-500/30 text-violet-700 dark:text-violet-300 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
            title="New Conversation"
          >
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>

          {onViewPdfClick && (
            <button
              onClick={onViewPdfClick}
              className="flex items-center gap-1 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm"
            >
              View PDF
            </button>
          )}

          {messages.length > 0 && (
            <button
              onClick={clearChatHistory}
              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg transition-all"
              title="Clear Messages"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth custom-scrollbar relative bg-zinc-50/50 dark:bg-zinc-950/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-4">
            <MessageSquare className="w-12 h-12 opacity-50" />
            <p className="text-sm font-medium">Send a message to start the conversation</p>
          </div>
        ) : (
          <div className="flex flex-col max-w-3xl mx-auto w-full pb-4 gap-2">
            {messages.map((msg, idx) => (
              <ChatBubble key={idx} role={msg.role} content={msg.content} />
            ))}
            
            {loading && !messages.find(m => m.role === 'assistant' && m.content === '') && (
              <div className="flex justify-start my-3">
                <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 px-5 py-4 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-3">
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce delay-75"></span>
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce delay-150"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
        <form 
          onSubmit={handleSend}
          className="max-w-3xl mx-auto flex gap-3 relative"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Ask a question about this document..."
            className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm rounded-xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all placeholder:text-zinc-400 disabled:opacity-50 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 shadow-sm"
          />
          {loading ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"
              title="Stop generating"
            >
              <StopCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2 top-2 bottom-2 px-5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed font-semibold flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:block text-sm">Send</span>
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
