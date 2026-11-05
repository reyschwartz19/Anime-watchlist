'use client';

import { useState, useTransition } from 'react';
import { setFeedback } from './actions';

export function FeedbackControls({ animeId, initialValue = null }: { animeId: number; initialValue?: 'like' | 'dislike' | null }) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  function select(next: 'like' | 'dislike') {
    const selected = value === next ? null : next;
    startTransition(async () => {
      const result = await setFeedback({ animeId, value: selected });
      setMessage(result.message);
      if (result.ok) setValue(selected);
    });
  }

  return <div className="stack feedback-controls">
    <div className="row" role="group" aria-label="Recommendation feedback">
      <button type="button" aria-pressed={value === 'like'} disabled={pending} onClick={() => select('like')}>Fits my taste</button>
      <button type="button" aria-pressed={value === 'dislike'} disabled={pending} onClick={() => select('dislike')}>Not for me</button>
    </div>
    <p role="status" className="muted">{pending ? 'Saving feedback…' : message}</p>
  </div>;
}
