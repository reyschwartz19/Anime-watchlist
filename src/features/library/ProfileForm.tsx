'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { saveProfile } from './actions';
import { searchFavorites } from './favorite-actions';
import { parseFavorite, serializeFavorite } from './favorites';
import { GENRES } from './model';
import { Poster } from './Poster';

export interface ProfileFormData {
  userId: string;
  displayName: string | null;
  photoURL: string | null;
  interests: string[];
  favoriteAnimes: string[];
}

interface FavoriteItem { mal_id: number; title: string; alternateTitle?: string; imageUrl: string | null; year: number | null; type: string | null }
interface Draft { displayName: string; interests: string[]; favorites: string[]; step: number }

export function ProfileForm({ profile, onboarding = false, section }: { profile: ProfileFormData; onboarding?: boolean; section?: 'identity' | 'taste' }) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [interests, setInterests] = useState(profile.interests);
  const [favorites, setFavorites] = useState(profile.favoriteAnimes);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [retry, setRetry] = useState(0);
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitLock = useRef(false);
  const router = useRouter();
  const draftKey = `manga-shelf:onboarding:v1:${profile.userId}`;
  const genres = [...new Set([...GENRES, ...profile.interests])];
  const showIdentity = onboarding ? step === 0 : section !== 'taste';
  const showFavorites = onboarding ? step === 1 : section !== 'identity';
  const showInterests = onboarding ? step === 2 : section !== 'identity';
  const dirty = (showIdentity && displayName !== (profile.displayName ?? '')) || (showInterests && JSON.stringify(interests) !== JSON.stringify(profile.interests)) || (showFavorites && JSON.stringify(favorites) !== JSON.stringify(profile.favoriteAnimes));

  useEffect(() => {
    if (onboarding || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    function leave(event: MouseEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest('a');
      if (!link || link.target === '_blank') return;
      const target = new URL(link.href, location.href);
      if (target.pathname === location.pathname && target.search === location.search) return;
      if (!window.confirm('Leave without saving your preferences?')) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leave, true); };
  }, [onboarding, dirty]);

  function closeEditor() {
    const details = form.current?.closest('details');
    details?.removeAttribute('open');
    details?.querySelector('summary')?.focus();
  }

  function cancel() {
    setDisplayName(profile.displayName ?? ''); setInterests(profile.interests); setFavorites(profile.favoriteAnimes); setMessage(''); setFailed(false);
    closeEditor();
  }

  useEffect(() => {
    if (onboarding) {
      try {
        const raw = localStorage.getItem(draftKey);
        const draft: Partial<Draft> = raw ? JSON.parse(raw) : {};
        if (typeof draft.displayName === 'string') setDisplayName(draft.displayName.slice(0, 200));
        if (Array.isArray(draft.interests) && draft.interests.every(value => typeof value === 'string')) setInterests(draft.interests.slice(0, 400));
        if (Array.isArray(draft.favorites) && draft.favorites.every(value => typeof value === 'string')) setFavorites(draft.favorites.slice(0, 1000));
        if (typeof draft.step === 'number' && [0, 1, 2].includes(draft.step)) setStep(draft.step);
      } catch { /* A blocked or corrupt browser store must not block onboarding. */ }
    }
    setHydrated(true);
  }, [draftKey, onboarding]);

  useEffect(() => {
    if (!onboarding || !hydrated) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ displayName, interests, favorites, step } satisfies Draft)); }
    catch { /* Server save remains available when local persistence is blocked. */ }
  }, [displayName, interests, favorites, step, hydrated, onboarding, draftKey]);

  useEffect(() => {
    if (!showFavorites) return;
    let active = true;
    setSearchPending(true);
    setSearchError('');
    const timer = setTimeout(async () => {
      try {
        const result = await searchFavorites(query);
        if (!active) return;
        if (result.ok) setItems(result.items);
        else { setItems([]); setSearchError(result.message); }
      } catch {
        if (active) { setItems([]); setSearchError('The catalog is unavailable. Your selections are safe. Try again.'); }
      } finally { if (active) setSearchPending(false); }
    }, query ? 350 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query, retry, showFavorites]);

  function move(next: number) {
    setStep(next);
    setMessage('');
    requestAnimationFrame(() => heading.current?.focus());
  }

  function toggleFavorite(item: FavoriteItem) {
    const exists = favorites.some(value => parseFavorite(value).animeId === item.mal_id);
    setFavorites(current => exists ? current.filter(value => parseFavorite(value).animeId !== item.mal_id) : [...current, serializeFavorite(item.mal_id, item.title)]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (onboarding && step < 2) { move(step + 1); return; }
    if (submitLock.current) return;
    submitLock.current = true;
    setMessage('');
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await saveProfile({
          displayName: section === 'taste' ? profile.displayName : displayName,
          photoURL: profile.photoURL,
          interests: section === 'identity' ? profile.interests : interests,
          favoriteAnimes: section === 'identity' ? profile.favoriteAnimes : favorites,
          completeOnboarding: onboarding,
          ...(section ? { section } : {}),
        });
        setMessage(result.message);
        setFailed(!result.ok);
        if (result.ok) {
          if (onboarding) {
            try { localStorage.removeItem(draftKey); } catch { /* Browser storage may be blocked. */ }
            router.push('/recommendations');
          } else closeEditor();
          router.refresh();
        }
      } catch { setFailed(true); setMessage('Your preferences were not saved. Your choices are still here; try again.'); }
      finally { submitLock.current = false; }
    });
  }

  return <form ref={form} className={`profile-form stack${onboarding ? ' onboarding-form' : ''}`} onSubmit={submit}>
    {onboarding && <>
      <div className="onboarding-progress" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map(value => <span className={value <= step ? 'active' : ''} key={value} aria-hidden="true" />)}
        <span className="step-label">Step {step + 1} of 3</span>
      </div>
      <h1 ref={heading} tabIndex={-1}>{step === 0 ? 'Make yourself at home' : step === 1 ? 'Choose your favorites' : 'What draws you in?'}</h1>
      <p>{step === 0 ? 'A name for your shelf. You can change it anytime.' : step === 1 ? 'Pick a few anime you love so we can recommend more like them.' : 'Choose the genres you enjoy. Your favorites and feedback will help us learn the rest.'}</p>
    </>}
    <fieldset className="stack" disabled={pending}>
      <legend className="sr-only">{onboarding ? 'Set up your preferences' : 'Edit your preferences'}</legend>
      {showIdentity && <div className="identity-fields stack">
        <span className="avatar-initials" aria-label="Profile initials">{displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || 'A'}</span>
        <label htmlFor="display-name">Display name<input id="display-name" name="displayName" autoComplete="nickname" maxLength={200} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
      </div>}
      {showFavorites && <section className="stack" aria-labelledby="favorite-heading">
        {!onboarding && <h3 id="favorite-heading">Favorite anime</h3>}
        {onboarding && <h2 id="favorite-heading" className="sr-only">Find favorite anime</h2>}
        <div className="search-field"><Search size={22} aria-hidden="true" /><label className="sr-only" htmlFor="favorite-search">Search favorite anime by title</label><input id="favorite-search" name="favoriteSearch" type="search" placeholder="Search anime…" autoComplete="off" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /></div>
        <p className="selection-count" role="status">{favorites.length} selected{searchPending ? ' · Searching…' : ''}</p>
        {favorites.length > 0 && <div className="selected-favorites" aria-label="Selected favorites">
          {favorites.map((value, index) => <button className="selected-favorite secondary" type="button" key={`${value}-${index}`} onClick={() => setFavorites(current => current.filter((_, at) => at !== index))} aria-label={`Remove favorite ${parseFavorite(value).title}`}>
            {parseFavorite(value).title}<X size={16} aria-hidden="true" />
          </button>)}
        </div>}
        {searchError && <div className="error" role="alert"><p>{searchError}</p><button className="secondary" type="button" onClick={() => setRetry(value => value + 1)}>Retry search</button></div>}
        {!searchPending && !searchError && items.length === 0 && <p>No titles match “{query}”. Try a shorter title or another spelling.</p>}
        <div className="favorites-grid" aria-busy={searchPending}>
          {items.map((item, index) => {
            const selected = favorites.some(value => parseFavorite(value).animeId === item.mal_id);
            return <button type="button" className="favorite-tile" key={item.mal_id} aria-pressed={selected} onClick={() => toggleFavorite(item)}>
              <span className="favorite-art">
                <Poster anime={{ ...item, synopsis: '' }} eager={index < 4} />
                <span className="selection-mark" aria-hidden="true">{selected && <Check size={22} strokeWidth={3} />}</span>
              </span>
              <span className="favorite-caption">{item.title}{item.alternateTitle && <small>{item.alternateTitle}</small>}<small>{[item.year, item.type].filter(Boolean).join(' · ') || 'Year unavailable'}</small></span>
            </button>;
          })}
        </div>
      </section>}
      {showInterests && <fieldset className="stack genre-fieldset">
        <legend>{onboarding ? 'Favorite genres · choose at least one' : 'Favorite genres'}</legend>
        <div className="genre-options row wrap">{genres.map(genre => <button className="secondary" type="button" key={genre} aria-pressed={interests.includes(genre)} onClick={() => setInterests(current => current.includes(genre) ? current.filter(value => value !== genre) : [...current, genre])}>{interests.includes(genre) && <Check size={16} aria-hidden="true" />}{genre}</button>)}</div>
      </fieldset>}
      <div className="onboarding-actions row">
        {onboarding && step > 0 && <button type="button" className="secondary" onClick={() => move(step - 1)}><ArrowLeft size={20} aria-hidden="true" />Back</button>}
        {!onboarding && <button type="button" className="secondary" onClick={cancel}>Cancel</button>}
        <button type="submit" className="button primary" disabled={pending || (onboarding && step === 2 && interests.length === 0)}>{pending ? 'Saving…' : onboarding ? step < 2 ? 'Continue' : 'Finish' : 'Save preferences'}{onboarding && step < 2 && <ArrowRight size={20} aria-hidden="true" />}</button>
      </div>
    </fieldset>
    <p role={failed ? 'alert' : 'status'} className={failed ? 'error' : ''}>{message}</p>
  </form>;
}
