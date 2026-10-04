import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { errorText, isStaleBuildError } from '../utils/clientErrors';

interface State {
  error: unknown;
}

const reload = () => window.location.reload();

/**
 * A screen that failed to draw no longer takes the whole site down to a white page (docs/ops-plan.md, stage 2):
 * React 19 removes the app on an error it cannot hand to a boundary. The customer gets «Обновить страницу»; the error
 * goes to the owner's log from createRoot's onCaughtError (main.tsx). When the site was published again while the
 * tab was open, a screen's code is gone from the old address: the page says so and that the cart is kept
 * (it is in the browser).
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('unknown') };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const updated = isStaleBuildError(errorText(this.state.error).message);
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div role="alert" className="neu-flat rounded-3xl p-6 w-full max-w-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl neu-inset mx-auto flex items-center justify-center text-warning">
            {updated ? <RefreshCw className="w-6 h-6" aria-hidden="true" /> : <AlertTriangle className="w-6 h-6" aria-hidden="true" />}
          </div>
          <h1 className="font-display text-lg font-extrabold text-[#2D3A4E]">
            {updated ? 'Сайт обновился' : 'Что-то пошло не так'}
          </h1>
          <p className="text-sm text-[#4E5C70]">
            {updated
              ? 'Пока страница была открыта, вышла новая версия магазина. Обновите страницу, корзина и избранное сохранятся.'
              : 'Страница не открылась из-за ошибки. Обновите страницу, корзина и избранное сохранятся.'}
          </p>
          <button
            type="button"
            onClick={reload}
            className="neu-button-accent rounded-full px-6 h-11 font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Обновить страницу
          </button>
        </div>
      </main>
    );
  }
}
