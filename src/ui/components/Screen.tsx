import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../core/router';
import { Icon } from './Icon';

export function BackButton({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation();
  const pop = useRouter((s) => s.pop);
  return (
    <button className="btn btn--icon" onClick={onClick ?? pop} aria-label={t('common.back')}>
      <Icon name="back" size="1.75em" />
    </button>
  );
}

/** Standard screen frame: back button, title, optional actions, content. */
export function Screen({
  title,
  actions,
  children,
  scroll = true,
  pad = true,
  back = true,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  pad?: boolean;
  back?: boolean;
  className?: string;
}) {
  return (
    <section className={`screen${className ? ` ${className}` : ''}`} aria-label={title}>
      <header className="screen__header">
        {back && <BackButton />}
        <h1 className="screen__title ellipsis">{title}</h1>
        {actions}
      </header>
      <div className={`screen__body${scroll ? ' scroll-y' : ''}${pad ? ' screen__body--pad' : ''}`}>
        {children}
      </div>
    </section>
  );
}
