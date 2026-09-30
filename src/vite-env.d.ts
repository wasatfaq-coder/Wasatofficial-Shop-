/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_EMULATORS?: string;
  /** 'true' on the preview channel of a pull request (deploy.yml) */
  readonly VITE_PREVIEW_BUILD?: string;
}
