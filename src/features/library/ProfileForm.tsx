'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile } from './actions';
import { GENRES } from './model';

export interface ProfileFormData {
  displayName: string | null;
  photoURL: string | null;
  interests: string[];
  favoriteAnimes: string[];
}

export function ProfileForm({ profile, onboarding = false }: { profile: ProfileFormData; onboarding?: boolean }) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL ?? '');
  const [interests, setInterests] = useState(profile.interests);
  const [favorites, setFavorites] = useState(profile.favoriteAnimes);
  const [favoriteInput, setFavoriteInput] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const genres = [...new Set([...GENRES, ...profile.interests])];

  function toggleGenre(genre: string) {
    setInterests((current) => current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre]);
  }

  function addFavorite() {
    const title = favoriteInput.trim();
    if (!title) return;
    setFavorites((current) => [...current, title]);
    setFavoriteInput('');
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    startTransition(async () => {
      const result = await saveProfile({ displayName, photoURL, interests, favoriteAnimes: favorites, completeOnboarding: onboarding });
      setMessage(result.message);
      if (result.ok) {
        if (onboarding) router.push('/library');
        router.refresh();
      }
    });
  }

  return <form className="panel stack" onSubmit={submit}>
    <fieldset className="stack" disabled={pending}>
      <legend>{onboarding ? 'Set up your preferences' : 'Your profile & preferences'}</legend>
      <label htmlFor="display-name">Display name</label>
      <input id="display-name" name="displayName" autoComplete="nickname" maxLength={200} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      <label htmlFor="photo-url">Profile photo URL (optional)</label>
      <input id="photo-url" name="photoURL" type="url" autoComplete="url" value={photoURL} onChange={(event) => setPhotoURL(event.target.value)} />
      <fieldset className="stack">
        <legend>Favorite genres{onboarding ? ' (choose at least one)' : ''}</legend>
        <div className="row wrap">
          {genres.map((genre) => <button type="button" key={genre} aria-pressed={interests.includes(genre)} onClick={() => toggleGenre(genre)}>{genre}</button>)}
        </div>
      </fieldset>
      <fieldset className="stack">
        <legend>Favorite anime (optional)</legend>
        {favorites.length ? <ul className="stack">
          {favorites.map((favorite, index) => <li key={`${index}-${favorite}`} className="row wrap"><span>{favorite}</span><button type="button" aria-label={`Remove favorite ${favorite}`} onClick={() => setFavorites((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></li>)}
        </ul> : <p className="muted">Add titles you enjoy to help shape recommendations.</p>}
        <label htmlFor="favorite-anime">Add a favorite title</label>
        <div className="row">
          <input id="favorite-anime" name="favoriteAnime" autoComplete="off" maxLength={1000} value={favoriteInput} onChange={(event) => setFavoriteInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addFavorite(); } }} />
          <button type="button" onClick={addFavorite}>Add favorite</button>
        </div>
      </fieldset>
      <button type="submit" className="button primary">{pending ? 'Saving…' : onboarding ? 'Finish onboarding' : 'Save preferences'}</button>
    </fieldset>
    <p role="status">{message}</p>
  </form>;
}
