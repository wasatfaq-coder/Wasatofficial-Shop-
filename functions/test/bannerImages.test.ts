// Картинки баннеров вне документа баннера (docs/catalog-scale-plan.md, этап 5): src/utils/bannerImages.ts
import { describe, expect, test } from 'bun:test';
import type { BannerSlide } from '../../src/types';
import { bannerImagesPending, hasInlineBannerImage, splitBannerImages, withBannerImages } from '../../src/utils/bannerImages';

const A = 'data:image/jpeg;base64,AAAA';
const B = 'data:image/jpeg;base64,BBBB';
const banner = (over: Partial<BannerSlide> = {}): BannerSlide => ({
  id: 'b1',
  title: 'Лето',
  subtitle: 'Лён',
  btnText: 'Смотреть',
  image: A,
  mobileImage: A,
  desktopImage: B,
  active: true,
  ...over,
});

describe('картинки баннеров', () => {
  test('картинки уходят в отдельный документ, копия главной не хранится дважды', () => {
    const { stored, images } = splitBannerImages(banner());
    expect(images).toEqual({ bannerId: 'b1', image: A, desktopImage: B });
    expect([stored.image, stored.mobileImage, stored.desktopImage]).toEqual(['', '', '']);
    expect(stored.imageKey).toBeTruthy();
    expect(hasInlineBannerImage(stored)).toBe(false);
    expect(bannerImagesPending(stored)).toBe(true);
  });

  test('прочитанные картинки возвращаются на место, и тот же баннер даёт тот же хэш', () => {
    const { stored, images } = splitBannerImages(banner({ mobileImage: undefined }));
    const shown = withBannerImages(stored, images!);
    expect([shown.image, shown.mobileImage, shown.desktopImage]).toEqual([A, A, B]);
    expect(splitBannerImages(shown).stored.imageKey).toBe(stored.imageKey);
    expect(splitBannerImages(banner({ image: B, mobileImage: B })).stored.imageKey).not.toBe(stored.imageKey);
  });

  test('ссылка на картинку и баннер без картинок внутри остаются как есть', () => {
    const link = banner({ image: 'https://example.com/a.jpg', mobileImage: undefined, desktopImage: undefined });
    expect(splitBannerImages(link)).toEqual({ stored: link, images: null });
    expect(bannerImagesPending(link)).toBe(false);
  });
});
