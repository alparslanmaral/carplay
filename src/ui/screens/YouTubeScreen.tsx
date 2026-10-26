import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { toast } from '../../core/toast';
import { useSettings } from '../../core/settings';
import { formatDuration } from '../../core/units';
import { mediaActions } from '../../services/media/actions';
import { setActiveSource } from '../../services/media/manager';
import type { Track } from '../../services/media/types';
import {
  describeError,
  likedVideos,
  myPlaylists,
  parseYouTubeLink,
  playlistVideos,
  searchVideos,
  type PlaylistSummary,
} from '../../services/youtube/api';
import { isConfigured, signIn, signOut, useYouTubeAuth } from '../../services/youtube/auth';
import { youtubeController } from '../../services/youtube/controller';
import { loadIframeApi } from '../../services/youtube/player';
import { useCursorLoader } from '../hooks/useCursorLoader';
import { Icon } from '../components/Icon';
import { PagedList } from '../components/PagedList';
import { Screen } from '../components/Screen';
import { TextInput } from '../components/TextInput';
import { PlayerSlot } from '../components/YouTubeHost';
import { useLayout } from '../hooks/useViewport';

type Tab = 'playlists' | 'liked' | 'search' | 'link';
const TABS: Tab[] = ['playlists', 'liked', 'search', 'link'];

async function playVideos(tracks: Track[], index: number, shuffle = false): Promise<void> {
  try {
    await setActiveSource('youtube');
    await youtubeController.playQueue(tracks, index, { shuffle });
  } catch (e) {
    toast(describeError(e), 'bad', 5000);
  }
}

function VideoRow({ track, onPlay, active }: { track: Track; onPlay: () => void; active: boolean }) {
  return (
    <div className="row" role="button" tabIndex={0} onClick={onPlay} aria-current={active}>
      <span className="row__lead row__lead--wide">
        {track.artworkUrl ? <img src={track.artworkUrl} alt="" loading="lazy" /> : <Icon name="video" />}
      </span>
      <span className="row__text">
        <span className="row__title ellipsis-2">{track.title}</span>
        <span className="row__sub ellipsis">
          {track.artist}
          {track.durationMs > 0 && ` · ${formatDuration(track.durationMs)}`}
        </span>
      </span>
      <span className="row__trail">
        <Icon name={active ? 'volume' : 'play'} />
      </span>
    </div>
  );
}

function VideoList({
  resetKey,
  loader,
  empty,
  header,
}: {
  resetKey: string;
  loader: (offset: number) => Promise<{ items: Track[]; total: number }>;
  empty: string;
  header?: (items: Track[]) => React.ReactNode;
}) {
  const current = useStore(youtubeController.state$, (s) => s.track?.id);
  return (
    <PagedList
      resetKey={resetKey}
      load={loader}
      empty={empty}
      header={header}
      renderRow={(tr, i, all) => (
        <VideoRow
          key={`${tr.id}-${i}`}
          track={tr}
          active={tr.id === current}
          onPlay={() => void playVideos(all, i)}
        />
      )}
    />
  );
}

