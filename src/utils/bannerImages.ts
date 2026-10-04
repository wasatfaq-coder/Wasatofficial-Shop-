import type { BannerSlide } from '../types';
import { shortHash } from './catalogIndex';

/**
 * Banner pictures out of the banner documents (docs/catalog-scale-plan.md, stage 5). A picture uploaded in the admin is
 * a data: photo of ≈ 120 КБ, and the banner kept it up to three times (`image`, `mobileImage`, `desktopImage`): every
 * visitor downloaded them on any screen. Now the pictures live in `banner_images/{bannerId}` (a field only when it differs
 * from `image`), the banner keeps '' in their place and `imageKey` — a hash of the pictures, so a changed picture is read
 * again. The home screen reads the picture of the slide it shows; links to pictures stay in the banner.
 */

export const BANNER_IMAGE_FIELDS = ['image', 'mobileImage', 'desktopImage'] as const;
type BannerImageField = (typeof BANNER_IMAGE_FIELDS)[number];

export type BannerImagesDoc = { bannerId: string } & Partial<Record<BannerImageField, string>>;

/** Only what `banner_images` accepts (firestore.rules): another picture stays inside the banner as before */
const isDataImage = (src: unknown): src is string =>
  typeof src === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(src);

/** A banner that still carries a picture inside (saved before stage 5, or edited in the admin) */
export const hasInlineBannerImage = (banner: BannerSlide) => BANNER_IMAGE_FIELDS.some((f) => isDataImage(banner[f]));

/**
 * What the banner document keeps and the pictures document to write (null — nothing inside to move). A copy of
 * `image` in another field is not stored twice: reading fills it back (`withBannerImages`).
 */
export function splitBannerImages(banner: BannerSlide): { stored: BannerSlide; images: BannerImagesDoc | null } {
  if (!hasInlineBannerImage(banner)) return { stored: banner, images: null };
  const images: BannerImagesDoc = { bannerId: banner.id };
  const stored: BannerSlide = { ...banner };
  for (const field of BANNER_IMAGE_FIELDS) {
    const src = banner[field];
    if (!isDataImage(src)) continue;
    if (field === 'image' || src !== banner.image) images[field] = src;
    stored[field] = '';
  }
  stored.imageKey = shortHash(BANNER_IMAGE_FIELDS.map((f) => images[f] ?? '').join('|'));
  return { stored, images };
}

/** The banner with its pictures back in place (the admin's editor); an empty field takes the main picture */
export function withBannerImages(banner: BannerSlide, images: BannerImagesDoc | undefined): BannerSlide {
  if (!images) return banner;
  const main = banner.image || images.image || '';
  return {
    ...banner,
    image: main,
    mobileImage: banner.mobileImage || images.mobileImage || main,
    desktopImage: banner.desktopImage || images.desktopImage || main,
  };
}

/** The banner's pictures are in `banner_images` and not read yet */
export const bannerImagesPending = (banner: BannerSlide) => Boolean(banner.imageKey) && !banner.image;
