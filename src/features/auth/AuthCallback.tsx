'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authViewHref, safeAuthDestination } from './destination';
import { oauthErrorMessage, resolveSession } from './session-resolution';

export function AuthCallback() {
  const search = useSearchParams();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const destination = safeAuthDestination(search.get('returnTo'));
  const providerError = search.get('error');
  const email = search.get('email') ?? undefined;
  useEffect(() => {
    let active = true;
    if (providerError) { setError(oauthErrorMessage(providerError)); setPending(false); return; }
    setPending(true); setError('');
    resolveSession(destination).then(result => {
      if (!active) return;
      if (result.kind === 'authenticated') window.location.replace(result.destination);
      else setError('Sign-in did not establish a session. Sign in again to continue.');
    }).catch(() => {
      if (active) setError('Your profile could not be loaded. Retry to continue. Your account has not been changed.');
    }).finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [destination, providerError, attempt]);
  return <section className="auth-panel stack"><h1>{pending ? 'Opening your shelf' : 'Continue to your shelf'}</h1>
    {pending && <p role="status">Checking your sign-in and preferences…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {!pending && !providerError && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}
    {!pending && <Link className="button secondary" href={authViewHref('sign-in', destination, email)}>Sign in</Link>}
  </section>;
}
