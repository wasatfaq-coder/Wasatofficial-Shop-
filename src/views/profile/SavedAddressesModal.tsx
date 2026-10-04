import { Pencil, X, MapPin, Plus, Trash2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { formatAddress } from '../../utils/addressFormat';
import { useDialogA11y } from '../../utils/useDialogA11y';

import type { AddressBook } from './useAddressBook';

/** «Адреса доставки»: the saved addresses with edit, delete and «Сделать основным» */
export function SavedAddressesModal({ isOpen, onClose, profile, book }: { isOpen: boolean; onClose: () => void; profile: UserProfile; book: AddressBook }) {
  const addressesDialog = useDialogA11y(isOpen, onClose);
  const {
    setAddressToDelete,
    handleOpenAddAddress,
    handleOpenEditAddress,
    handleSetDefaultAddress,
  } = book;
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D3A4E]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={addressesDialog.ref}
            {...addressesDialog.props}
            className="neu-modal rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col border border-white/80 text-[#2D3A4E] overflow-hidden transform-gpu">
            {/* Sticky Fixed Header */}
            <div className="flex items-center justify-between border-b border-[#BAC5D5]/50 p-4 sm:p-5 shrink-0 bg-[#E3E8EF]">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-accent" />
                <h3 id={addressesDialog.titleId} className="text-base font-extrabold text-[#2D3A4E]">Адреса доставки</h3>
              </div>
              <button
                onClick={() => onClose()}
                className="w-8 h-8 rounded-full neu-button flex items-center justify-center text-[#4E5C70] hover:text-[#2D3A4E] cursor-pointer transition-transform"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Smooth Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 no-scrollbar overscroll-contain transform-gpu">
              {profile.savedAddresses.map((addr) => (
                <div key={addr.id} className="neu-inset rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#2D3A4E]">{addr.title}</span>
                      {addr.isDefault && (
                        <span className="text-[11px] font-bold text-success bg-success-soft px-2 py-0.5 rounded-full">
                          Основной
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditAddress(addr)}
                        className="p-1.5 neu-button rounded-xl text-[#4E5C70] hover:text-[#2D3A4E]"
                        title="Редактировать"
                        aria-label="Редактировать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setAddressToDelete(addr.id)}
                        className="p-1.5 neu-button-danger rounded-xl"
                        title="Удалить"
                        aria-label="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[#2D3A4E] font-semibold leading-relaxed">
                    {formatAddress(addr)}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {addr.house && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        д. {addr.house}
                      </span>
                    )}
                    {addr.entrance && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        подъезд {addr.entrance}
                      </span>
                    )}
                    {addr.floor && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        эт. {addr.floor}
                      </span>
                    )}
                    {addr.apartment && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-[#2D3A4E]">
                        {addr.apartment.toLowerCase().includes('кв') || addr.apartment.toLowerCase().includes('оф')
                          ? addr.apartment
                          : `кв. ${addr.apartment}`}
                      </span>
                    )}
                    {addr.intercom && (
                      <span className="neu-flat-sm px-2 py-0.5 rounded-lg text-[11px] font-bold text-accent">
                        домофон: {addr.intercom}
                      </span>
                    )}
                  </div>

                  {!addr.isDefault && (
                    <button
                      onClick={() => handleSetDefaultAddress(addr.id)}
                      className="text-[11px] font-bold text-accent hover:underline pt-1 block cursor-pointer"
                    >
                      Сделать основным адресом
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-3.5 sm:p-4 border-t border-[#BAC5D5]/50 shrink-0 bg-[#E3E8EF]">
              <button
                type="button"
                onClick={handleOpenAddAddress}
                className="w-full neu-button-accent rounded-2xl py-3 text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-transform"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Добавить новый адрес</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
