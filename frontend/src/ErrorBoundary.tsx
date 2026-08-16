import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render/runtime errors in the component tree so the whole app doesn't white-screen. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, maxWidth: 640, margin: '80px auto', textAlign: 'center' }}>
          <h2 style={{ color: '#c0392b' }}>页面出现了错误</h2>
          <p style={{ color: '#555' }}>{this.state.error.message}</p>
          <button
            onClick={this.handleReload}
            style={{ marginTop: 16, padding: '8px 20px', cursor: 'pointer' }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
