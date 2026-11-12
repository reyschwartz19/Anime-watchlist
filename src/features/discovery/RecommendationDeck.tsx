'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { Check, Heart, X, RotateCcw, ArrowRight } from 'lucide-react';
import { Poster } from '@/features/library/Poster';
import type { RecommendationView } from './actions';

export type PickAction = 'save' | 'watched' | 'not_interested' | 'strong_dismiss' | 'not_tonight';
export function RecommendationDeck({ picks, mode, busy, onAct }: {
  picks: RecommendationView[]; mode: 'new' | 'list'; busy: boolean;
  onAct: (pick: RecommendationView, action: PickAction, reason?: string) => void;
}) {
  const lead = picks[0];
  const [offset, setOffset] = useState(0);
  const [exit, setExit] = useState<'left' | 'right' | null>(null);
  const [reason, setReason] = useState('');
  const origin = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const lastId = useRef(lead?.anime.mal_id);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    setOffset(0); setExit(null); setReason('');
    if (lastId.current !== lead?.anime.mal_id) title.current?.focus({ preventScroll: true });
    lastId.current = lead?.anime.mal_id;
  }, [lead?.anime.mal_id]);
  if (!lead) return null;
  function choose(action: PickAction) {
    if (busy || exit || !lead) return;
    setExit(action === 'save' || action === 'watched' ? 'right' : 'left');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    timer.current = setTimeout(() => onAct(lead, action, reason.trim() || undefined), duration);
  }
  function down(event: PointerEvent<HTMLElement>) {
    if (busy || exit || (event.target as HTMLElement).closest('button,a,input,textarea,summary,details')) return;
    origin.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (!origin.current) return;
    const dx = event.clientX - origin.current.x; const dy = event.clientY - origin.current.y;
    if (Math.abs(dx) > Math.abs(dy)) setOffset(Math.max(-260, Math.min(260, dx)));
  }
  function up() { origin.current = null; if (offset < -70) choose('not_tonight'); else if (offset > 70) choose('save'); else setOffset(0); }
  return <section className="recommendation-deck stack" aria-label="Recommendation deck">
    <div className="deck-heading"><h2>Your next choice</h2><p className="muted" role="status">{picks.length} {picks.length === 1 ? 'pick' : 'picks'} left · Swipe or use the buttons</p></div>
    <div className="swipe-stage">
      {picks.length > 1 && <div className="deck-underlay" aria-hidden="true" />}
      <article className={`swipe-card${exit ? ` exit-${exit}` : ''}${offset ? ' dragging' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { origin.current = null; setOffset(0); }}
        style={offset && !exit ? { transform: `translateX(${offset}px) rotate(${offset / 35}deg)` } : undefined}>
        <div className="deck-art"><Poster anime={lead.anime} eager />{Math.abs(offset) > 35 && <span className="swipe-verdict" aria-hidden="true">{offset > 0 ? 'Save' : 'Pass'}</span>}</div>
        <div className="deck-copy stack">
          <p className="muted deck-facts">{[lead.anime.year, lead.anime.type, lead.anime.episodes ? `${lead.anime.episodes} episodes` : 'Episode count unknown'].filter(Boolean).join(' · ')}</p>
          <h3 ref={title} tabIndex={-1}><Link href={`/anime/${lead.anime.mal_id}?from=%2Frecommendations`}>{lead.anime.title}</Link></h3>
          <p className="pick-reason">{lead.reason}</p>
          {!!lead.anime.genres?.length && <p className="muted deck-genres">{lead.anime.genres.slice(0, 4).join(' · ')}</p>}
          <div className="deck-actions"><button type="button" disabled={busy || !!exit} onClick={() => choose('not_tonight')}><X size={22} aria-hidden="true" />Pass for tonight</button><button type="button" className="primary" disabled={busy || !!exit} onClick={() => choose('save')}><Heart size={22} aria-hidden="true" />{mode === 'list' ? 'Keep on my list' : 'Save to my list'}</button></div>
          <details className="deck-more"><summary>Already seen it, or not your taste?</summary><div className="stack">
            <button type="button" disabled={busy || !!exit} onClick={() => choose('watched')}><Check size={18} aria-hidden="true" />Already watched</button>
            <label htmlFor={`dismiss-reason-${lead.anime.mal_id}`}>Reason (optional)<input id={`dismiss-reason-${lead.anime.mal_id}`} maxLength={1200} value={reason} onChange={event => setReason(event.target.value)} placeholder="Too much filler, not the mood I want…" /></label>
            <div className="row"><button type="button" disabled={busy || !!exit} onClick={() => choose('not_interested')}>Not interested</button><button type="button" disabled={busy || !!exit} onClick={() => choose('strong_dismiss')}>Strongly not interested</button></div>
            <small>Permanent passes stay hidden until you restore them in Profile.</small>
          </div></details>
          <Link className="deck-details" href={`/anime/${lead.anime.mal_id}?from=%2Frecommendations`}>More about this anime <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </article>
    </div>
    {picks.length > 1 && <div className="deck-up-next" aria-label="More picks in this deck"><RotateCcw size={16} aria-hidden="true" /><span>Next in your deck</span>{picks.slice(1).map(pick => <Link key={pick.anime.mal_id} href={`/anime/${pick.anime.mal_id}?from=%2Frecommendations`} aria-label={pick.anime.title}><Poster anime={pick.anime} /></Link>)}</div>}
  </section>;
}
