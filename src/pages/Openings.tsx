// 开局训练库浏览页：卡片网格 + 分类筛选
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search, ArrowRight, Layers, AlertTriangle, RotateCcw } from 'lucide-react';
import { loadOpenings } from '@/data';
import type { Opening } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { useI18n } from '@/i18n';
import type { Path, TranslationSchema } from '@/i18n';

const CATEGORY_FILTERS: { key: 'all' | Opening['category']; i18n: string }[] = [
  { key: 'all', i18n: 'openings.filters.all' },
  { key: 'open', i18n: 'openings.filters.open' },
  { key: 'semi-open', i18n: 'openings.filters.semiOpen' },
  { key: 'closed', i18n: 'openings.filters.closed' },
];

export default function Openings() {
  const { t, locale } = useI18n();
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Opening['category']>('all');
  const [query, setQuery] = useState('');
  // 只订阅 openingProgress，避免 playStats 等无关变化触发重渲染
  const openingProgress = useAppStore((s) => s.progress.openingProgress);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadOpenings()
      .then((data) => {
        if (cancelled) return;
        setOpenings(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : t('openings.loadError', { err: '' }));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (loadError) {
    return (
      <div className="px-4 md:px-10 py-16 max-w-[1400px] mx-auto">
        <div className="card-gold rounded-sm p-12 text-center">
          <AlertTriangle size={32} className="text-wine mx-auto mb-3" />
          <div className="text-sm text-ivoryDim mb-4">{t('openings.loadError', { err: loadError })}</div>
          <button
            onClick={() => window.location.reload()}
            className="btn-gold-outline px-4 py-2 rounded-sm text-xs uppercase tracking-widest inline-flex items-center gap-1.5"
          >
            <RotateCcw size={12} /> {t('openings.reload')}
          </button>
        </div>
      </div>
    );
  }

  const filtered = useMemo(() => {
    return openings.filter((o) => {
      if (filter !== 'all' && o.category !== filter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        return (
          o.name.toLowerCase().includes(q) ||
          o.nameZh.includes(q) ||
          o.eco.toLowerCase().includes(q) ||
          o.description.includes(q)
        );
      }
      return true;
    });
  }, [openings, filter, query]);

  return (
    <div className="px-4 md:px-10 py-8 max-w-[1400px] mx-auto">
      {/* 标题 */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2 animate-fade-up">
          <BookOpen size={12} className="text-gold" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-gold/70">Opening Library</span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-5xl text-ivory tracking-tight-display animate-fade-up">
              {t('openings.title')}
            </h1>
            <p className="text-sm text-ivoryDim mt-2 animate-fade-up" style={{ animationDelay: '0.15s' }}>
              {t('openings.subtitle')}
            </p>
          </div>
          <div className="text-right text-xs text-ivoryDim">
            <div className="font-mono text-2xl text-gold">{openings.length}</div>
            <div className="text-[10px] uppercase tracking-widest">{t('openings.countSuffix')}</div>
          </div>
        </div>
      </header>

      {/* 工具栏：搜索 + 分类筛选 */}
      <div className="card-gold rounded-sm p-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold/50" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('openings.searchPlaceholder')}
            aria-label={t('openings.searchAria')}
            className="w-full pl-9 pr-3 py-2 bg-ink-800/60 border border-gold/15 rounded-sm text-sm text-ivory placeholder:text-ivoryDim/50 focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label={t('openings.filters.group')}>
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`px-3 py-1.5 rounded-sm text-xs uppercase tracking-widest transition-colors ${
                filter === f.key
                  ? 'bg-gold/15 border border-gold/50 text-gold'
                  : 'border border-gold/10 text-ivoryDim hover:text-ivory hover:border-gold/30'
              }`}
            >
              {t(f.i18n as Path<TranslationSchema>)}
            </button>
          ))}
        </div>
      </div>

      {/* 开局卡片网格 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-gold rounded-sm p-6 h-56 animate-pulse">
              <div className="h-4 w-16 bg-gold/10 rounded mb-4" />
              <div className="h-8 w-3/4 bg-gold/10 rounded mb-3" />
              <div className="h-3 w-full bg-gold/5 rounded mb-2" />
              <div className="h-3 w-2/3 bg-gold/5 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-gold rounded-sm p-12 text-center">
          <Layers size={32} className="text-gold/30 mx-auto mb-3" />
          <div className="text-sm text-ivoryDim">{t('openings.noMatch')}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((o, idx) => {
            const practiced = openingProgress[o.eco];
            const namePrimary = locale === 'zh-CN' ? o.nameZh : o.name;
            const nameSecondary = locale === 'zh-CN' ? o.name : o.nameZh;
            return (
              <Link
                key={o.eco}
                to={`/openings/${o.eco}`}
                className="card-gold rounded-sm p-6 group relative overflow-hidden flex flex-col h-full transition-transform duration-300 hover:-translate-y-1 animate-fade-up"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-gold/5 to-transparent pointer-events-none" />
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="font-mono text-xs text-gold/70 mb-1">{o.eco}</div>
                    <h3 className="font-display text-2xl text-ivory tracking-tight-display leading-tight">
                      {namePrimary}
                    </h3>
                    <div className="text-[10px] uppercase tracking-widest text-ivoryDim/70 mt-0.5">{nameSecondary}</div>
                  </div>
                  <span className={`text-[9px] uppercase tracking-widest px-2 py-1 rounded-sm border ${
                    o.category === 'open' ? 'border-gold/40 text-gold bg-gold/5' :
                    o.category === 'semi-open' ? 'border-moss/40 text-moss bg-moss/5' :
                    'border-wine/40 text-wine bg-wine/5'
                  }`}>
                    {t(`openings.category.${o.category}` as Path<TranslationSchema>)}
                  </span>
                </div>

                <p className="text-xs text-ivoryDim leading-relaxed flex-1 line-clamp-3">{o.description}</p>

                <div className="mt-4 pt-4 border-t border-gold/10 flex items-center justify-between">
                  <div className="text-[10px] text-ivoryDim font-mono">
                    {t('openings.lineInfo', { n: o.mainLine.length, n2: o.variations.length })}
                  </div>
                  {practiced ? (
                    <span className="text-[10px] uppercase tracking-widest text-moss flex items-center gap-1">
                      {t('openings.practicedCount', { n: practiced.practices })}
                    </span>
                  ) : (
                    <ArrowRight size={14} className="text-gold/50 group-hover:text-gold group-hover:translate-x-1 transition-all" />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
