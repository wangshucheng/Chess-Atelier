// i18n 上下文 Provider：管理当前语言、持久化偏好、提供 t 与格式化器
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Dict, Formatters, Locale, Translate, TranslateParams } from './types';
import { LOCALES, STORAGE_KEY, detectInitialLocale, normalizeLocale } from './config';
import { createFormatters } from './format';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';

/** 语言资源表：新增语种在此追加 import 与条目即可 */
const RESOURCES: Record<Locale, Dict> = {
  'zh-CN': zhCN as unknown as Dict,
  'en-US': enUS as unknown as Dict,
};

export interface I18nContextValue {
  locale: Locale;
  /** 切换语言（自动持久化 + 更新 <html lang>） */
  setLocale: (locale: Locale) => void;
  /** 翻译函数，支持点分键与 {name} 插值 */
  t: Translate;
  /** 本地化格式化器（数字/日期/时间） */
  format: Formatters;
  /** 可用语言列表 */
  locales: typeof LOCALES;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

/** 在嵌套字典中按点分路径取值 */
function lookup(dict: Dict, path: string): string | undefined {
  const segments = path.split('.');
  let cur: string | Dict | undefined = dict;
  for (const seg of segments) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Dict)[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** 在字符串中替换 {key} 占位符 */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  // 切换语言：更新状态 + 持久化 + 同步 <html lang>
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 隐私模式可能写入失败，忽略 */
    }
    document.documentElement.lang = next;
  }, []);

  // 初始同步 <html lang>
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // 监听其他标签页的语言变更，保持多标签一致
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const detected = normalizeLocale(e.newValue);
        if (detected) setLocaleState(detected);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const format = useMemo(() => createFormatters(locale), [locale]);

  const t = useCallback<Translate>(
    (key, params) => {
      const dict = RESOURCES[locale];
      const value = lookup(dict, key);
      if (value === undefined) {
        // 开发期友好的回退：直接返回键名，便于发现缺失翻译
        if (import.meta.env?.DEV) {
          console.warn(`[i18n] 缺失翻译：${key} (${locale})`);
        }
        return key;
      }
      return interpolate(value, params);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, format, locales: LOCALES }),
    [locale, setLocale, t, format],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 获取 i18n 上下文（locale / setLocale / t / format） */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 <I18nProvider> 内使用');
  return ctx;
}

/** 仅获取翻译函数 t 的便捷 hook */
export function useTranslation(): { t: Translate; locale: Locale } {
  const { t, locale } = useI18n();
  return { t, locale };
}
