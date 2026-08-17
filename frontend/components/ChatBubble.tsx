'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import Mermaid from './Mermaid'

interface ChatBubbleProps {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatBubble({ role, content }: ChatBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex w-full my-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${
          isUser 
            ? 'bg-violet-600 border-violet-700 text-white rounded-br-none' 
            : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-bl-none'
        }`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            code({ node, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              const language = match ? match[1] : ''
              const isMermaid = language === 'mermaid'

              if (isMermaid) {
                return <Mermaid chart={String(children)} />
              }

              // Check if code block is inline or block
              const isInline = !className

              return isInline ? (
                <code 
                  className="bg-zinc-100 dark:bg-zinc-950/80 px-1.5 py-0.5 rounded text-xs text-violet-600 font-mono border border-zinc-200 dark:border-zinc-800/80" 
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <pre className="bg-zinc-50 dark:bg-zinc-950/90 p-4 rounded-xl text-xs font-mono text-zinc-700 overflow-x-auto my-3 border border-zinc-200 dark:border-zinc-800/80 shadow-sm">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              )
            },
            // Beautiful tables formatting
            table({ children }) {
              return (
                <div className="overflow-x-auto my-4 border border-zinc-200 dark:border-zinc-800/80 rounded-xl">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm text-left">
                    {children}
                  </table>
                </div>
              )
            },
            thead({ children }) {
              return <thead className="bg-zinc-100 dark:bg-zinc-950/80 text-zinc-700 font-semibold">{children}</thead>
            },
            tbody({ children }) {
              return <tbody className="divide-y divide-zinc-100 bg-white dark:bg-zinc-900/60">{children}</tbody>
            },
            tr({ children }) {
              return <tr className="hover:bg-zinc-50 dark:bg-zinc-950/90 transition-colors">{children}</tr>
            },
            th({ children }) {
              return <th className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-200 font-medium">{children}</th>
            },
            td({ children }) {
              return <td className="px-4 py-2.5 text-zinc-700 dark:text-zinc-300 font-normal">{children}</td>
            },
            // Styled lists formatting
            ul({ children }) {
              return <ul className="list-disc pl-6 my-2.5 space-y-1 text-sm leading-relaxed">{children}</ul>
            },
            ol({ children }) {
              return <ol className="list-decimal pl-6 my-2.5 space-y-1 text-sm leading-relaxed">{children}</ol>
            },
            li({ children }) {
              return <li className="text-zinc-800 dark:text-zinc-100">{children}</li>
            },
            p({ children }) {
              return <p className="mb-2 last:mb-0 leading-relaxed text-sm text-zinc-700 dark:text-zinc-300">{children}</p>
            },
            h1({ children }) { return <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-2">{children}</h1> },
            h2({ children }) { return <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1">{children}</h2> },
            h3({ children }) { return <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 mt-2 mb-1">{children}</h3> }
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
