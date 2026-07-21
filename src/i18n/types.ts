// i18n 类型定义：语言代码、翻译函数、资源结构
import type { zhCN } from './locales/zh-CN';

/** 支持的语言代码 */
export type Locale = 'zh-CN' | 'en-US';

/** 单个语言包的结构（以中文包作为类型源头，保证各语言键一致） */
export type TranslationSchema = typeof zhCN;

/** 嵌套字典：叶子节点为字符串，分支为子字典 */
export type Dict = { [key: string]: string | Dict };

/** 由嵌套字典推导出的所有点分路径（用于 t 的键类型提示） */
export type Path<T extends Dict> = {
  [K in keyof T]: T[K] extends string
    ? K & string
    : T[K] extends Dict
      ? `${K & string}.${Path<T[K]>}`
      : never;
}[keyof T];

/** 插值参数 */
export type TranslateParams = Record<string, string | number>;

/** 翻译函数签名（与 Path 关联的强类型版本用于内部，对外提供宽松签名） */
export type Translate = (key: Path<TranslationSchema>, params?: TranslateParams) => string;

/** 本地化格式化器集合 */
export interface Formatters {
  /** 整数/小数，按本地分组与小数位格式化 */
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** 百分比，value 为 0~1 比例，digits 为小数位 */
  percent: (value: number, digits?: number) => string;
  /** 日期（年/月/日） */
  date: (value: Date | number) => string;
  /** 时间（时:分） */
  time: (value: Date | number) => string;
  /** 日期 + 时间 */
  dateTime: (value: Date | number) => string;
  /** 相对时间（如「3 分钟前」） */
  relativeTime: (value: Date | number) => string;
}

/** 语言元信息 */
export interface LocaleMeta {
  code: Locale;
  /** 语言自名（如 简体中文 / English） */
  nativeName: string;
  /** 短标签（如 CN / EN），用于切换器 */
  short: string;
}
