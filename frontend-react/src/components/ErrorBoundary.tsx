import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Zeno UI crashed:', error, info.componentStack)
    try {
      // 尽力而为上报到后端指标环；不阻断降级 UI（keepalive 保证页面卸载时也能发出）
      const payload = JSON.stringify({
        message: `${error.name}: ${error.message}`.slice(0, 300),
        source: 'react-error-boundary',
        url: window.location.pathname.slice(0, 200),
      })
      void fetch('/api/ops/client-errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: payload,
        keepalive: true,
      }).catch(() => undefined)
    } catch {
      // 上报失败不影响用户
    }
  }

  private reload = () => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center">
          <h1 className="text-base font-semibold text-ink">
            页面出现问题
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-ink-muted">
            你的数据已保存在本地与服务器，可以安全刷新重试。
          </p>
          {this.state.error.message ? (
            <p className="mt-3 break-words rounded-control border border-line bg-surface-subtle p-2 text-xs text-ink-muted">
              {this.state.error.message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={this.reload}
            className="mt-4 inline-flex h-[var(--control-h)] items-center gap-1.5 rounded-control bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="size-4" />
            刷新页面
          </button>
        </div>
      </div>
    )
  }
}
