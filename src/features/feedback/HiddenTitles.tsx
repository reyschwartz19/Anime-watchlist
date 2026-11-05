'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreHiddenTitle } from './actions';
export function HiddenTitles({ titles }: { titles: { animeId: number; title: string; strength?: string | null; reason?: string | null }[] }) {
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const status = useRef<HTMLParagraphElement>(null);
  return <div className="stack">{titles.length ? <ul className="hidden-list">{titles.map(item => <li key={item.animeId}><div><strong>{item.title}</strong>{item.reason && <p className="muted">{item.reason}</p>}</div><button disabled={pending} onClick={() => startTransition(async () => { try { const result = await restoreHiddenTitle({ animeId: item.animeId }); setMessage(result.message); if (result.ok) { router.refresh(); requestAnimationFrame(() => status.current?.focus()); } } catch { setMessage('The title could not be restored. Try again.'); } })}>{pending ? 'Restoring…' : 'Restore'}</button></li>)}</ul> : <p className="muted">No hidden titles. When a pick doesn’t fit, you can hide it and restore it here later.</p>}<p ref={status} tabIndex={-1} role="status">{message}</p></div>;
}
