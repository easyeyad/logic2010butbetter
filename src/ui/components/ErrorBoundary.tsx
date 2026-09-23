import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Notice } from './Notice';

interface State {
  error: Error | null;
}

/** Per-page boundary: a crash in one page never takes down the shell. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[Logic Studio] page error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const notImpl = /not implemented/i.test(this.state.error.message);
      return (
        <div style={{ padding: 'var(--sp-6)' }}>
          <Notice
            tone="warn"
            role="alert"
            title={`${this.props.label ?? 'This page'} couldn't be displayed`}
            actions={
              <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            }
          >
            {notImpl ? 'Part of the logic engine is still being built.' : this.state.error.message}
          </Notice>
        </div>
      );
    }
    return this.props.children;
  }
}
