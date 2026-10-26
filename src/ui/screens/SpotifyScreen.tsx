import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '../../core/router';
import { toast } from '../../core/toast';
import { setActiveSource } from '../../services/media/manager';
import { isConfigured, startLogin, useSpotifyAuth } from '../../services/spotify/auth';
import { spotifyController } from '../../services/spotify/controller';
import * as api from '../../services/spotify/endpoints';
import type { PlayRequest } from '../../services/spotify/endpoints';
import { Icon } from '../components/Icon';
import { PagedList } from '../components/PagedList';
import { Screen } from '../components/Screen';

type Tab = 'playlists' | 'liked' | 'recent' | 'albums';
const TABS: Tab[] = ['playlists', 'liked', 'recent', 'albums'];

/** Start playback through the Spotify app: make Spotify the active source first so the UI binds to it. */
async function playOnSpotify(req: PlayRequest, shuffle?: boolean): Promise<void> {
  try {
    await setActiveSource('spotify');
    await spotifyController.playRequest(req, { shuffle });
    useRouter.getState().open('nowplaying');
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'bad');
  }
}

function ConnectCard() {
  const { t } = useTranslation();
  const configured = isConfigured();
  return (
    <div className="empty">
      <Icon name="music" size="3.5rem" />
      <strong>{configured ? t('spotify.connectTitle') : t('spotify.notConfiguredTitle')}</strong>
      <span>{configured ? t('spotify.connectBody') : t('spotify.notConfiguredBody')}</span>
      {configured ? (
        <button
          className="btn btn--primary"
          onClick={() => startLogin().catch((e: Error) => toast(e.message, 'bad'))}
        >
          {t('spotify.connect')}
        </button>
      ) : (
        <button
          className="btn btn--primary"
          onClick={() => useRouter.getState().open('settings', { section: 'accounts' })}
        >
          {t('spotify.openSettings')}
        </button>
      )}
    </div>
  );
}

function Thumb({ url, icon }: { url?: string; icon: string }) {
  return (
    <span className="row__lead">{url ? <img src={url} alt="" loading="lazy" /> : <Icon name={icon} />}</span>
  );
}

function ShuffleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      className="btn btn--icon btn--ghost"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon name="shuffle" />
    </button>
  );
}

export default function SpotifyScreen() {
  const { t } = useTranslation();
  const connected = useSpotifyAuth((s) => s.connected);
  const [tab, setTab] = useState<Tab>('playlists');

  const body = () => {
    switch (tab) {
      case 'playlists':
        return (
          <PagedList
            resetKey="playlists"
            empty={t('spotify.emptyPlaylists')}
            load={async (offset) => {
              const p = await api.getPlaylists(offset);
              return { items: p.items.filter(Boolean), total: p.total };
            }}
            renderRow={(p) => (
              <div
                key={p.id}
                className="row"
                role="button"
                tabIndex={0}
                onClick={() => void playOnSpotify({ contextUri: p.uri })}
              >
                <Thumb url={api.pickImage(p.images)} icon="playlist" />
                <span className="row__text">
                  <span className="row__title ellipsis">{p.name}</span>
                  <span className="row__sub ellipsis">
                    {[
                      api.playlistTrackCount(p) !== undefined
                        ? t('spotify.trackCount', { n: api.playlistTrackCount(p) })
                        : null,
                      p.owner?.display_name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="row__trail">
                  <ShuffleButton
                    label={t('spotify.shufflePlay')}
                    onClick={() => void playOnSpotify({ contextUri: p.uri }, true)}
                  />
                </span>
              </div>
            )}
          />
        );
      case 'liked':
        return (
          <PagedList
            resetKey="liked"
            empty={t('spotify.emptyLiked')}
            load={async (offset) => {
              const p = await api.getSavedTracks(offset);
              return { items: p.items.map((i) => i.track).filter(Boolean), total: p.total };
            }}
            header={(items) => (
              <button
                className="btn btn--primary btn--block paged__cta"
                disabled={items.length === 0}
                onClick={() => {
                  // Liked Songs has no context URI, so shuffle a window of the loaded tracks.
                  const uris = items.slice(0, 100).map((i) => i.uri);
                  const start = Math.floor(Math.random() * uris.length);
                  void playOnSpotify({ uris, offset: start }, true);
                }}
              >
                <Icon name="shuffle" /> {t('spotify.shufflePlay')}
              </button>
            )}
            renderRow={(tr, i, all) => (
              <div
                key={`${tr.id}-${i}`}
                className="row"
                role="button"
                tabIndex={0}
                onClick={() => void playOnSpotify({ uris: all.slice(i, i + 50).map((x) => x.uri) }, false)}
              >
                <Thumb url={api.pickImage(tr.album?.images, 64)} icon="music" />
                <span className="row__text">
                  <span className="row__title ellipsis">{tr.name}</span>
                  <span className="row__sub ellipsis">
                    {(tr.artists ?? []).map((a) => a.name).join(', ')}
                  </span>
                </span>
              </div>
            )}
          />
        );
      case 'recent':
        return (
          <PagedList
            resetKey="recent"
            empty={t('spotify.emptyRecent')}
            load={async () => {
              const items = await api.getRecentlyPlayed();
              return { items, total: items.length };
            }}
            renderRow={(tr, i) => (
              <div
                key={`${tr.id}-${i}`}
                className="row"
                role="button"
                tabIndex={0}
                onClick={() => void playOnSpotify({ uris: [tr.uri] }, false)}
              >
                <Thumb url={api.pickImage(tr.album?.images, 64)} icon="music" />
                <span className="row__text">
                  <span className="row__title ellipsis">{tr.name}</span>
                  <span className="row__sub ellipsis">
                    {(tr.artists ?? []).map((a) => a.name).join(', ')}
                  </span>
                </span>
              </div>
            )}
          />
        );
      case 'albums':
        return (
          <PagedList
            resetKey="albums"
            empty={t('spotify.emptyAlbums')}
            load={async (offset) => {
              const p = await api.getSavedAlbums(offset);
              return { items: p.items.map((i) => i.album).filter(Boolean), total: p.total };
            }}
            renderRow={(a) => (
              <div
                key={a.id}
                className="row"
                role="button"
                tabIndex={0}
                onClick={() => void playOnSpotify({ contextUri: a.uri })}
              >
                <Thumb url={api.pickImage(a.images, 64)} icon="disc" />
                <span className="row__text">
                  <span className="row__title ellipsis">{a.name}</span>
                  <span className="row__sub ellipsis">{(a.artists ?? []).map((x) => x.name).join(', ')}</span>
                </span>
                <span className="row__trail">
                  <ShuffleButton
                    label={t('spotify.shufflePlay')}
                    onClick={() => void playOnSpotify({ contextUri: a.uri }, true)}
                  />
                </span>
              </div>
            )}
          />
        );
    }
  };

  return (
    <Screen title={t('apps.spotify')}>
      {connected ? (
        <>
          <div className="tabs">
            <div className="seg" role="radiogroup" aria-label={t('spotify.library')}>
              {TABS.map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={tab === id}
                  className="seg__item"
                  onClick={() => setTab(id)}
                >
                  {t(`spotify.tabs.${id}`)}
                </button>
              ))}
            </div>
          </div>
          {body()}
          <p className="attribution dim">{t('spotify.attribution')}</p>
        </>
      ) : (
        <ConnectCard />
      )}
    </Screen>
  );
}
