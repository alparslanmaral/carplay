import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearAllCaches, cacheStats } from '../../core/cache';
import { confirmDialog } from '../../core/dialogs';
import { useRouter } from '../../core/router';
import { exportSettings, importSettings, useSettings } from '../../core/settings';
import { toast } from '../../core/toast';
import { setActiveSource, useMedia } from '../../services/media/manager';
import {
  exportConnectionCode,
  importConnectionCode,
  isConfigured as spotifyConfigured,
  logout as spotifyLogout,
  startLogin,
  useSpotifyAuth,
} from '../../services/spotify/auth';
import { spotifyController } from '../../services/spotify/controller';
import {
  isConfigured as googleConfigured,
  signIn,
  signOut,
  useYouTubeAuth,
} from '../../services/youtube/auth';
import { Icon } from '../components/Icon';
import { TextInput } from '../components/TextInput';
import { EditorCard } from './controls';

declare const __APP_VERSION__: string;

function timeLeft(expiresAt: number | null, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!expiresAt) return t('settings.accounts.noExpiry');
  const ms = expiresAt - Date.now();
  if (ms <= 0) return t('settings.accounts.expired');
  const min = Math.round(ms / 60000);
  return min >= 60
    ? t('settings.accounts.expiresHours', { n: Math.round(min / 6) / 10 })
    : t('settings.accounts.expiresMinutes', { n: min });
}

function StatusLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="chip" data-tone={ok ? 'ok' : undefined}>
      <Icon name={ok ? 'check' : 'close'} size="1em" /> {children}
    </span>
  );
}

