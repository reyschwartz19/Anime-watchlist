'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeAnime, saveAnime } from './actions';
import { STATUS_LABELS, STATUSES, type LibraryStatus } from './model';

export function LibraryControls({ animeId, initialStatus }: { animeId: number; initialStatus?: LibraryStatus }) {
  const [status, setStatus] = useState<LibraryStatus>(initialStatus ?? 'plan_to_watch');
  const [saved, setSaved] = useState(initialStatus);
  const [removed, setRemoved] = useState<LibraryStatus>();
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  function update(next: LibraryStatus | null) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = next ? await saveAnime({ animeId, status: next }) : await removeAnime({ animeId });
        setMessage(result.message);
        if (result.ok) { if (next) { setSaved(next); setStatus(next); setRemoved(undefined); } else { setRemoved(saved); setSaved(undefined); } router.refresh(); }
      } catch { setMessage('Your change could not be saved. Try again.'); }
      finally { busy.current = false; }
    });
  }
  return <section className="stack" aria-label="Library actions"><div className="row"><label htmlFor="detail-status">Library status<select id="detail-status" name="status" value={status} disabled={pending} onChange={e => setStatus(e.target.value as LibraryStatus)}>{STATUSES.map(s => <option value={s} key={s}>{STATUS_LABELS[s]}</option>)}</select></label><button className="primary" disabled={pending} onClick={() => update(status)}>{pending ? 'Saving…' : saved ? 'Update my list' : 'Add to my list'}</button>{saved && <button disabled={pending} onClick={() => update(null)}>Remove</button>}</div><p role="status">{message}{saved ? ` On your shelf: ${STATUS_LABELS[saved]}.` : ''}</p>{removed && <button disabled={pending} onClick={() => update(removed)}>Undo removal</button>}</section>;
}
