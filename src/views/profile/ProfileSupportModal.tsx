import { StoreHours } from '../../components/StoreHours';
import { motion, AnimatePresence } from 'motion/react';
import { telHref } from '../../utils/storeContacts';
import { Headphones, X, Phone, MessageCircle } from 'lucide-react';
import { StorefrontSettings } from '../../types';
import { useDialogA11y } from '../../utils/useDialogA11y';


/** «Служба заботы»: the shop's phone with its hours, the support chat and the email */
export function ProfileSupportModal({ isOpen, onClose, storeName, storePhone, storeEmail, storeSchedule, workingHours, onOpenSupportChat }: {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  storePhone: string;
  storeEmail: string;
  storeSchedule: StorefrontSettings['schedule'];
  workingHours: string;
  onOpenSupportChat?: () => void;
}) {
  const supportDialog = useDialogA11y(isOpen, onClose);
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="support-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          >
            {/* Backdrop */}
            <div
              onClick={() => onClose()}
              className="fixed inset-0 bg-[#2D3A4E]/40 backdrop-blur-xs cursor-pointer"
            />

            <motion.div
              ref={supportDialog.ref}
              {...supportDialog.props}
              key="support-modal"
              initial={{ scale: 0.93, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 12 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="neu-modal rounded-3xl p-5 sm:p-6 max-w-md w-full space-y-4 text-[#2D3A4E] border border-white/80 relative z-10"
            >
              <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl neu-flat-sm flex items-center justify-center text-accent">
                    <Headphones className="w-4 h-4" />
                  </div>
                  <h3 id={supportDialog.titleId} className="text-sm font-extrabold uppercase tracking-wider text-[#2D3A4E]">
                    Служба заботы {storeName}
                  </h3>
                </div>
                <button
                  onClick={() => onClose()}
                  className="w-8 h-8 rounded-xl neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-[#4E5C70] leading-relaxed">
                <p className="font-bold text-[#2D3A4E]">Мы на связи и готовы помочь с любым вопросом!</p>
                {storePhone && (
                <div className="neu-inset rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#2D3A4E]">Телефон магазина:</p>
                      <a
                        href={telHref(storePhone)}
                        className="text-accent font-extrabold text-base hover:underline block"
                      >
                        {storePhone}
                      </a>
                    </div>
                    <a
                      href={telHref(storePhone)}
                      className="neu-button p-2.5 rounded-xl text-accent hover:scale-105 transition-transform"
                      title="Позвонить"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>
                  <StoreHours schedule={storeSchedule} comment={workingHours} />
                </div>
                )}

                <div className="space-y-2 pt-1">
                  {onOpenSupportChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSupportChat();
                      }}
                      className="w-full neu-button-accent py-2.5 px-4 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-transform"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Открыть онлайн-чат заботы</span>
                    </button>
                  )}

                  {storeEmail && (
                    <a
                      href={`mailto:${storeEmail}`}
                      className="w-full neu-button py-2.5 px-4 rounded-xl text-xs font-bold text-[#2D3A4E] flex items-center justify-center gap-2 cursor-pointer hover:text-accent transition-colors"
                    >
                      <span>Email: {storeEmail}</span>
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
