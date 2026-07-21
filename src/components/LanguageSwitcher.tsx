// 语言切换器：在界面内无缝切换语言（无需刷新），偏好持久化由 Provider 处理
import { Languages } from 'lucide-react';
import { useI18n } from '@/i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale, locales } = useI18n();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-gold/50">
        <Languages size={11} />
        <span>Language</span>
      </div>
      <div
        role="group"
        aria-label="Language"
        className="grid grid-cols-2 gap-1.5"
      >
        {locales.map((l) => {
          const active = l.code === locale;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              aria-pressed={active}
              title={l.nativeName}
              className={`flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest py-1.5 border rounded-sm transition-colors ${
                active
                  ? 'border-gold/40 text-gold/90 bg-gold/10 hover:border-gold/60'
                  : 'border-gold/10 text-ivoryDim/60 hover:text-ivoryDim hover:border-gold/20'
              }`}
            >
              <span className="font-mono">{l.short}</span>
              <span className="hidden lg:inline normal-case tracking-normal text-[11px]">
                {l.nativeName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
