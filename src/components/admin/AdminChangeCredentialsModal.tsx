import React, { useState, useEffect, useRef } from 'react';
import {
  KeyRound,
  Lock,
  User,
  Eye,
  EyeOff,
  X,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Save,
  RotateCcw,
  Check,
} from 'lucide-react';
import {
  getAdminCredentials,
  updateAdminCredentials,
  resetAdminCredentials,
} from '../../utils/adminAuth';
import { AdminCredentials } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminChangeCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedCreds: AdminCredentials) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AdminChangeCredentialsModal: React.FC<AdminChangeCredentialsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  const [currentCreds, setCurrentCreds] = useState<AdminCredentials>(() => getAdminCredentials());

  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const currentPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const fresh = getAdminCredentials();
      setCurrentCreds(fresh);
      setCurrentPassword('');
      setNewUsername(fresh.username);
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setError(null);
      setIsSuccess(false);
      setShowResetConfirm(false);

      const timer = setTimeout(() => {
        currentPasswordInputRef.current?.focus();
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

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'Не указан', color: 'bg-slate-300' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-ZА-Я]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9А-Яа-я]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: 'Простой', color: 'bg-warning' };
    if (score <= 3) return { score: 2, label: 'Хороший', color: 'bg-blue-500' };
    return { score: 3, label: 'Надежный', color: 'bg-success' };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!currentPassword) {
      setError('Введите текущий пароль для подтверждения прав администратора.');
      return;
    }

    const cleanUser = newUsername.trim();
    if (!cleanUser || cleanUser.length < 3) {
      setError('Логин должен содержать минимум 3 символа.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Новый пароль должен содержать не менее 6 символов.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Новый пароль и подтверждение пароля не совпадают.');
      return;
    }

    if (currentPassword === newPassword && cleanUser.toLowerCase() === currentCreds.username.toLowerCase()) {
      setError('Новый логин и пароль полностью идентичны текущим.');
      return;
    }

    const res = updateAdminCredentials(currentPassword, cleanUser, newPassword);
    if (!res.success || !res.credentials) {
      setError(res.error || 'Не удалось обновить учетные данные.');
      return;
    }

    setIsSuccess(true);
    setCurrentCreds(res.credentials);
    onShowToast('Учетные данные администратора успешно изменены и синхронизированы', 'success');

    if (onSuccess) {
      onSuccess(res.credentials);
    }

    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleResetToDefaults = () => {
    const res = resetAdminCredentials();
    setCurrentCreds(res);
    setNewUsername(res.username);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowResetConfirm(false);
    setError(null);
    onShowToast('Учетные данные сброшены к стандартным: Admin / 12345678', 'info');
    if (onSuccess) {
      onSuccess(res);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="admin-change-credentials-overlay"
          id="admin-change-credentials-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-no-glow fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4"
        >
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-[#2D3A4E]/60 backdrop-blur-xs cursor-pointer"
          />

          <motion.div
            key="change-creds-modal"
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            id="admin-change-credentials-card"
            className="neu-modal rounded-3xl p-5 sm:p-7 max-w-lg w-full border border-white/90 text-[#2D3A4E] relative my-auto max-h-[95vh] overflow-y-auto z-10"
          >
        {/* Close Button */}
        <button
          id="admin-change-credentials-close-btn"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] active:scale-95 transition-all cursor-pointer"
          title="Закрыть"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-14 h-14 rounded-2xl neu-flat flex items-center justify-center text-[#4B59BB] mx-auto">
            <div className="w-10 h-10 rounded-xl neu-inset flex items-center justify-center text-[#4B59BB]">
              <KeyRound className="w-5 h-5 stroke-[2.2]" />
            </div>
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#BAC5D5]/30 text-[11px] font-bold text-[#4B59BB] mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Безопасность панели управления</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[#2D3A4E] tracking-tight">
              Смена учетных данных
            </h3>
            <p className="text-xs text-[#4E5C70] max-w-sm mx-auto mt-1">
              Текущий активный логин: <strong className="text-[#2D3A4E]">{currentCreds.username}</strong>
            </p>
          </div>
        </div>

        {/* Success Banner */}
        {isSuccess ? (
          <div className="p-4 rounded-2xl bg-success-soft border border-success/25 text-success text-xs font-bold flex items-center gap-3 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <div>
              <p className="font-black text-sm">Данные успешно сохранены!</p>
              <p className="text-[11px] text-success font-medium mt-0.5">
                Обновленный логин и пароль активированы и будут использоваться при следующем входе.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            {/* Error message */}
            {error && (
              <div
                id="admin-change-credentials-error-banner"
                className="p-3 rounded-2xl bg-danger-soft border border-danger/25 text-danger text-xs font-bold flex items-start gap-2 animate-in fade-in"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-danger mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Current Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="admin-curr-password-input"
                className="text-xs font-extrabold text-[#2D3A4E] block px-1"
              >
                Текущий пароль администратора <span className="text-danger">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-[#4E5C70] pointer-events-none">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="admin-curr-password-input"
                  ref={currentPasswordInputRef}
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Введите текущий пароль"
                  className="w-full pl-10 pr-11 py-2.5 neu-inset rounded-2xl bg-[#E3E8EF] text-xs sm:text-sm font-bold text-[#2D3A4E] placeholder:text-[#56647A] focus:ring-2 focus:ring-[#5F6ED0]/40 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 text-[#4E5C70] hover:text-[#4B59BB] p-1 transition-colors cursor-pointer"
                  title={showCurrentPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-label={showCurrentPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#4E5C70] px-1">
                Требуется для подтверждения прав на смену учетных данных
              </p>
            </div>

            <div className="border-t border-[#BAC5D5]/30 my-2" />

            {/* New Username */}
            <div className="space-y-1.5">
              <label
                htmlFor="admin-new-username-input"
                className="text-xs font-extrabold text-[#2D3A4E] block px-1"
              >
                Новый логин администратора <span className="text-danger">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-[#4E5C70] pointer-events-none">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="admin-new-username-input"
                  type="text"
                  value={newUsername}
                  onChange={(e) => {
                    setNewUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Введите новый логин (минимум 3 символа)"
                  className="w-full pl-10 pr-4 py-2.5 neu-inset rounded-2xl bg-[#E3E8EF] text-xs sm:text-sm font-bold text-[#2D3A4E] placeholder:text-[#56647A] focus:ring-2 focus:ring-[#5F6ED0]/40 transition-all"
                  required
                  minLength={3}
                />
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label
                  htmlFor="admin-new-password-input"
                  className="text-xs font-extrabold text-[#2D3A4E] block"
                >
                  Новый пароль <span className="text-danger">*</span>
                </label>
                {newPassword && (
                  <span className="text-[11px] font-bold text-[#4E5C70]">
                    Надежность: <strong className="text-[#2D3A4E]">{strength.label}</strong>
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-[#4E5C70] pointer-events-none">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="admin-new-password-input"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Не менее 6 символов"
                  className="w-full pl-10 pr-11 py-2.5 neu-inset rounded-2xl bg-[#E3E8EF] text-xs sm:text-sm font-bold text-[#2D3A4E] placeholder:text-[#56647A] focus:ring-2 focus:ring-[#5F6ED0]/40 transition-all"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 text-[#4E5C70] hover:text-[#4B59BB] p-1 transition-colors cursor-pointer"
                  title={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-label={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength visual meter */}
              {newPassword && (
                <div className="grid grid-cols-3 gap-1.5 pt-1 px-1">
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      strength.score >= 1 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      strength.score >= 2 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      strength.score >= 3 ? strength.color : 'bg-slate-200'
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="admin-confirm-password-input"
                className="text-xs font-extrabold text-[#2D3A4E] block px-1"
              >
                Повторите новый пароль <span className="text-danger">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-[#4E5C70] pointer-events-none">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="admin-confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Повторите новый пароль"
                  className={`w-full pl-10 pr-11 py-2.5 neu-inset rounded-2xl bg-[#E3E8EF] text-xs sm:text-sm font-bold text-[#2D3A4E] placeholder:text-[#56647A] focus:ring-2 transition-all ${
                    confirmPassword && confirmPassword !== newPassword
                      ? 'focus:ring-danger/50 border border-danger/35'
                      : 'focus:ring-[#5F6ED0]/40'
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 text-[#4E5C70] hover:text-[#4B59BB] p-1 transition-colors cursor-pointer"
                  title={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-label={showConfirmPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword === newPassword && (
                <p className="text-[11px] text-success font-bold px-1 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Пароли совпадают
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-3 space-y-2">
              <button
                id="admin-change-credentials-save-btn"
                type="submit"
                className="w-full py-3 px-5 neu-button-accent rounded-2xl text-xs sm:text-sm font-black text-white flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Сохранить новые данные</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  id="admin-change-credentials-cancel-btn"
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-[#2D3A4E] active:scale-98 transition-all cursor-pointer"
                >
                  Отмена
                </button>

                <button
                  id="admin-change-credentials-reset-toggle-btn"
                  type="button"
                  onClick={() => setShowResetConfirm(!showResetConfirm)}
                  className="py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#4E5C70] hover:text-warning active:scale-98 transition-all cursor-pointer flex items-center gap-1.5"
                  title="Сбросить к заводским настройкам (Admin / 12345678)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Сброс по умолчанию</span>
                </button>
              </div>
            </div>

            {/* Reset confirmation box */}
            {showResetConfirm && (
              <div className="p-3.5 rounded-2xl bg-warning-soft border border-warning/25 text-warning text-xs space-y-2 animate-in fade-in">
                <p className="font-bold">
                  Вы действительно хотите сбросить учетные данные к стандартным (Логин: <code>Admin</code>, Пароль: <code>12345678</code>)?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetToDefaults}
                    className="px-3 py-1.5 rounded-lg bg-warning text-white font-black text-[11px] hover:bg-warning/90 transition-colors cursor-pointer"
                  >
                    Да, сбросить
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
