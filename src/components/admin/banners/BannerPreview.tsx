import React, { useLayoutEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { BANNER_FRAME_WIDTH, BANNER_LAYOUT } from '../../../utils/bannerLayout';
import { AdminHint } from '../AdminHint';

type Device = 'phone' | 'desktop';

interface BannerPreviewProps {
  title: string;
  subtitle: string;
  badge: string;
  phoneImage: string;
  desktopImage: string;
}

/**
 * The slide as the buyer will see it on the home screen (admin audit 09.10, stage 8, finding 11; owner's choice А):
 * a phone at 390 px or a computer from 1024 px, with the picture for that screen. The computer is drawn at its real
 * width and scaled down to the panel.
 */
export const BannerPreview: React.FC<BannerPreviewProps> = ({ title, subtitle, badge, phoneImage, desktopImage }) => {
  const [device, setDevice] = useState<Device>('phone');
  const layout = BANNER_LAYOUT[device];
  const frameWidth = BANNER_FRAME_WIDTH[device];
  const image = device === 'phone' ? phoneImage : desktopImage || phoneImage;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const box = boxRef.current;
    const frame = frameRef.current;
    if (!box || !frame) return;
    const measure = () => {
      const scale = Math.min(1, box.clientWidth / frameWidth);
      setFit({ scale, height: frame.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameWidth]);

  const devices: { id: Device; label: string; Icon: typeof Smartphone }[] = [
    { id: 'phone', label: 'Телефон', Icon: Smartphone },
    { id: 'desktop', label: 'Компьютер', Icon: Monitor },
  ];

  return (
    <section aria-labelledby="banner-preview-title" className="p-3.5 neu-inset rounded-2xl space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <h4 id="banner-preview-title" className="text-[11px] font-extrabold text-[#2D3A4E] uppercase tracking-wider">
            Как увидит покупатель
          </h4>
          <AdminHint label="Как увидит покупатель">
            Слайд на главной: телефон — 390 px, компьютер — от 1024 px, у каждого своё фото.
          </AdminHint>
        </div>
        <div role="radiogroup" aria-label="Экран предпросмотра" className="flex items-center gap-1 neu-flat-sm p-0.5 rounded-xl">
          {devices.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={device === id}
              onClick={() => setDevice(id)}
              className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                device === id ? 'neu-pill-active text-[#2D3A4E]' : 'text-[#4E5C70] hover:text-[#2D3A4E]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={boxRef} className="w-full overflow-hidden" style={{ height: fit.height || undefined }}>
        <div
          ref={frameRef}
          aria-hidden="true"
          style={{ width: frameWidth, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}
        >
          <div className="relative neu-inset rounded-3xl p-5 overflow-hidden select-none">
            <div className={`relative flex items-center justify-between gap-3 ${layout.row}`}>
              <div className={`flex-1 ${layout.text}`}>
                {badge.trim() && (
                  <span className="text-[11px] font-extrabold neu-flat-sm px-2.5 py-0.5 rounded-full text-accent uppercase tracking-wider inline-block">
                    {badge.trim()}
                  </span>
                )}
                <p className={`${layout.title} font-display font-extrabold text-[#2D3A4E] leading-tight`}>
                  {title.trim() || 'Заголовок баннера'}
                </p>
                <p className={`${layout.subtitle} text-[#4E5C70] font-normal leading-relaxed line-clamp-3`}>{subtitle.trim()}</p>
              </div>
              <div className={`${layout.image} shrink-0 rounded-2xl overflow-hidden bg-[#D8DFE8]`}>
                {image && (
                  <img src={image} alt="" className="w-full h-full object-cover object-top rounded-xl" referrerPolicy="no-referrer" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {!image && <p className="text-xs text-[#4E5C70]">Добавьте фото — оно появится справа на слайде.</p>}
    </section>
  );
};
