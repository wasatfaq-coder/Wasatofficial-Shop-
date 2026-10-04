import React from 'react';
import type { BannerSlide } from '../types';
import { bannerImagesPending, withBannerImages, type BannerImagesDoc } from './bannerImages';
import { loadBannerImages } from './firebaseSync';

const versionOf = (banner: Pick<BannerSlide, 'id' | 'imageKey'>) => `${banner.id}:${banner.imageKey ?? ''}`;

/**
 * The picture of the slide on screen (docs/catalog-scale-plan.md, stage 5): the banner's own, else read from
 * `banner_images` while the slide is shown; '' meanwhile — the slide shows its placeholder
 */
export function useBannerImage(slide: BannerSlide | undefined): string {
  const [read, setRead] = React.useState<Record<string, string>>({});
  const pending = slide && bannerImagesPending(slide) ? slide : null;
  const version = pending ? versionOf(pending) : '';
  React.useEffect(() => {
    if (!pending) return;
    let alive = true;
    void loadBannerImages(pending).then((images) => {
      if (alive && images?.image) setRead((prev) => ({ ...prev, [version]: images.image! }));
    });
    return () => {
      alive = false;
    };
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return slide?.image || read[version] || '';
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
