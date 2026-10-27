import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog } from '../../core/dialogs';
import { useSettings, type Shortcut } from '../../core/settings';
import { SHORTCUT_ICONS, newShortcutId, upsertShortcut, validateShortcutUrl } from '../../core/shortcuts';
import { Icon } from '../components/Icon';
import { TextInput } from '../components/TextInput';
import { EditorCard } from './controls';

/** Add, edit and remove launcher tiles that open any URL or URL scheme. */
export function ShortcutsManager() {
  const { t } = useTranslation();
  const shortcuts = useSettings((s) => s.shortcuts);
  const patch = useSettings((s) => s.patch);
  const homeOrder = useSettings((s) => s.homeOrder);
  const [draft, setDraft] = useState<Shortcut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError(t('settings.shortcuts.errName'));
    const check = validateShortcutUrl(draft.url);
    if (!check.ok) {
      return setError(
        check.reason === 'blocked'
          ? t('settings.shortcuts.errBlocked')
          : check.reason === 'empty'
            ? t('settings.shortcuts.errEmpty')
            : t('settings.shortcuts.errInvalid'),
      );
    }
    const item = { ...draft, name: draft.name.trim(), url: check.url };
    const isNew = !shortcuts.some((s) => s.id === item.id);
    patch({
      shortcuts: upsertShortcut(shortcuts, item),
      ...(isNew ? { homeOrder: [...homeOrder, `sc:${item.id}`] } : {}),
    });
    setDraft(null);
    setError(null);
  };

  const remove = async (s: Shortcut) => {
    const ok = await confirmDialog({
      title: t('settings.shortcuts.removeTitle', { name: s.name }),
      tone: 'danger',
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    const id = `sc:${s.id}`;
    patch({
      shortcuts: shortcuts.filter((x) => x.id !== s.id),
      homeOrder: homeOrder.filter((x) => x !== id),
      dockItems: useSettings.getState().dockItems.filter((x) => x !== id),
    });
  };

  return (
    <EditorCard itemId="custom_shortcuts">
      <div className="list">
        {shortcuts.map((s) => (
          <div key={s.id} className="row row--tight">
            <span className="row__lead row__lead--plain">
              <Icon name={s.icon} />
            </span>
            <span className="row__text">
              <span className="row__title ellipsis">{s.name}</span>
              <span className="row__sub ellipsis">{s.url}</span>
            </span>
            <span className="row__trail">
              <button
                className="btn btn--icon btn--ghost btn--sm"
                aria-label={t('common.edit')}
                onClick={() => (setDraft(s), setError(null))}
              >
                <Icon name="pencil" />
              </button>
              <button
                className="btn btn--icon btn--ghost btn--sm"
                aria-label={t('common.remove')}
                onClick={() => void remove(s)}
              >
                <Icon name="trash" />
              </button>
            </span>
          </div>
        ))}
      </div>
      {draft ? (
        <div className="set-form">
          <TextInput
            value={draft.name}
            placeholder={t('settings.shortcuts.name')}
            aria-label={t('settings.shortcuts.name')}
            maxLength={24}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <TextInput
            value={draft.url}
            placeholder="tel:+90…  waze://  https://…"
            aria-label={t('settings.shortcuts.url')}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
          <div className="swatches" role="radiogroup" aria-label={t('settings.shortcuts.icon')}>
            {SHORTCUT_ICONS.map((name) => (
              <button
                key={name}
                role="radio"
                aria-checked={draft.icon === name}
                aria-label={name}
                className="icon-choice"
                onClick={() => setDraft({ ...draft, icon: name })}
              >
                <Icon name={name} />
              </button>
            ))}
          </div>
          {error && <p className="set-error">{error}</p>}
          <div className="set-actions">
            <button className="btn" onClick={() => (setDraft(null), setError(null))}>
              {t('common.cancel')}
            </button>
            <button className="btn btn--primary" onClick={save}>
              {t('common.save')}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn"
          onClick={() => (setDraft({ id: newShortcutId(), name: '', icon: 'link', url: '' }), setError(null))}
        >
          <Icon name="plus" /> {t('settings.shortcuts.add')}
        </button>
      )}
    </EditorCard>
  );
}
