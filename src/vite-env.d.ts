/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __GITHUB_PAGES__: boolean

interface ImportMetaEnv {
  readonly VITE_PAYPAL_DONATE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}