'use client';

import { startTransition as startHomeTransition, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Undo2, ArrowRight } from 'lucide-react';
import { Poster } from '@/features/library/Poster';
import { FeedbackControls } from '@/features/feedback/FeedbackControls';
import { actOnRecommendation, undoRecommendation } from '@/features/feedback/actions';
import { generateRecommendations, getWatchNext, type GenerationResult, type RecommendationView } from './actions';
import { WATCH_NEXT_REQUEST } from './engine';
import { RecommendationDeck, type PickAction } from './RecommendationDeck';

type BatchState = { requestId: string; mode: 'new' | 'list'; request: string; maxEpisodes: string };
type UndoState = { pick: RecommendationView; operationId: string; token: string; action: PickAction };
export function DiscoverView({ userId }: { userId: string }) {
  const [mode, setMode] = useState<'new' | 'list'>('new');
  const [request, setRequest] = useState('');
  const [maxEpisodes, setMaxEpisodes] = useState('');
  const [recommendations, setRecommendations] = useState<RecommendationView[]>([]);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [actionPending, startAction] = useTransition();
  const [passes, setPasses] = useState<number[]>([]);
  const [actedIds, setActedIds] = useState<number[]>([]);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [home, setHome] = useState<GenerationResult | null>(null);
  const [homePending, setHomePending] = useState(true);
  const homePromise = useRef<{ userId: string; promise: Promise<GenerationResult> } | null>(null);
  const latestOperation = useRef('');
  const operations = useRef(new Map<string, string>());
  const lock = useRef(false);
  const generation = useRef<{ id: string; signature: string } | null>(null);
  const storageKey = `anime-discover-v1:${userId}`;

  useEffect(() => {
    let active = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (saved && typeof saved === 'object') {
        if (saved.mode === 'new' || saved.mode === 'list') setMode(saved.mode);
        if (typeof saved.request === 'string') setRequest(saved.request.slice(0, 1000));
        if (typeof saved.maxEpisodes === 'string') setMaxEpisodes(saved.maxEpisodes);
        const restoredPasses: number[] = Array.isArray(saved.passes) ? saved.passes.filter((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0).slice(0, 1000) : [];
        setPasses(restoredPasses);
        const previousUndo = saved.undo as UndoState | null;
        if (previousUndo && typeof previousUndo.operationId === 'string' && typeof previousUndo.token === 'string' && previousUndo.pick?.anime && Number.isInteger(previousUndo.pick.anime.mal_id)) setUndo(previousUndo);
        const previous = saved.batch as BatchState | null;
        if (previous && typeof previous.requestId === 'string' && (previous.mode === 'new' || previous.mode === 'list') && typeof previous.request === 'string' && typeof previous.maxEpisodes === 'string') {
          setBatch(previous);
          startTransition(async () => {
            try {
              const result = await generateRecommendations({ mode: previous.mode, request: previous.request, requestId: previous.requestId, sessionPassIds: restoredPasses, constraints: previous.maxEpisodes ? { maxEpisodes: Number(previous.maxEpisodes) } : {} });
              if (!active) return;
              if (result.ok) setRecommendations(result.recommendations);
              else { setMessage(result.message); setFailed(result.kind !== 'empty'); }
            } catch { if (active) setMessage('Your last deck could not be reloaded. Choose from Watch next or try your mood again.'); }
          });
        }
      }
    } catch { /* Corrupt or unavailable storage does not block discovery. */ }
    setHydrated(true);
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    startHomeTransition(async () => {
      if (homePromise.current?.userId !== userId) { homePromise.current = { userId, promise: getWatchNext(passes) }; setHome(null); setHomePending(true); }
      try {
        const result = await homePromise.current.promise;
        if (active) { setHome(result); setHomePending(false); }
      } catch {
        if (active) { setHomePending(false); setHome({ ok: false, kind: 'storage', message: 'Watch next could not be loaded. Try your mood below.' }); }
      }
    });
    return () => { active = false; };
    // Passes are read once for this page load; swipes filter the rail locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, userId]);
  useEffect(() => {
    if (hydrated) try { sessionStorage.setItem(storageKey, JSON.stringify({ mode, request, maxEpisodes, passes, batch, undo })); } catch {}
  }, [storageKey, hydrated, mode, request, maxEpisodes, passes, batch, undo]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function openHome() {
    if (!home?.ok) return;
    setMode('new'); setRequest(''); setMaxEpisodes(''); setUndo(null); setMessage('');
    setRecommendations(home.recommendations.filter(pick => !passes.includes(pick.anime.mal_id) && !actedIds.includes(pick.anime.mal_id)));
    setBatch({ requestId: home.requestId, mode: 'new', request: WATCH_NEXT_REQUEST, maxEpisodes: '' });
    requestAnimationFrame(() => document.getElementById('deck-area')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }));
  }
  function generate() {
    if (lock.current || cooldown > 0 || homePending) return;
    lock.current = true; setMessage(''); setFailed(false);
    const constraints = maxEpisodes ? { maxEpisodes: Number(maxEpisodes) } : {};
    const signature = JSON.stringify({ mode, request, constraints });
    if (!generation.current || generation.current.signature !== signature) generation.current = { id: crypto.randomUUID(), signature };
    const requestId = generation.current.id;
    startTransition(async () => {
      try {
        const result = await generateRecommendations({ mode, request, sessionPassIds: passes, constraints, requestId });
        if (result.ok) { setRecommendations(result.recommendations); setBatch({ requestId, mode, request, maxEpisodes }); setUndo(null); generation.current = null; }
        else { setMessage(result.message); setFailed(result.kind !== 'empty'); if (result.kind === 'empty') setRecommendations([]); if (result.retryAfterSeconds) setCooldown(Math.ceil(result.retryAfterSeconds)); if (result.newRequestRequired) generation.current = null; }
      } catch { setFailed(true); setMessage('Your picks could not be loaded. Your mood is kept; try again.'); }
      finally { lock.current = false; }
    });
  }
  function act(pick: RecommendationView, action: PickAction, reason?: string) {
    const signature = JSON.stringify([pick.requestId, pick.anime.mal_id, action, reason ?? '']);
    const operationId = operations.current.get(signature) ?? crypto.randomUUID();
    operations.current.set(signature, operationId); latestOperation.current = operationId;
    setUndo(null); setMessage('Saving your choice…'); setFailed(false);
    setRecommendations(current => current.filter(item => item.anime.mal_id !== pick.anime.mal_id));
    setActedIds(current => [...new Set([...current, pick.anime.mal_id])]);
    if (action === 'not_tonight') setPasses(current => [...new Set([...current, pick.anime.mal_id])].slice(-1000));
    // Advancing the local deck is immediate. Queued writes never call the model.
    startAction(async () => {
      try {
        const result = await actOnRecommendation({ requestId: pick.requestId, animeId: pick.anime.mal_id, action, operationId, ...(reason ? { reason } : {}) });
        if (result.ok) {
          operations.current.delete(signature);
          if (latestOperation.current === operationId) { setMessage(result.message); if (result.undoToken) setUndo({ pick, operationId, token: result.undoToken, action }); }
        } else {
          setRecommendations(current => current.some(item => item.anime.mal_id === pick.anime.mal_id) ? current : [...current, pick]);
          setActedIds(current => current.filter(id => id !== pick.anime.mal_id));
          if (action === 'not_tonight') setPasses(current => current.filter(id => id !== pick.anime.mal_id));
          setFailed(true); setMessage(`${result.message} The card is back in your deck.`);
        }
      } catch {
        setRecommendations(current => current.some(item => item.anime.mal_id === pick.anime.mal_id) ? current : [...current, pick]);
        setActedIds(current => current.filter(id => id !== pick.anime.mal_id));
        if (action === 'not_tonight') setPasses(current => current.filter(id => id !== pick.anime.mal_id));
        setFailed(true); setMessage('We couldn’t confirm that choice. The card is back; retrying the same action is safe.');
      }
    });
  }
  function undoLast() {
    if (!undo || actionPending) return;
    const previous = undo;
    startAction(async () => {
      try {
        const result = await undoRecommendation({ operationId: previous.operationId, undoToken: previous.token });
        setMessage(result.message); setFailed(!result.ok);
        if (!result.ok) return;
        const remaining = passes.filter(id => id !== previous.pick.anime.mal_id);
        setPasses(remaining); setActedIds(current => current.filter(id => id !== previous.pick.anime.mal_id)); setUndo(null);
        if (batch) {
          const result = await generateRecommendations({ mode: batch.mode, request: batch.request, requestId: batch.requestId, sessionPassIds: remaining, constraints: batch.maxEpisodes ? { maxEpisodes: Number(batch.maxEpisodes) } : {} });
          if (result.ok) setRecommendations(result.recommendations);
        }
      } catch { setMessage('Undo could not be confirmed. Try again.'); setFailed(true); }
    });
  }
  const homePicks = home?.ok ? home.recommendations.filter(pick => !passes.includes(pick.anime.mal_id) && !actedIds.includes(pick.anime.mal_id)) : [];
  return <div className="stack discover-experience">
    <section className="watch-next stack" aria-labelledby="watch-next-title" aria-busy={homePending}>
      <div className="section-heading"><div><h2 id="watch-next-title">Watch next</h2><p className="muted">Picked from your watched titles, notes, and favorites.</p></div>{homePicks.length > 0 && <button type="button" onClick={openHome}>Start swiping <ArrowRight size={18} aria-hidden="true" /></button>}</div>
      {homePending ? <div className="watch-next-loading" role="status"><p>Finding a few good stories for your shelf…</p><small>Your next visit reuses these picks. No new search needed.</small></div> : homePicks.length ? <div className="watch-next-rail">{homePicks.map(pick => <Link className="watch-next-item" key={pick.anime.mal_id} href={`/anime/${pick.anime.mal_id}?from=%2Frecommendations`}><div className="watch-next-art"><Poster anime={pick.anime} /></div><div className="watch-next-caption"><h3>{pick.anime.title}</h3><p className="muted">{[pick.anime.type, pick.anime.episodes ? `${pick.anime.episodes} eps` : null].filter(Boolean).join(' · ')}</p></div></Link>)}</div> : <p className="muted">{home && !home.ok ? home.message : 'You’ve explored these picks. Set a mood below for another deck.'}</p>}
    </section>
    <section className="discover-controls stack" aria-labelledby="mood-heading"><h2 id="mood-heading">Find tonight’s anime</h2>
      <div className="mode-switch" role="group" aria-label="Discovery mode"><button type="button" aria-pressed={mode === 'new'} disabled={pending || !hydrated} onClick={() => { setMode('new'); setRecommendations([]); setBatch(null); }}>Find something new</button><button type="button" aria-pressed={mode === 'list'} disabled={pending || !hydrated} onClick={() => { setMode('list'); setRecommendations([]); setBatch(null); }}>Pick from my list</button></div>
      <form className="stack" onSubmit={event => { event.preventDefault(); generate(); }}><div className="request-row"><label htmlFor="discover-request">What are you in the mood for?<input id="discover-request" autoComplete="off" placeholder="Sword fights, expressive animation, a short season…" value={request} onChange={event => setRequest(event.target.value)} maxLength={1000} /></label><button className="primary" disabled={pending || !hydrated || cooldown > 0 || homePending}>{pending ? 'Building your deck…' : cooldown > 0 ? `Try again in ${cooldown}s` : 'Find my next anime'}</button></div><details><summary>More options</summary><label className="constraint-field" htmlFor="max-episodes">Maximum episodes<input id="max-episodes" type="number" min={1} max={5000} value={maxEpisodes} onChange={event => setMaxEpisodes(event.target.value)} placeholder="Any length" /></label></details></form>
    </section>
    <div id="deck-area" className="stack">
      {message && <div className="undo-notice" role={failed ? 'alert' : 'status'}><p>{message}</p>{undo && <button disabled={actionPending} onClick={undoLast}><Undo2 size={18} aria-hidden="true" />Undo</button>}</div>}
      {undo?.action === 'watched' && <div className="panel stack"><p>How did {undo.pick.anime.title} fit your taste?</p><FeedbackControls animeId={undo.pick.anime.mal_id} initialValue={undo.pick.feedback} requestId={undo.pick.requestId} /><Link href={`/anime/${undo.pick.anime.mal_id}?from=%2Frecommendations#viewing-notes`}>Add detailed viewing notes</Link></div>}
      {recommendations.length ? <RecommendationDeck key={batch?.requestId} picks={recommendations} mode={mode} busy={pending} onAct={act} /> : batch ? <div className="empty-state"><h2>That’s this deck</h2><p>Passing doesn’t cost a new recommendation request. When you’re ready, we’ll find up to five more eligible picks.</p><button type="button" className="primary" disabled={pending || cooldown > 0 || homePending} onClick={generate}>Find another five</button></div> : <p className="muted">Start with Watch next or choose a mood. Save right, pass left, and keep going through the deck.</p>}
    </div>
  </div>;
}
