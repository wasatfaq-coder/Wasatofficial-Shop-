/**
 * The avatar of a profile is only the Google account's photo (https://….googleusercontent.com/…) or none (audit 07.10,
 * finding 8). The profile is written by the buyer's browser, and «Клиенты» show it to the owner: any other link would
 * open on the owner's screen and give away their IP and working hours (`referrerPolicy="no-referrer"` hides only the
 * page address). The site writes and the admin shows only such addresses; the same pattern goes into firestore.rules
 * (`isGoogleAvatar`, the second PR of stage 2 in docs/audit-2026-10-07-plan.md).
 */
// Without spaces and line breaks: the rule's `.*` (RE2) does not pass a line break, so the site never writes what the
// rule would refuse
const GOOGLE_AVATAR = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.googleusercontent\.com\/\S*$/;
const MAX_AVATAR_LENGTH = 2000;

/** The address when it is a Google account photo, otherwise '' (the screen draws the letters) */
export function googleAvatarUrl(url: unknown): string {
  return typeof url === 'string' && url.length <= MAX_AVATAR_LENGTH && GOOGLE_AVATAR.test(url) ? url : '';
}
