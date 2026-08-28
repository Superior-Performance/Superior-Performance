import { Component } from 'react'
import { RefreshCw } from 'lucide-react'
import Logo from './Logo'

// Catches render errors anywhere below it in the tree — React only offers
// this through a class component's componentDidCatch/getDerivedStateFromError,
// there's no hook equivalent. Without this, an unhandled render error means
// React unmounts the whole app and the user sees a blank white screen with
// no way back in short of knowing to hit refresh themselves.
export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-sp-ink-900 px-6">
        <div className="text-center max-w-sm">
          <Logo variant="icon" className="h-12 w-12 mx-auto mb-6" />
          <h1 className="text-white font-bold text-lg mb-2">Something went wrong</h1>
          <p className="text-sp-ink-300 text-sm mb-6">
            This page hit an unexpected error. Reloading usually fixes it — your data is safe either way.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn-brand inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm"
          >
            <RefreshCw size={14} />
            Reload
          </button>
        </div>
      </div>
    )
  }
}
