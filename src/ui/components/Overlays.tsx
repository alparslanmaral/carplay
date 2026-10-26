import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useToasts } from '../../core/toast';
import { useDriving } from '../../core/driving';
import { useSettings } from '../../core/settings';
import { resolveDialog, useDialogs } from '../../core/dialogs';
import { Icon } from './Icon';

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet__grab" />
        {title && <h2 className="sheet__title">{title}</h2>}
        {subtitle && <p className="sheet__sub">{subtitle}</p>}
        <div className="scroll-y" style={{ marginTop: children ? '0.75rem' : 0 }}>
          {children}
        </div>
        {actions && <div className="sheet__actions">{actions}</div>}
      </div>
    </>
  );
}

/** Global confirm dialog host - rendered once in App. */
export function DialogHost() {
  const { t } = useTranslation();
  const current = useDialogs((s) => s.current);
  if (!current) return null;
  return (
    <>
      <div className="scrim" onClick={() => resolveDialog(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={current.title}>
        <h2 className="sheet__title">{current.title}</h2>
        {current.message && <p className="sheet__sub">{current.message}</p>}
        <div className="sheet__actions">
          <button className="btn" onClick={() => resolveDialog(false)}>
            {current.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            className={`btn ${current.tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => resolveDialog(true)}
          >
            {current.confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * "Parked? Passenger mode" prompt, opened when text input is attempted while moving.
 * Explicit confirmation is the whole safeguard: DriveDeck cannot tell who is holding the phone.
 */
export function PassengerPrompt() {
  const { t } = useTranslation();
  const open = useDriving((s) => s.promptOpen);
  const close = useDriving((s) => s.closePrompt);
  const setPassenger = useDriving((s) => s.setPassenger);
  const allowed = useSettings((s) => s.passengerOverride);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={t('driving.title')}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Icon name="lock" size="2rem" />
          <h2 className="sheet__title">{t('driving.title')}</h2>
        </div>
        <p className="sheet__sub">{allowed ? t('driving.body') : t('driving.bodyNoOverride')}</p>
        <div className="sheet__actions">
          <button className="btn" onClick={close}>
            {allowed ? t('driving.stayLocked') : t('common.close')}
          </button>
          {allowed && (
            <button className="btn btn--primary" onClick={() => setPassenger(true)}>
              {t('driving.confirmPassenger')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function Toasts() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((it) => (
        <div key={it.id} className="toast" data-tone={it.tone} role="status">
          <Icon name={it.tone === 'bad' ? 'warning' : it.tone === 'ok' ? 'check' : 'info'} />
          <span>{it.message}</span>
          <button
            className="btn btn--icon btn--ghost btn--sm"
            onClick={() => dismiss(it.id)}
            aria-label="Dismiss"
          >
            <Icon name="close" size="1.1em" />
          </button>
        </div>
      ))}
    </div>
  );
}
