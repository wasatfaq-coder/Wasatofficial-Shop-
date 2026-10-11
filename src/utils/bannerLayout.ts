/**
 * Sizes of the home banner slide, one place for the home screen and the admin preview (admin audit 09.10, stage 8,
 * finding 11). The home screen switches at `lg` by the window width; the preview draws a phone or a computer inside
 * the admin panel, so it takes the same sizes without the breakpoint. Literal class strings: Tailwind finds them here.
 */
export type BannerLayout = 'auto' | 'phone' | 'desktop';

export interface BannerLayoutClasses {
  row: string;
  text: string;
  title: string;
  subtitle: string;
  image: string;
}

export const BANNER_LAYOUT: Record<BannerLayout, BannerLayoutClasses> = {
  auto: {
    row: 'min-h-[170px] lg:min-h-[280px] lg:px-4',
    text: 'space-y-2 max-w-[52%] lg:space-y-3',
    title: 'text-[22px] sm:text-[24px] lg:text-[36px]',
    subtitle: 'text-[12px] sm:text-[13px] lg:text-base',
    // narrower photo on 320 px: at full width it left the subtitle a column too thin to read
    image: 'w-40 h-44 max-[359px]:w-28 max-[359px]:h-36 lg:w-[400px] lg:h-[260px]',
  },
  // 390 px: below `sm` and `lg`
  phone: {
    row: 'min-h-[170px]',
    text: 'space-y-2 max-w-[52%]',
    title: 'text-[22px]',
    subtitle: 'text-[12px]',
    image: 'w-40 h-44',
  },
  desktop: {
    row: 'min-h-[280px] px-4',
    text: 'space-y-3 max-w-[52%]',
    title: 'text-[36px]',
    subtitle: 'text-base',
    image: 'w-[400px] h-[260px]',
  },
};

/** Width of the banner on screen: 390 px minus the page sides (px-4); the computer — `max-w-6xl` minus `lg:px-6` */
export const BANNER_FRAME_WIDTH: Record<Exclude<BannerLayout, 'auto'>, number> = { phone: 358, desktop: 1104 };
