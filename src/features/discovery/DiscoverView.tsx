'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Plus, X, Check, ChevronDown, Undo2 } from 'lucide-react';
import { Poster } from '@/features/library/Poster';
import { FeedbackControls } from '@/features/feedback/FeedbackControls';
import { actOnRecommendation, undoRecommendation } from '@/features/feedback/actions';
import { generateRecommendations, type RecommendationView } from './actions';

type PickAction = 'save' | 'watched' | 'not_interested' | 'strong_dismiss' | 'not_tonight';
type BatchState = { requestId: string; mode: 'new' | 'list'; request: string; maxEpisodes: string };
type UndoState = { pick: RecommendationView; index: number; operationId: string; token: string; action: PickAction };
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
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [passId, setPassId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const operations = useRef(new Map<string, string>());
  const undoButton = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const generation = useRef<{ id: string; signature: string } | null>(null);
  const passTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const storageKey = `anime-discover-v1:${userId}`;
  useEffect(() => {
    let active = true;
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (stored && typeof stored === 'object') {
        const saved = stored as Record<string, unknown>;
        if (saved.mode === 'new' || saved.mode === 'list') setMode(saved.mode);
        if (typeof saved.request === 'string') setRequest(saved.request.slice(0, 1000));
        if (typeof saved.maxEpisodes === 'string') setMaxEpisodes(saved.maxEpisodes);
        const restoredPasses = Array.isArray(saved.passes) ? saved.passes.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0).slice(0, 1000) : [];
        setPasses(restoredPasses);
        const previousUndo = saved.undo as UndoState | null;
        if (previousUndo && typeof previousUndo.operationId === 'string' && typeof previousUndo.token === 'string' && previousUndo.pick?.anime && Number.isInteger(previousUndo.pick.anime.mal_id) && typeof previousUndo.pick.anime.title === 'string') {
          setUndo({ ...previousUndo, pick: { ...previousUndo.pick, anime: { ...previousUndo.pick.anime, imageUrl: null } } });
          setMessage('Your last choice is saved. You can undo it here.');
        }
        const previousBatch = saved.batch as BatchState | null;
        if (previousBatch && typeof previousBatch.requestId === 'string' && (previousBatch.mode === 'new' || previousBatch.mode === 'list') && typeof previousBatch.request === 'string' && typeof previousBatch.maxEpisodes === 'string') {
          setBatch(previousBatch);
          // Restore by owner-checked request ID. Never display a stored pick
          // without rechecking current library, dismissals and session passes.
          startTransition(async () => {
            try {
              const result = await generateRecommendations({ mode: previousBatch.mode, request: previousBatch.request, requestId: previousBatch.requestId, sessionPassIds: restoredPasses, constraints: previousBatch.maxEpisodes ? { maxEpisodes: Number(previousBatch.maxEpisodes) } : {} });
              if (!active) return;
              if (result.ok) setRecommendations(result.recommendations);
              else { setMessage(result.message); setFailed(result.kind !== 'empty'); }
            } catch { if (active) { setFailed(true); setMessage('Your previous picks could not be reloaded. Your request is still here; try again.'); } }
          });
        }
      }
    } catch { /* Corrupt or blocked storage must not prevent discovery. */ }
    setHydrated(true);
    return () => { active = false; };
  }, [storageKey]);
  useEffect(() => {
    if (hydrated) try { sessionStorage.setItem(storageKey, JSON.stringify({ mode, request, maxEpisodes, passes, batch, undo })); } catch {}
  }, [storageKey, hydrated, mode, request, maxEpisodes, passes, batch, undo]);
  function generate() {
    if (lock.current) return;
    lock.current = true;
    setMessage(''); setFailed(false); setPassId(null);
    const constraints = maxEpisodes ? { maxEpisodes: Number(maxEpisodes) } : {};
    const signature = JSON.stringify({ mode, request, constraints });
    if (!generation.current || generation.current.signature !== signature) generation.current = { id: crypto.randomUUID(), signature };
    const requestId = generation.current.id;
    startTransition(async () => {
      try {
        const result = await generateRecommendations({ mode, request, sessionPassIds: passes, constraints, requestId });
        if (result.ok) { setRecommendations(result.recommendations); setBatch({ requestId, mode, request, maxEpisodes }); setUndo(null); generation.current = null; requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }
        else { setMessage(result.message); setFailed(result.kind !== 'empty'); if (result.kind === 'empty') setRecommendations([]); }
      } catch { setFailed(true); setMessage('Your picks could not be loaded. Your request is still here. Try again.'); }
      finally { lock.current = false; }
    });
  }
  function act(pick: RecommendationView, action: PickAction) {
    if (lock.current) return;
    lock.current = true;
    setMessage(''); setFailed(false);
    const signature = JSON.stringify({ requestId: pick.requestId, animeId: pick.anime.mal_id, action, reason: reason.trim() });
    const operationId = operations.current.get(signature) ?? crypto.randomUUID();
    operations.current.set(signature, operationId);
    startAction(async () => {
      try {
        const result = await actOnRecommendation({ requestId: pick.requestId, animeId: pick.anime.mal_id, action, operationId, ...(reason.trim() ? { reason } : {}) });
        setMessage(result.message); setFailed(!result.ok);
        if (result.ok) {
          operations.current.delete(signature);
          if (result.undoToken) setUndo({ pick, index: recommendations.findIndex(p => p.anime.mal_id === pick.anime.mal_id), operationId, token: result.undoToken, action });
          setRecommendations(current => current.filter(p => p.anime.mal_id !== pick.anime.mal_id));
          if (action === 'not_tonight') setPasses(current => [...new Set([...current, pick.anime.mal_id])]);
          setPassId(null); setReason(''); requestAnimationFrame(() => { if (recommendations.length <= 1) undoButton.current?.focus(); else heading.current?.focus({ preventScroll: true }); });
        }
      } catch { setFailed(true); setMessage('We couldn’t confirm your choice. Retry the same action to safely check it.'); }
      finally { lock.current = false; }
    });
  }
  function undoLast() {
    if (!undo || lock.current) return;
    lock.current = true;
    const previous = undo;
    startAction(async () => {
      try {
        const result = await undoRecommendation({ operationId: previous.operationId, undoToken: previous.token });
        setMessage(result.message); setFailed(!result.ok);
        if (result.ok) { setRecommendations(current => { const next = current.filter(p => p.anime.mal_id !== previous.pick.anime.mal_id); next.splice(previous.index, 0, previous.pick); return next; }); setPasses(current => current.filter(id => id !== previous.pick.anime.mal_id)); setUndo(null); }
      } catch { setFailed(true); setMessage('Undo could not be saved. Try again.'); }
      finally { lock.current = false; }
    });
  }
  const busy = pending || actionPending;
  const lead = recommendations[0];
  return <div className="stack">
    <div className="discover-controls"><div className="mode-switch" role="group" aria-label="Discovery mode"><button type="button" aria-pressed={mode === 'new'} disabled={busy || !hydrated} onClick={() => { setMode('new'); setRecommendations([]); setBatch(null); setUndo(null); }}>Find something new</button><button type="button" aria-pressed={mode === 'list'} disabled={busy || !hydrated} onClick={() => { setMode('list'); setRecommendations([]); setBatch(null); setUndo(null); }}>Pick from my list</button></div>
      <details className="request-settings" open={lead ? undefined : true}><summary>{lead ? 'Adjust your request' : 'Set your mood'}</summary><form onSubmit={event => { event.preventDefault(); generate(); }} className="stack"><div className="request-row"><label htmlFor="discover-request">What are you in the mood for?<input id="discover-request" name="request" autoComplete="off" placeholder="Sword fights and a great soundtrack…" value={request} onChange={e => setRequest(e.target.value)} maxLength={1000} /></label><button className="primary" type="submit" disabled={busy || !hydrated}>{pending ? 'Finding your picks…' : recommendations.length ? 'Find more picks' : 'Find my next anime'}</button></div><details><summary>More options</summary><label className="constraint-field" htmlFor="max-episodes">Maximum episodes<input id="max-episodes" name="maxEpisodes" type="number" min={1} max={5000} value={maxEpisodes} onChange={e => setMaxEpisodes(e.target.value)} placeholder="Any length…" /></label></details></form></details>
    </div>
    {message && <div className="undo-notice" role={failed ? 'alert' : 'status'}><p>{message}</p>{undo && <button ref={undoButton} disabled={busy} onClick={undoLast}><Undo2 size={18} aria-hidden="true" />Undo</button>}</div>}
    {undo?.action === 'watched' && <div className="panel stack"><p>How did {undo.pick.anime.title} fit your taste? This is optional.</p><FeedbackControls animeId={undo.pick.anime.mal_id} initialValue={undo.pick.feedback} requestId={undo.pick.requestId} /></div>}
    {lead ? <><article className="featured-pick" aria-label="Featured recommendation"><div className="featured-art"><Poster anime={lead.anime} eager /></div><div className="featured-copy"><h2 ref={heading} tabIndex={-1}><Link href={`/anime/${lead.anime.mal_id}?from=%2Frecommendations`}>{lead.anime.title}</Link></h2><p className="muted">{[lead.anime.year, lead.anime.type].filter(Boolean).join(' · ')}</p><p className="pick-reason">{lead.reason}</p><div className="pick-actions"><button className="primary" disabled={busy} onClick={() => act(lead, 'save')}><Plus size={24} aria-hidden="true" />{actionPending ? 'Saving…' : mode === 'list' ? 'Keep on my list' : 'Save'}</button><button ref={passTrigger} aria-expanded={passId === lead.anime.mal_id} aria-controls="pass-options" disabled={busy} onClick={() => setPassId(current => current === lead.anime.mal_id ? null : lead.anime.mal_id)}><X size={24} aria-hidden="true" />Pass<ChevronDown size={16} aria-hidden="true" /></button>
      {passId === lead.anime.mal_id && <div id="pass-options" className="pass-options" onKeyDown={event => { if (event.key === 'Escape') { setPassId(null); passTrigger.current?.focus(); } }}><button disabled={busy} onClick={() => act(lead, 'not_tonight')}>Not tonight · this session</button><label htmlFor="pass-reason">Reason (optional)<input id="pass-reason" name="reason" autoComplete="off" maxLength={1200} value={reason} onChange={e => setReason(e.target.value)} placeholder="What didn’t fit…" /></label><button disabled={busy} onClick={() => act(lead, 'not_interested')}>Not interested</button><button disabled={busy} onClick={() => act(lead, 'strong_dismiss')}>Strongly not interested</button><small>Hidden titles stay hidden until you restore them in Profile.</small></div>}
    </div><button disabled={busy} onClick={() => act(lead, 'watched')}><Check size={20} aria-hidden="true" />Already watched</button></div></article>
    {recommendations.length > 1 && <section className="stack"><h2>Also for your shelf</h2><div className="secondary-picks">{recommendations.slice(1).map(pick => <article className="secondary-pick" key={pick.anime.mal_id}><Link href={`/anime/${pick.anime.mal_id}?from=%2Frecommendations`} aria-label={`Details for ${pick.anime.title}`}><Poster anime={pick.anime} /></Link><div className="stack"><h3>{pick.anime.title}</h3><p>{pick.reason}</p><button disabled={busy} onClick={() => act(pick, 'save')}><Plus size={18} aria-hidden="true" />Save</button></div></article>)}</div></section>}</> : <div className="empty-state"><h2>{mode === 'new' ? 'Make room for a new favorite' : 'A good night is already on your shelf'}</h2><p>{mode === 'new' ? 'A few considered picks, based on your favorites and the things you tell us. Everything already on your list stays out.' : 'We’ll choose only from your Plan to Watch titles, with your mood in mind.'}</p><div className="row"><Link href="/profile">Refine your taste</Link><Link href="/search">Search a title</Link></div></div>}
  </div>;
}
