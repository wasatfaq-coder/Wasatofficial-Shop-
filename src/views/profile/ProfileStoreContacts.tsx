import { StoreHours } from '../../components/StoreHours';
import { telHref } from '../../utils/storeContacts';
import { MapPin, Phone, Send } from 'lucide-react';
import { StorefrontSettings } from '../../types';


/** «Контакты магазина»: only what the owner filled in «Витрина» */
export function ProfileStoreContacts({ storeName, storeSlogan, pickupAddress, storePhone, storeTelegram, storeSchedule, workingHours, hasHours }: {
  storeName: string;
  storeSlogan: string;
  pickupAddress: string;
  storePhone: string;
  storeTelegram: string;
  storeSchedule: StorefrontSettings['schedule'];
  workingHours: string;
  hasHours: boolean;
}) {

  return (
    <>
      {(pickupAddress || hasHours || storePhone || storeTelegram) && (
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-[#2D3A4E] tracking-wider uppercase px-1">
          Контакты магазина
        </h3>
        <div className="neu-flat rounded-3xl p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl neu-inset flex items-center justify-center text-accent shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#2D3A4E]">{storeName}</p>
              {storeSlogan && <p className="text-xs text-[#4E5C70]">{storeSlogan}</p>}
            </div>
          </div>

          {(pickupAddress || hasHours) && (
            <div className="neu-inset rounded-2xl p-3 space-y-1.5 text-xs text-[#2D3A4E]">
              {pickupAddress && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{pickupAddress}</span>
                </div>
              )}
              <StoreHours schedule={storeSchedule} comment={workingHours} />
            </div>
          )}

          {(storePhone || storeTelegram) && (
            <div className="flex items-center gap-2 flex-wrap">
              {storePhone && (
                <a
                  href={telHref(storePhone)}
                  className="flex-1 min-w-[150px] py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-[#2D3A4E] hover:text-accent flex items-center justify-center gap-1.5 whitespace-nowrap transition-all"
                >
                  <Phone className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>{storePhone}</span>
                </a>
              )}
              {storeTelegram && (
                <a
                  href={`https://t.me/${storeTelegram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-[150px] py-2.5 px-3 neu-button rounded-xl text-xs font-bold text-accent flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span>{storeTelegram}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      )}
    </>
  );
}
