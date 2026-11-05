'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeAnime, saveAnime } from './actions';
import { STATUS_LABELS, STATUSES, type AnimeView, type LibraryStatus } from './model';

export function AnimeCard({ anime, currentStatus, allowRemove = false, reason, children }: {
  anime: AnimeView;
  currentStatus?: LibraryStatus;
  allowRemove?: boolean;
  reason?: string;
  children?: React.ReactNode;
}) {
  const labelId = useId();
  const selectId = useId();
  const [selectedStatus, setSelectedStatus] = useState<LibraryStatus>(currentStatus ?? 'plan_to_watch');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const result = await saveAnime({ animeId: anime.mal_id, status: selectedStatus });
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Remove ${anime.title} from your library?`)) return;
    startTransition(async () => {
      const result = await removeAnime({ animeId: anime.mal_id });
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return <article className="panel anime-card stack" aria-labelledby={labelId}>
    {anime.imageUrl ? <img className="anime-poster" src={anime.imageUrl} alt={`Poster for ${anime.title}`} width={225} height={338} loading="lazy" referrerPolicy="no-referrer" /> : <div className="poster-fallback">Poster unavailable</div>}
    <h2 id={labelId}>{anime.title}</h2>
    {currentStatus ? <p className="muted">{STATUS_LABELS[currentStatus]}</p> : null}
    {reason ? <div className="recommendation-reason"><h3>Why this fits</h3><p>{reason}</p></div> : null}
    {anime.synopsis ? <details><summary>Synopsis</summary><p>{anime.synopsis}</p></details> : null}
    <div className="stack">
      <label htmlFor={selectId}>Library status</label>
      <select id={selectId} value={selectedStatus} disabled={pending} onChange={(event) => setSelectedStatus(event.target.value as LibraryStatus)}>
        {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
      </select>
      <button type="button" className="button primary" disabled={pending} onClick={save}>{pending ? 'Saving…' : currentStatus ? 'Update status' : 'Add to my list'}</button>
      {allowRemove ? <button type="button" className="button" disabled={pending} onClick={remove}>Remove from list</button> : null}
    </div>
    <p role="status" className="muted">{message}</p>
    {children}
  </article>;
}
