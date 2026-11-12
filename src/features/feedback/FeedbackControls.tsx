'use client';

import { useRef, useState, useTransition } from 'react';
import { setFeedback } from './actions';

export function FeedbackControls({ animeId, initialValue = null, requestId }: { animeId: number; initialValue?: 'like' | 'dislike' | null; requestId?: string }) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState('');
  const lock = useRef(false);
  const operations = useRef(new Map<string, string>());
  function select(next: 'like' | 'dislike') {
    if (lock.current) return;
    lock.current = true;
    const selected = value === next ? null : next;
    const signature = JSON.stringify({ requestId, animeId, selected, reason });
    const operationId = operations.current.get(signature) ?? crypto.randomUUID();
    operations.current.set(signature, operationId);
    setMessage(''); setFailed(false);
    startTransition(async () => {
      try {
        const result = await setFeedback({ animeId, value: selected, reason, ...(requestId ? { requestId, operationId } : {}) });
        setMessage(result.message); setFailed(!result.ok);
        if (result.ok) { setValue(selected); operations.current.delete(signature); }
      } catch { setFailed(true); setMessage('Your feedback could not be saved. Your reason is still here; try the same choice again.'); }
      finally { lock.current = false; }
    });
  }
  return <div className="stack feedback-controls">
    <label htmlFor={`taste-reason-${animeId}`}>Why? (optional)<input id={`taste-reason-${animeId}`} name="tasteReason" autoComplete="off" value={reason} maxLength={1200} onChange={event => setReason(event.target.value)} placeholder="The atmosphere, characters, pacing…" /></label>
    <div className="row" role="group" aria-label="Recommendation feedback">
      <button type="button" aria-pressed={value === 'like'} disabled={pending} onClick={() => select('like')}>Fits my taste</button>
      <button type="button" aria-pressed={value === 'dislike'} disabled={pending} onClick={() => select('dislike')}>Not for me</button>
    </div>
    <p role={failed ? 'alert' : 'status'} className={failed ? 'error' : 'muted'}>{pending ? 'Saving feedback…' : message}</p>
  </div>;
}
