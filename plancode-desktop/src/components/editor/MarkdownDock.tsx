import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  content: string
  emptyTitle?: string
  emptyDescription?: string
}

export function MarkdownDock({
  content,
  emptyTitle = '等待内容输出',
  emptyDescription = '运行 Agent 后，这里会展示 Markdown 结果预览。',
}: Props) {
  if (!content) {
    return (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
        <div>
          <h4 className="text-lg font-medium text-text-primary">{emptyTitle}</h4>
          <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">{emptyDescription}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="prose prose-invert prose-sm max-w-none rounded-[28px] border border-white/10 bg-white/[0.03] p-6 prose-headings:font-serif prose-headings:text-text-primary prose-p:text-text-secondary prose-strong:text-text-primary prose-code:text-[#ffd2a8] prose-pre:rounded-2xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-[#07101d]">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
    </div>
  )
}
