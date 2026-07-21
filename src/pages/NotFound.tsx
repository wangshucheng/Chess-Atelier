import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useI18n } from '@/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      <div className="font-display text-8xl text-gold/30 leading-none mb-4">404</div>
      <div className="w-12 h-px bg-gold/30 mb-6" />
      <h1 className="font-display text-2xl text-ivory mb-2">{t('notFound.title')}</h1>
      <p className="text-sm text-ivoryDim max-w-md mb-8">{t('notFound.desc')}</p>
      <Link
        to="/"
        className="btn-gold-outline px-5 py-2.5 rounded-sm text-xs uppercase tracking-[0.25em] inline-flex items-center gap-2"
      >
        <Compass size={14} />
        {t('notFound.back')}
      </Link>
    </div>
  );
}
