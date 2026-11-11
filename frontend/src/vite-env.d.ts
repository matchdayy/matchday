/// <reference types="vite/client" />

interface ImportMetaEnv {
  // 'true' — данные берутся из src/api/mocks, бэкенд не нужен
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
