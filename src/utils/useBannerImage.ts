import React from 'react';
import type { BannerSlide } from '../types';
import { bannerImagesPending, withBannerImages, type BannerImagesDoc } from './bannerImages';
import { loadBannerImages } from './firebaseSync';

const versionOf = (banner: Pick<BannerSlide, 'id' | 'imageKey'>) => `${banner.id}:${banner.imageKey ?? ''}`;

const WIDE_SCREEN = '(min-width: 1024px)';

/** true on a computer (`lg:`, from 1024 px): the banner shows its picture «для компьютера» there */
export function useWideScreen(): boolean {
  const [wide, setWide] = React.useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(WIDE_SCREEN).matches));
  React.useEffect(() => {
    const mq = window.matchMedia?.(WIDE_SCREEN);
    if (!mq) return;
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

/**
 * The picture of the slide on screen (docs/catalog-scale-plan.md, stage 5): the banner's own, else read from
 * `banner_images` while the slide is shown; '' meanwhile — the slide shows its placeholder. On a computer — the picture
 * «для компьютера», on a phone — «для телефона», each falling back to the main one (owner's decision 08.10, audit 07.10,
 * finding 49: the computer picture was downloaded and never shown)
 */
export function useBannerImage(slide: BannerSlide | undefined, wide: boolean): string {
  const [read, setRead] = React.useState<Record<string, BannerImagesDoc>>({});
  const pending = slide && bannerImagesPending(slide) ? slide : null;
  const version = pending ? versionOf(pending) : '';
  React.useEffect(() => {
    if (!pending) return;
    let alive = true;
    void loadBannerImages(pending).then((images) => {
      if (alive && images) setRead((prev) => ({ ...prev, [version]: images }));
    });
    return () => {
      alive = false;
    };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!slide) return '';
  const full = withBannerImages(slide, read[version]);
  return (wide ? full.desktopImage : full.mobileImage) || full.image || '';
}

/** The admin's banners with their pictures back in place, for the editor and the list */
export function useBannersWithImages(banners: BannerSlide[]): BannerSlide[] {
  const [read, setRead] = React.useState<Record<string, BannerImagesDoc | null>>({});
  const wanted = banners.filter((b) => b.imageKey).map(versionOf).join('|');
  React.useEffect(() => {
    if (!wanted) return;
    let alive = true;
    for (const banner of banners.filter((b) => b.imageKey)) {
      const version = versionOf(banner);
      void loadBannerImages(banner).then((images) => {
        if (alive) setRead((prev) => ({ ...prev, [version]: images }));
      });
    }
    return () => {
      alive = false;
    };
  }, [wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  return React.useMemo(
    () => banners.map((b) => (b.imageKey ? withBannerImages(b, read[versionOf(b)] ?? undefined) : b)),
    [banners, read]
  );
}
