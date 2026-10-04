import { useState } from 'react';
import { User, Database } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

import type { ProfileScreenProps } from '../ProfileScreen';

/** Account and sign-in: who is signed in, or «Войти через Google» (the admin sees what the shop data is) */
export function ProfileAccountCard({ onShowToast }: { onShowToast: ProfileScreenProps['onShowToast'] }) {
  const { currentUser, loginWithGoogle, isAdmin: isFirebaseAdmin } = useAuth();
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const handleGoogleAuthClick = async () => {
    setIsGoogleSigningIn(true);
    try {
      const user = await loginWithGoogle();
      if (user) {
        onShowToast(`Вы успешно вошли: ${user.displayName || user.email}`, 'success');
      }
    } catch (err: unknown) {
      console.error('Google Auth Error:', err);
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'auth/popup-blocked') {
        onShowToast('Окно входа заблокировано браузером. Разрешите всплывающие окна или откройте сайт в новой вкладке.', 'error');
      } else if (errCode === 'auth/popup-closed-by-user') {
        onShowToast('Окно авторизации закрыто', 'info');
      } else {
        onShowToast('Ошибка авторизации через Google', 'error');
      }
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  return (
    <>
      <div className="neu-flat rounded-3xl p-3.5 space-y-3">
        <div className="neu-inset rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-flat-sm flex items-center justify-center text-accent shrink-0">
                {isFirebaseAdmin ? <Database className="w-5 h-5 stroke-[2.2]" /> : <User className="w-5 h-5 stroke-[2.2]" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-[#2D3A4E]">{isFirebaseAdmin ? 'Данные магазина' : 'Аккаунт'}</h3>
                </div>
                <p className="text-xs text-[#4E5C70]">
                  {isFirebaseAdmin
                    ? 'Каталог, заказы, акции и чат сохраняются в базе при каждом изменении'
                    : 'Заказы, адреса и переписка сохраняются на всех ваших устройствах'}
                </p>
              </div>
            </div>

          </div>

          {/* User Auth Status Details */}
          {currentUser ? (
            <div className="p-2.5 rounded-xl bg-[#BAC5D5]/20 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || ''}
                    className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/60"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full neu-flat-sm flex items-center justify-center font-bold text-accent shrink-0 text-xs">
                    {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-[#2D3A4E] truncate">
                    {currentUser.displayName || 'Пользователь Google'}
                  </p>
                  <p className="text-xs text-[#4E5C70] truncate">{currentUser.email}</p>
                </div>
              </div>

            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-[#BAC5D5]/20 space-y-2 text-xs">
              <p className="text-[#4E5C70] text-xs leading-relaxed">
                Войдите через Google, чтобы видеть историю заказов и переписку с поддержкой на любом устройстве:
              </p>
              <button
                type="button"
                onClick={handleGoogleAuthClick}
                disabled={isGoogleSigningIn}
                className="w-full neu-button rounded-xl py-2 px-3 flex items-center justify-center gap-2 font-bold text-[#2D3A4E] hover:text-accent transition-all text-xs cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{isGoogleSigningIn ? 'Вход…' : 'Войти через Google'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
