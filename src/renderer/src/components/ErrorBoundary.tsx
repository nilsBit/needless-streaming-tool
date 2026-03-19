import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: string;
}

interface State {
  hasError: boolean;
  error: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel error-panel">
          <h2>⚠️ {this.props.fallback || 'Fehler'}</h2>
          <p className="panel-desc">Etwas ist schiefgelaufen.</p>
          <p className="error-message">{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false, error: '' })}>
            Nochmal versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
