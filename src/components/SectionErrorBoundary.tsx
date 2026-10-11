import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { resetFailedLazies } from '../utils/lazyWithRetry';

interface Props {
  children: React.ReactNode;
  /** «Раздел не открылся» by default */
  title?: string;
}

/**
 * A section of the admin panel (or the profile) that failed to load or draw shows the error inside its place, and the
 * panel with its menu stays: the top AppErrorBoundary would replace the whole site. The error itself is reported by
 * createRoot's onCaughtError (main.tsx), so nothing is reported here. «Повторить» loads the failed chunks again.
 * Put a `key` on it to start clean when the section changes.
 */
export class SectionErrorBoundary extends React.Component<Props, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown') };
  }

  private retry = () => {
    resetFailedLazies();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="neu-flat rounded-3xl p-5 text-center space-y-3 my-4">
        <div className="w-11 h-11 rounded-2xl neu-inset mx-auto flex items-center justify-center text-warning">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-base font-extrabold text-[#2D3A4E]">{this.props.title ?? 'Раздел не открылся'}</h2>
        <p className="text-sm text-[#4E5C70]">
          Не получилось загрузить или показать раздел. Повторите, а если не помогает, обновите страницу: несохранённое в этом разделе может пропасть.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={this.retry} className="neu-button-accent rounded-full px-5 h-11 font-bold text-sm cursor-pointer">
            Повторить
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="neu-button rounded-full px-5 h-11 font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }
}
