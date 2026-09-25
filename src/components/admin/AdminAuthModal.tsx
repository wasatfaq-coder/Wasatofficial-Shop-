import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  X,
  KeyRound,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { validateAdminLogin } from '../../utils/adminAuth';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setPassword('');
      setShowPassword(false);
      setError(null);
      setShake(false);
      const timer = setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanUsername = username.trim();
    const cleanPassword = password;

    const isValid = validateAdminLogin(cleanUsername, cleanPassword);

    if (isValid) {
      setError(null);
      onSuccess();
      if (onShowToast) {
        onShowToast('Успешная авторизация! Доступ к панели администратора открыт', 'success');
      }
    } else {
      setError('Неверный логин или пароль. Пожалуйста, проверьте введенные данные.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      if (onShowToast) {
        onShowToast('Ошибка входа: неверные учетные данные', 'error');
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="admin-auth-overlay"
          id="admin-auth-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/50 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="admin-auth-card"
            id="admin-auth-card"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className={`neu-modal rounded-3xl p-5 sm:p-7 max-w-md w-full border border-white/90 text-[#2D3A4E] relative transition-transform z-10 ${
              shake ? 'animate-bounce' : ''
            }`}
          >
            {/* Close button */}
        <button
          id="admin-auth-close-btn"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#5C6B80] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
          title="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon and Title */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 rounded-2xl neu-flat flex items-center justify-center text-[#5F6ED0] mx-auto relative group">
            <div className="w-10 h-10 rounded-xl neu-inset flex items-center justify-center text-[#5F6ED0]">
              <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#BAC5D5]/30 text-[11px] font-bold text-[#5F6ED0] mb-1">
              <KeyRound className="w-3 h-3" />
              <span>Безопасный доступ</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[#2D3A4E] tracking-tight">
              Панель администратора
            </h3>
            <p className="text-xs text-[#5C6B80] max-w-xs mx-auto mt-1">
              Введите учетные данные для доступа к управлению каталогом, заказами и складом
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            id="admin-auth-error-banner"
            className="mb-4 p-3 rounded-2xl bg-danger-soft border border-danger/25 text-danger text-xs font-bold flex items-start gap-2 animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-danger mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username field */}
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="admin-username-input"
              className="text-xs font-extrabold text-[#2D3A4E] block px-1"
            >
              Логин администратора
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-[#5C6B80] pointer-events-none">
                <User className="w-4 h-4" />
              </div>
              <input
                id="admin-username-input"
                ref={usernameInputRef}
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Введите логин"
                className="w-full pl-10 pr-4 py-2.5 neu-inset rounded-2xl bg-[#E3E8EF] text-xs sm:text-sm font-bold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none focus:ring-2 focus:ring-[#5F6ED0]/40 transition-all"
                required
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="admin-password-input"
              className="text-xs font-extrabold text-[#2D3A4E] block px-1"
            >
              Пароль
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-[#5C6B80] pointer-events-none">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="admin-password-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Введите пароль"
                className="w-full pl-10 pr-11 py-2.5 neu-inset rounded-2xl bg-[#E3E8EF] text-xs sm:text-sm font-bold text-[#2D3A4E] placeholder:text-[#5C6B80]/60 focus:outline-none focus:ring-2 focus:ring-[#5F6ED0]/40 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-[#5C6B80] hover:text-[#5F6ED0] p-1 transition-colors cursor-pointer"
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit and Cancel buttons */}
          <div className="pt-2 space-y-2">
            <button
              id="admin-auth-submit-btn"
              type="submit"
              className="w-full py-3 px-5 neu-button-accent rounded-2xl text-xs sm:text-sm font-black text-white flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              <span>Войти в админ-панель</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              id="admin-auth-cancel-btn"
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#5C6B80] hover:text-[#2D3A4E] active:scale-98 transition-all cursor-pointer"
            >
              Отмена
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
