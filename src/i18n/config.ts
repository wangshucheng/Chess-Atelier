// i18n 全局配置：可用语言、默认语言、持久化键、浏览器语言探测
import type { Locale, LocaleMeta } from './types';
import { zhCN } from './locales/zh-CN';

/** 支持的语言列表（新增语种只需在此追加并新增对应语言包文件） */
export const LOCALES: readonly LocaleMeta[] = [
  { code: 'zh-CN', nativeName: '简体中文', short: 'CN' },
  { code: 'en-US', nativeName: 'English', short: 'EN' },
] as const;

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** localStorage 中保存当前语言偏好的键 */
export const STORAGE_KEY = 'chess-atelier-locale';

/** 将任意 locale 字符串归一化为受支持的语言代码 */
export function normalizeLocale(value: string | null): Locale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en-US';
  if (LOCALES.some((l) => l.code === value)) return value as Locale;
  return null;
}

/**
 * 初始化语言：
 * 1) 优先使用已持久化的用户偏好；
 * 2) 否则依据浏览器 navigator.language 探测；
 * 3) 都不匹配则回退到默认语言。
 */
export function detectInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    const saved = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
    const nav = normalizeLocale(window.navigator?.language ?? null);
    if (nav) return nav;
  }
  return DEFAULT_LOCALE;
}

/** 校验某个语言代码是否被支持 */
export function isSupportedLocale(value: string): value is Locale {
  return LOCALES.some((l) => l.code === value);
}

/** 中文包引用，仅用于类型（确保 zh-CN 始终为类型源头） */
export const SCHEMA_SOURCE = zhCN;
