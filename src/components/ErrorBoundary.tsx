import React, { Component, ErrorInfo } from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          padding: '24px',
          margin: '16px',
          border: '2px solid #dc2626',
          borderRadius: '8px',
          backgroundColor: '#fef2f2',
          fontFamily: 'monospace',
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ marginBottom: '8px', fontWeight: 600 }}>{this.state.error.toString()}</p>
          {this.state.errorInfo && (
            <pre style={{
              overflow: 'auto',
              fontSize: '12px',
              padding: '12px',
              backgroundColor: 'var(--color-surface-white)',
              borderRadius: '4px',
              maxHeight: '300px',
            }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
