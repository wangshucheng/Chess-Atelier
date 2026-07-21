// 基于 Intl 的本地化格式化器：数字、百分比、日期、时间、相对时间
import type { Formatters, Locale } from './types';

/** 将 Date | 时间戳统一为 Date */
function toDate(value: Date | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Intl 中使用的 BCP-47 语言标签 */
const INTL_LOCALE: Record<Locale, string> = {
  'zh-CN': 'zh-CN',
  'en-US': 'en-US',
};

/**
 * 为给定语言创建一组格式化器。
 * 切换语言时调用方应重新创建（Provider 内部已做 memo）。
 */
export function createFormatters(locale: Locale): Formatters {
  const tag = INTL_LOCALE[locale] ?? 'zh-CN';

  const nf = new Intl.NumberFormat(tag);
  const df = new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'long', day: 'numeric' });
  const tf = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' });
  const dtf = new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });

  return {
    number(value, options) {
      return options ? new Intl.NumberFormat(tag, options).format(value) : nf.format(value);
    },
    percent(value, digits = 0) {
      return new Intl.NumberFormat(tag, {
        style: 'percent',
        maximumFractionDigits: digits,
      }).format(value);
    },
    date(value) {
      return df.format(toDate(value));
    },
    time(value) {
      return tf.format(toDate(value));
    },
    dateTime(value) {
      return dtf.format(toDate(value));
    },
    relativeTime(value) {
      const date = toDate(value);
      const diffMs = date.getTime() - Date.now();
      const diffSec = Math.round(diffMs / 1000);
      const absSec = Math.abs(diffSec);
      if (absSec < 60) return rtf.format(diffSec, 'second');
      const diffMin = Math.round(diffSec / 60);
      if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
      const diffHour = Math.round(diffMin / 60);
      if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
      const diffDay = Math.round(diffHour / 24);
      return rtf.format(diffDay, 'day');
    },
  };
}
