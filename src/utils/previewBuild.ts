/**
 * The preview channel of a pull request (deploy.yml sets VITE_PREVIEW_BUILD for that build only). It works with the
 * store's real database: orders placed and admin changes made there are real, so the preview says so on every screen.
 */
export const IS_PREVIEW_BUILD = import.meta.env.VITE_PREVIEW_BUILD === 'true';
