/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_EMULATORS?: string;
  /** 'true' on the preview channel of a pull request (deploy.yml) */
  readonly VITE_PREVIEW_BUILD?: string;
  /** reCAPTCHA v3 site key of App Check (deploy.yml, GitHub variable RECAPTCHA_SITE_KEY); empty — App Check is off */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
}