function PlaylistVideos({
  playlist,
  onBack,
}: {
  playlist: { id: string; title: string };
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const loader = useCursorLoader(`pl:${playlist.id}`, (token) => playlistVideos(playlist.id, token));
  return (
    <VideoList
      resetKey={`pl:${playlist.id}`}
      loader={loader}
      empty={t('youtube.emptyPlaylist')}
      header={(items) => (
        <div className="yt-head">
          <button className="btn btn--icon" onClick={onBack} aria-label={t('common.back')}>
            <Icon name="back" />
          </button>
          <h2 className="yt-head__title ellipsis">{playlist.title}</h2>
          <button
            className="btn btn--primary"
            disabled={!items.length}
            onClick={() => void playVideos(items, 0)}
          >
            <Icon name="play" /> {t('youtube.play')}
          </button>
          <button
            className="btn btn--icon"
            disabled={!items.length}
            aria-label={t('youtube.shuffle')}
            onClick={() => void playVideos(items, 0, true)}
          >
            <Icon name="shuffle" />
          </button>
        </div>
      )}
    />
  );
}

function CredentialsCard({ needsSignIn }: { needsSignIn: boolean }) {
  const { t } = useTranslation();
  const connected = useYouTubeAuth((s) => s.connected);
  if (connected && needsSignIn) return null;
  const configured = isConfigured();
  return (
    <div className="empty">
      <Icon name="video" size="3.5rem" />
      <strong>{configured ? t('youtube.signInTitle') : t('youtube.notConfiguredTitle')}</strong>
      <span>{configured ? t('youtube.signInBody') : t('youtube.notConfiguredBody')}</span>
      {configured && (
        <button
          className="btn btn--primary"
          onClick={() => signIn().catch((e: Error) => toast(e.message, 'bad', 6000))}
        >
          {t('youtube.signIn')}
        </button>
      )}
      <span className="faint">{t('youtube.keyHint')}</span>
    </div>
  );
}

function SearchResults({ query }: { query: string }) {
  const { t } = useTranslation();
  const loader = useCursorLoader(`q:${query}`, (token) => searchVideos(query, token));
  return <VideoList resetKey={`q:${query}`} loader={loader} empty={t('youtube.noResults')} />;
}

function LikedTab() {
  const { t } = useTranslation();
  const loader = useCursorLoader('liked', (token) => likedVideos(token));
  return <VideoList resetKey="yt-liked" loader={loader} empty={t('youtube.emptyLiked')} />;
}

function PlaylistsTab({ onOpen }: { onOpen: (p: { id: string; title: string }) => void }) {
  const { t } = useTranslation();
  const loader = useCursorLoader('playlists', (token) => myPlaylists(token));
  return (
    <PagedList
      resetKey="yt-playlists"
      empty={t('youtube.emptyPlaylists')}
      load={loader}
      renderRow={(p: PlaylistSummary) => (
        <div
          key={p.id}
          className="row"
          role="button"
          tabIndex={0}
          onClick={() => onOpen({ id: p.id, title: p.title })}
        >
          <span className="row__lead row__lead--wide">
            {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <Icon name="playlist" />}
          </span>
          <span className="row__text">
            <span className="row__title ellipsis">{p.title}</span>
            <span className="row__sub">{t('youtube.videoCount', { n: p.count })}</span>
          </span>
          <span className="row__trail">
            <Icon name="chevron-right" />
          </span>
        </div>
      )}
    />
  );
}

function SearchTab() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  return (
    <div className="paged">
      <form
        className="yt-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(text.trim());
        }}
      >
        <TextInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('youtube.searchPlaceholder')}
          enterKeyHint="search"
          aria-label={t('youtube.searchPlaceholder')}
        />
        <button className="btn btn--primary btn--icon" type="submit" aria-label={t('common.search')}>
          <Icon name="search" />
        </button>
      </form>
      {query ? <SearchResults query={query} /> : <p className="dim yt-hint">{t('youtube.searchHint')}</p>}
    </div>
  );
}

function LinkTab({ onPlaylist }: { onPlaylist: (p: { id: string; title: string }) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeLink(text);
    if (!parsed) return toast(t('youtube.badLink'), 'bad');
    if (parsed.playlistId) return onPlaylist({ id: parsed.playlistId, title: t('youtube.linkedPlaylist') });
    if (parsed.videoId) {
      const found = await searchVideos(parsed.videoId).catch(() => null);
      const track = found?.items.find((i) => i.id === parsed.videoId);
      void playVideos(
        [
          track ?? {
            id: parsed.videoId!,
            title: parsed.videoId!,
            artist: 'YouTube',
            durationMs: 0,
            uri: `youtube:${parsed.videoId}`,
          },
        ],
        0,
      );
    }
  };
  return (
    <form className="yt-search" onSubmit={open}>
      <TextInput
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('youtube.linkPlaceholder')}
        inputMode="url"
        autoCapitalize="off"
        aria-label={t('youtube.linkPlaceholder')}
      />
      <button className="btn btn--primary" type="submit">
        {t('common.open')}
      </button>
    </form>
  );
}

