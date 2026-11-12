'use client';

import { useRef, useState, useTransition } from 'react';
import { saveViewingNotes } from './notes-actions';
import { emptyViewingNotes, type ViewingNotes } from './notes-model';

export function ViewingNotesForm({ animeId, initial = emptyViewingNotes }: { animeId: number; initial?: ViewingNotes }) {
  const [notes, setNotes] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  function field(name: keyof Omit<ViewingNotes, 'value'>, value: string) { setNotes(previous => ({ ...previous, [name]: value })); setMessage(''); }
  return <section className="viewing-notes stack" id="viewing-notes">
    <div className="stack notes-heading"><h2>Your viewing notes</h2><p className="muted">Remember what worked for you. Your notes help us look beyond the genre when choosing your next anime.</p></div>
    <form className="stack" onSubmit={event => {
      event.preventDefault(); if (locked.current) return; locked.current = true;
      startTransition(async () => { try { const result = await saveViewingNotes({ animeId, ...notes }); setMessage(result.message); setFailed(!result.ok); } catch { setMessage('Your notes are still here. Try saving again.'); setFailed(true); } finally { locked.current = false; } });
    }}>
      <div className="row" role="group" aria-label="How did this anime fit your taste?">
        <button type="button" aria-pressed={notes.value === 'like'} onClick={() => setNotes(current => ({ ...current, value: current.value === 'like' ? null : 'like' }))}>Liked it</button>
        <button type="button" aria-pressed={notes.value === 'dislike'} onClick={() => setNotes(current => ({ ...current, value: current.value === 'dislike' ? null : 'dislike' }))}>Not for me</button>
      </div>
      <div className="notes-columns">
        <label htmlFor={`liked-${animeId}`}>What did you like?<textarea id={`liked-${animeId}`} value={notes.likedAspects} maxLength={800} onChange={event => field('likedAspects', event.target.value)} placeholder="The quiet character moments, sword-fight choreography…" /></label>
        <label htmlFor={`disliked-${animeId}`}>What didn’t work?<textarea id={`disliked-${animeId}`} value={notes.dislikedAspects} maxLength={800} onChange={event => field('dislikedAspects', event.target.value)} placeholder="Too much filler, rushed ending, slow pacing…" /></label>
      </div>
      <label htmlFor={`visual-${animeId}`}>Animation &amp; art style<input id={`visual-${animeId}`} value={notes.visualStyle} maxLength={400} onChange={event => field('visualStyle', event.target.value)} placeholder="Loved the expressive 2D animation and painted backgrounds…" /></label>
      <label htmlFor={`comment-${animeId}`}>Anything else?<textarea id={`comment-${animeId}`} value={notes.reason} maxLength={1600} onChange={event => field('reason', event.target.value)} placeholder="Your thoughts on the story, episode count, music, or mood…" /></label>
      <div className="row"><button className="primary" disabled={pending}>{pending ? 'Saving notes…' : 'Save viewing notes'}</button><p role={failed ? 'alert' : 'status'}>{message}</p></div>
    </form>
  </section>;
}
