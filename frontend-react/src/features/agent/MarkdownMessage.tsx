import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { useState, type ComponentPropsWithoutRef } from 'react'

function CodeBlock({
  className,
  children,
}: ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false)
  const text = String(children ?? '').replace(/\n$/, '')
  const isBlock =
    /language-/.test(className ?? '') || text.includes('\n')

  if (!isBlock) {
    return (
      <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[12.5px] text-ink-secondary">
        {children}
      </code>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard may be unavailable; copying is non-essential.
    }
  }

  return (
    <span className="group relative my-2 block overflow-hidden rounded-control border border-line bg-surface-muted">
      <button
        type="button"
        onClick={copy}
        aria-label="复制代码"
        className="absolute right-2 top-2 grid size-6 place-items-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-surface hover:text-ink group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="overflow-x-auto px-3 py-2.5 pr-10 font-mono text-[12.5px] leading-5 text-ink-secondary">
        <code className={className}>{text}</code>
      </pre>
    </span>
  )
}

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="space-y-2.5 text-[13.5px] leading-6 text-ink [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="pt-1 text-base font-semibold text-ink">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="pt-1 text-[15px] font-semibold text-ink">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="pt-0.5 text-sm font-semibold text-ink">{children}</h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 marker:text-ink-faint">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5 marker:text-ink-faint">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3 text-ink-muted">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-control border border-line">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-line bg-surface-muted px-3 py-1.5 text-left font-medium text-ink-secondary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line px-3 py-1.5 text-ink-secondary">{children}</td>
          ),
          hr: () => <hr className="border-line" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