function PlayerPanel() {
  const { t } = useTranslation();
  const track = useStore(youtubeController.state$, (s) => s.track);
  const playing = useStore(youtubeController.state$, (s) => s.playing);
  const message = useStore(youtubeController.state$, (s) => s.statusMessage);
  return (
    <div className="yt-player">
      <PlayerSlot />
      {track && (
        <>
          <div className="yt-player__meta">
            <h2 className="ellipsis-2">{track.title}</h2>
            <p className="dim ellipsis">{track.artist}</p>
          </div>
          {message === 'parked-only' && <p className="yt-player__parked">{t('youtube.parkedBody')}</p>}
          <div className="yt-player__controls">
            <button
              className="btn btn--icon"
              aria-label={t('nowplaying.previous')}
              onClick={() => void mediaActions.previous()}
            >
              <Icon name="prev" size="1.8rem" />
            </button>
            <button
              className="btn btn--icon btn--primary"
              aria-label={playing ? t('nowplaying.pause') : t('nowplaying.play')}
              onClick={() => void mediaActions.togglePlay()}
            >
              <Icon name={playing ? 'pause' : 'play'} size="2rem" />
            </button>
            <button
              className="btn btn--icon"
              aria-label={t('nowplaying.next')}
              onClick={() => void mediaActions.next()}
            >
              <Icon name="next" size="1.8rem" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function YouTubeScreen() {
  const { t } = useTranslation();
  const layout = useLayout();
  const connected = useYouTubeAuth((s) => s.connected);
  const apiKey = useSettings((s) => s.youtubeApiKey);
  const hasTrack = useStore(youtubeController.state$, (s) => !!s.track);
  const [tab, setTab] = useState<Tab>(connected ? 'playlists' : 'search');
  const [open, setOpen] = useState<{ id: string; title: string } | null>(null);
  const canBrowse = connected;
  const canQuery = connected || !!apiKey;

  // Warm up the player script so the first tap on a video starts quickly.
  useEffect(() => {
    void loadIframeApi().catch(() => undefined);
  }, []);

  const body = () => {
    if (open) return <PlaylistVideos playlist={open} onBack={() => setOpen(null)} />;
    if (tab === 'playlists' || tab === 'liked') {
      if (!canBrowse) return <CredentialsCard needsSignIn />;
    } else if (!canQuery) {
      return <CredentialsCard needsSignIn={false} />;
    }
    switch (tab) {
      case 'playlists':
        return <PlaylistsTab onOpen={setOpen} />;
      case 'liked':
        return <LikedTab />;
      case 'search':
        return <SearchTab />;
      case 'link':
        return <LinkTab onPlaylist={setOpen} />;
    }
  };

  return (
    <Screen
      title={t('apps.youtube')}
      scroll={false}
      pad={false}
      actions={
        connected ? (
          <button className="btn btn--sm btn--ghost" onClick={signOut}>
            {t('youtube.signOut')}
          </button>
        ) : undefined
      }
    >
      <div className="yt" data-layout={layout} data-has-player={hasTrack}>
        {hasTrack && (
          <div className="yt__player">
            <PlayerPanel />
          </div>
        )}
        <div className="yt__browse scroll-y">
          {!open && (
            <div className="tabs">
              <div className="seg" role="radiogroup" aria-label={t('youtube.library')}>
                {TABS.map((id) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={tab === id}
                    className="seg__item"
                    onClick={() => setTab(id)}
                  >
                    {t(`youtube.tabs.${id}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {body()}
          <p className="attribution dim">{t('youtube.attribution')}</p>
        </div>
      </div>
    </Screen>
  );
}