export function AccountsEditor() {
  const { t } = useTranslation();
  const spConnected = useSpotifyAuth((s) => s.connected);
  const spExpires = useSpotifyAuth((s) => s.expiresAt);
  const spError = useSpotifyAuth((s) => s.error);
  const ytConnected = useYouTubeAuth((s) => s.connected);
  const ytExpires = useYouTubeAuth((s) => s.expiresAt);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const disconnectSpotify = async () => {
    spotifyLogout();
    spotifyController.deactivate();
    if (useMedia.getState().active === 'spotify') await spotifyController.activate();
  };

  const importCode = async () => {
    setBusy(true);
    try {
      await importConnectionCode(code);
      setCode('');
      toast(t('settings.accounts.imported'), 'ok');
      if (useMedia.getState().active === 'spotify') await spotifyController.activate();
      else await setActiveSource('spotify');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'bad', 6000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EditorCard itemId="custom_accounts">
      <h3 className="set-sub-title">Spotify</h3>
      <div className="chips-row">
        <StatusLine ok={spConnected}>
          {spConnected ? t('settings.accounts.connected') : t('settings.accounts.notConnected')}
        </StatusLine>
        {spConnected && <span className="chip">{t('settings.accounts.refreshes')}</span>}
        {spConnected && spExpires !== null && (
          <span className="chip">{t('settings.accounts.accessToken', { when: timeLeft(spExpires, t) })}</span>
        )}
      </div>
      {spError && <p className="set-error">{spError}</p>}
      {!spotifyConfigured() && !spConnected && (
        <p className="set-row__hint">{t('spotify.notConfiguredBody')}</p>
      )}
      <div className="set-actions">
        {spConnected ? (
          <>
            <button className="btn btn--danger" onClick={() => void disconnectSpotify()}>
              {t('settings.accounts.disconnect')}
            </button>
            <button
              className="btn"
              onClick={async () => {
                const c = exportConnectionCode();
                if (!c) return;
                try {
                  await navigator.clipboard.writeText(c);
                  toast(t('settings.accounts.codeCopied'), 'ok');
                } catch {
                  window.prompt(t('settings.accounts.copyCode'), c);
                }
              }}
            >
              <Icon name="copy" /> {t('settings.accounts.copyCode')}
            </button>
          </>
        ) : (
          <button
            className="btn btn--primary"
            disabled={!spotifyConfigured()}
            onClick={() => startLogin().catch((e: Error) => toast(e.message, 'bad'))}
          >
            {t('spotify.connect')}
          </button>
        )}
      </div>
      {!spConnected && (
        <div className="set-form">
          <p className="set-row__hint">{t('settings.accounts.codeHint')}</p>
          <div className="set-text">
            <TextInput
              value={code}
              placeholder="dd1.…"
              aria-label={t('settings.accounts.pasteCode')}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn" disabled={!code.trim() || busy} onClick={() => void importCode()}>
              {t('settings.accounts.import')}
            </button>
          </div>
        </div>
      )}

      <h3 className="set-sub-title">YouTube</h3>
      <div className="chips-row">
        <StatusLine ok={ytConnected}>
          {ytConnected ? t('settings.accounts.connected') : t('settings.accounts.notConnected')}
        </StatusLine>
        {ytConnected && (
          <span className="chip">{t('settings.accounts.accessToken', { when: timeLeft(ytExpires, t) })}</span>
        )}
      </div>
      {!googleConfigured() && !ytConnected && (
        <p className="set-row__hint">{t('youtube.notConfiguredBody')}</p>
      )}
      <div className="set-actions">
        {ytConnected ? (
          <button className="btn btn--danger" onClick={signOut}>
            {t('youtube.signOut')}
          </button>
        ) : (
          <button
            className="btn btn--primary"
            disabled={!googleConfigured()}
            onClick={() => signIn().catch((e: Error) => toast(e.message, 'bad', 6000))}
          >
            {t('youtube.signIn')}
          </button>
        )}
      </div>
      <p className="set-row__hint">{t('settings.accounts.iosNote')}</p>
    </EditorCard>
  );
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DataEditor() {
  const { t } = useTranslation();
  const [withKeys, setWithKeys] = useState(false);
  const [paste, setPaste] = useState('');
  const [stats, setStats] = useState(cacheStats());
  const file = useRef<HTMLInputElement>(null);

  const doImport = (text: string) => {
    try {
      const n = importSettings(text);
      toast(t('settings.data.imported', { n }), 'ok');
      setPaste('');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'bad', 5000);
    }
  };

  return (
    <EditorCard itemId="custom_data">
      <div className="set-actions">
        <button className="btn" onClick={() => download('drivedeck-settings.json', exportSettings(withKeys))}>
          <Icon name="download" /> {t('settings.data.export')}
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(exportSettings(withKeys));
              toast(t('settings.data.copied'), 'ok');
            } catch {
              toast(t('settings.data.copyFailed'), 'bad');
            }
          }}
        >
          <Icon name="copy" /> {t('settings.data.copy')}
        </button>
      </div>
      <label className="set-check">
        <button
          role="checkbox"
          aria-checked={withKeys}
          className="toggle"
          onClick={() => setWithKeys((v) => !v)}
        />
        <span>{t('settings.data.includeKeys')}</span>
      </label>
      <div className="set-form">
        <textarea
          className="input set-textarea"
          value={paste}
          placeholder={t('settings.data.pastePlaceholder')}
          aria-label={t('settings.data.pastePlaceholder')}
          onChange={(e) => setPaste(e.target.value)}
          rows={3}
        />
        <div className="set-actions">
          <button className="btn" disabled={!paste.trim()} onClick={() => doImport(paste)}>
            <Icon name="upload" /> {t('settings.data.importPasted')}
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            {t('settings.data.importFile')}
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) doImport(await f.text());
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="set-actions">
        <button
          className="btn btn--danger"
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('settings.data.resetTitle'),
              message: t('settings.data.resetBody'),
              tone: 'danger',
              confirmLabel: t('common.reset'),
            });
            if (ok) {
              useSettings.getState().reset();
              toast(t('settings.data.resetDone'), 'ok');
            }
          }}
        >
          <Icon name="refresh" /> {t('settings.data.reset')}
        </button>
        <button
          className="btn"
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('settings.data.cacheTitle'),
              message: t('settings.data.cacheBody'),
              confirmLabel: t('destinations.clear'),
            });
            if (ok) {
              clearAllCaches();
              setStats(cacheStats());
              toast(t('settings.data.cacheDone'), 'ok');
            }
          }}
        >
          <Icon name="trash" /> {t('settings.data.clearCaches')} ({stats.entries},{' '}
          {Math.round(stats.bytes / 1024)} KB)
        </button>
      </div>
    </EditorCard>
  );
}

export function AboutEditor() {
  const { t } = useTranslation();
  const push = useRouter((s) => s.push);
  return (
    <EditorCard itemId="custom_about">
      <p className="set-row__text">DriveDeck {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''}</p>
      <div className="list">
        <button className="row" onClick={() => push('limitations')}>
          <span className="row__lead row__lead--plain">
            <Icon name="warning" />
          </span>
          <span className="row__text">
            <span className="row__title">{t('about.limitations')}</span>
            <span className="row__sub">{t('about.limitationsHint')}</span>
          </span>
          <Icon name="chevron-right" />
        </button>
        <button className="row" onClick={() => push('diagnostics')}>
          <span className="row__lead row__lead--plain">
            <Icon name="gauge" />
          </span>
          <span className="row__text">
            <span className="row__title">{t('about.diagnostics')}</span>
            <span className="row__sub">{t('about.diagnosticsHint')}</span>
          </span>
          <Icon name="chevron-right" />
        </button>
        <button className="row" onClick={() => push('install')}>
          <span className="row__lead row__lead--plain">
            <Icon name="download" />
          </span>
          <span className="row__text">
            <span className="row__title">{t('about.install')}</span>
            <span className="row__sub">{t('about.installHint')}</span>
          </span>
          <Icon name="chevron-right" />
        </button>
      </div>
      <p className="set-row__hint">{t('about.attribution')}</p>
    </EditorCard>
  );
}
