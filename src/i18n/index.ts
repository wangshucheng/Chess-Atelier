// i18n 统一出口：业务代码只需从本文件导入
export { I18nProvider, useI18n, useTranslation, I18nContext, type I18nContextValue } from './I18nProvider';
export { LOCALES, DEFAULT_LOCALE, STORAGE_KEY, detectInitialLocale, normalizeLocale, isSupportedLocale } from './config';
export type { Locale, LocaleMeta, TranslationSchema, Path, Translate, TranslateParams, Dict, Formatters } from './types';
