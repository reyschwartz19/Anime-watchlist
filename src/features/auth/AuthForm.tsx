'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { authViewHref, safeAuthDestination } from './destination';
import { oauthErrorMessage, resolveSession } from './session-resolution';
import { providerErrorCode, providerErrorMessage, type AuthProviderError } from './provider-errors';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' | 'verify-email';
type ProviderResult = { error?: AuthProviderError | null };
const titles: Record<AuthMode, string> = {
  'sign-in': 'Sign in', 'sign-up': 'Create an account', 'forgot-password': 'Reset your password',
  'reset-password': 'Choose a new password', 'verify-email': 'Verify your email',
};

function requireSuccess(result: ProviderResult) {
  if (!result.error) return;
  throw new Error(providerErrorMessage(result.error));
}

export function AuthForm({ mode, verificationMethod = 'otp' }: { mode: AuthMode; verificationMethod?: 'otp' | 'link' }) {
  const search = useSearchParams();
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState(search.get('error') ? oauthErrorMessage(search.get('error')) : '');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(search.get('email') ?? '');
  const [emailExpanded, setEmailExpanded] = useState(mode !== 'sign-in' || Boolean(search.get('email')));
  const [verifiedNeedsSignIn, setVerifiedNeedsSignIn] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const lock = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const destination = safeAuthDestination(search.get('returnTo') ?? search.get('next'));
  const callback = `/auth/callback?${new URLSearchParams({ returnTo: destination, ...(email ? { email } : {}) })}`;
  const cooldownKey = `manga-shelf:verification-resend:${email.trim().toLowerCase()}`;

  useEffect(() => {
    if (error) panel.current?.querySelector<HTMLElement>('[aria-invalid="true"], #auth-error')?.focus();
  }, [error]);

  useEffect(() => {
    function update() {
      try { setCooldown(Math.max(0, Math.ceil((Number(sessionStorage.getItem(cooldownKey) ?? 0) - Date.now()) / 1000))); }
      catch { /* Resend still follows the server's rate limit. */ }
    }
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [cooldownKey]);

  function startCooldown(seconds = 60) {
    setCooldown(seconds);
    try { sessionStorage.setItem(cooldownKey, String(Date.now() + seconds * 1000)); } catch { /* Browser storage may be blocked. */ }
  }

  async function continueFromServer() {
    const resolved = await resolveSession(destination);
    if (resolved.kind === 'signed-out') return false;
    window.location.assign(resolved.destination);
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending(true); setError(''); setMessage('');
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    try {
      if (mode === 'sign-in') {
        const result = await authClient.signIn.email({ email: email.trim(), password, callbackURL: `${window.location.origin}${callback}` });
        if (providerErrorCode(result.error) === 'EMAIL_NOT_VERIFIED') {
          window.location.assign(authViewHref('verify-email', destination, email.trim()));
          return;
        }
        requireSuccess(result);
        if (!await continueFromServer()) throw new Error('The sign-in response did not establish a session. Try signing in again.');
      } else if (mode === 'sign-up') {
        const created = await authClient.signUp.email({ email: email.trim(), password, name: String(data.get('name') ?? '').trim(), callbackURL: `${window.location.origin}${callback}` });
        requireSuccess(created);
        if (created.data?.user.emailVerified) {
          setVerificationComplete(true);
          if (!await continueFromServer()) { setVerifiedNeedsSignIn(true); setMessage('Your account is ready. Sign in once to continue.'); }
          return;
        }
        // Neon sends the configured verification message on signup. Never retain the password.
        startCooldown();
        window.location.assign(`${authViewHref('verify-email', destination, email.trim())}&sent=1`);
      } else if (mode === 'forgot-password') {
        requireSuccess(await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}${authViewHref('reset-password', destination, email)}` }));
        setMessage('If this account can receive a reset email, it has been sent. Check your inbox.');
      } else if (mode === 'reset-password') {
        const token = search.get('token');
        if (!token) throw new Error('This reset link is missing its token. Request a new password reset below.');
        requireSuccess(await authClient.resetPassword({ newPassword: password, token }));
        setVerifiedNeedsSignIn(true);
        setMessage('Your password is updated. Sign in with your new password.');
      } else if (verificationMethod === 'otp') {
        requireSuccess(await authClient.emailOtp.verifyEmail({ email: email.trim(), otp: String(data.get('code') ?? '').trim() }));
        setVerificationComplete(true);
        if (!await continueFromServer()) {
          setVerifiedNeedsSignIn(true);
          setMessage('Your email is verified. Sign in once to continue.');
        }
      } else {
        if (!await continueFromServer()) setMessage('Open the verification link in your email, then return here to continue.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? providerErrorMessage(problem) : 'The request failed. Please try again.');
    } finally { lock.current = false; setPending(false); }
  }

  async function google() {
    if (lock.current) return;
    lock.current = true;
    setPending(true); setGooglePending(true); setError('');
    try {
      requireSuccess(await authClient.signIn.social({
        provider: 'google', callbackURL: `${window.location.origin}${callback}`,
        newUserCallbackURL: `${window.location.origin}${callback}`,
        errorCallbackURL: `${window.location.origin}${authViewHref('sign-in', destination, email)}`,
      }));
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Google sign-in failed. Try email sign-in.'); }
    finally { lock.current = false; setPending(false); setGooglePending(false); }
  }

  async function resendVerification() {
    if (lock.current || cooldown > 0) return;
    lock.current = true;
    setPending(true); setError('');
    let providerCooldown = 60;
    const timing = { onResponse: ({ response }: { response: Response }) => {
      const seconds = Number(response.headers.get('Retry-After'));
      if (Number.isFinite(seconds) && seconds > 0) providerCooldown = Math.ceil(seconds);
    } };
    try {
      if (!email.trim()) throw new Error('Enter your email address before requesting verification.');
      const result = verificationMethod === 'otp'
        ? await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' }, timing)
        : await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: `${window.location.origin}${callback}` }, timing);
      requireSuccess(result);
      startCooldown(providerCooldown);
      setMessage(verificationMethod === 'otp' ? 'A new code was sent. Use the most recent email.' : 'A new verification link was sent. Check your inbox.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Verification could not be sent. Please try again.');
      startCooldown(providerCooldown);
    } finally { lock.current = false; setPending(false); }
  }

  return <section ref={panel} className="auth-panel stack" aria-labelledby="auth-title">
    <h1 id="auth-title">{titles[mode]}</h1>
    {mode === 'sign-in' && <p>Find your next story. Keep the ones you love.</p>}
    {mode === 'sign-up' && <p>A shelf for your favorites. A little help finding the next one.</p>}
    {mode === 'verify-email' && <p>{verificationMethod === 'otp' ? 'Enter the code sent to' : 'Open the verification link sent to'} <strong>{email || 'your email address'}</strong>.</p>}
    {mode === 'sign-in' && <>
      <button className="google-button secondary" type="button" onClick={google} disabled={pending}>{googlePending ? 'Connecting to Google…' : 'Continue with Google'}</button>
      {googlePending && <p role="status">Opening Google sign-in…</p>}
      {!emailExpanded && <button className="secondary" type="button" onClick={() => setEmailExpanded(true)}><Mail size={22} aria-hidden="true" />Continue with email</button>}
    </>}
    {(emailExpanded || mode !== 'sign-in') && !verifiedNeedsSignIn && !verificationComplete && <form onSubmit={submit} className="stack">
      <fieldset className="stack" disabled={pending}>
        <legend className="sr-only">{titles[mode]}</legend>
        {mode === 'sign-up' && <label htmlFor="auth-name">Display name<input id="auth-name" name="name" autoComplete="name" required maxLength={120} /></label>}
        {mode !== 'reset-password' && <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} readOnly={mode === 'verify-email' && Boolean(search.get('email'))} /></label>}
        {(['sign-in', 'sign-up', 'reset-password'] as AuthMode[]).includes(mode) && <label htmlFor="auth-password">{mode === 'reset-password' ? 'New password' : 'Password'}<input id="auth-password" name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={mode === 'sign-in' ? undefined : 8} maxLength={128} aria-describedby={mode !== 'sign-in' ? 'password-help' : undefined} /></label>}
        {(mode === 'sign-up' || mode === 'reset-password') && <p id="password-help" className="field-help">Use at least 8 characters.</p>}
        {mode === 'verify-email' && verificationMethod === 'otp' && <label htmlFor="auth-code">Verification code<input id="auth-code" name="code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} required maxLength={32} aria-invalid={Boolean(error)} aria-describedby={error ? 'code-help auth-error' : 'code-help'} /></label>}
        {mode === 'verify-email' && verificationMethod === 'otp' && <p id="code-help" className="field-help">You can paste the full code from your email.</p>}
        <button type="submit" className="primary">{pending ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : mode === 'forgot-password' ? 'Send reset email' : mode === 'reset-password' ? 'Update password' : mode === 'verify-email' ? verificationMethod === 'otp' ? 'Verify email' : 'I have verified my email' : 'Sign in'}<ArrowRight size={20} aria-hidden="true" /></button>
      </fieldset>
    </form>}
    {error && <p id="auth-error" role="alert" tabIndex={-1} className="error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}
    {message && <p role="status">{message}</p>}
    {verifiedNeedsSignIn && <Link className="button primary" href={authViewHref('sign-in', destination, email)}>Sign in to continue</Link>}
    {verificationComplete && !verifiedNeedsSignIn && !pending && <button type="button" onClick={async () => {
      if (lock.current) return;
      lock.current = true; setPending(true); setError('');
      try { if (!await continueFromServer()) { setVerifiedNeedsSignIn(true); setMessage('Your email is verified. Sign in once to continue.'); } }
      catch { setError('Your profile could not be loaded. Retry to continue. Your email is already verified.'); }
      finally { lock.current = false; setPending(false); }
    }}>Continue to my shelf</button>}
    {mode === 'verify-email' && !verifiedNeedsSignIn && !verificationComplete && <div className="stack">
      <button className="secondary" type="button" onClick={resendVerification} disabled={pending || cooldown > 0}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification'}</button>
      <Link href={authViewHref('sign-up', destination)}>Change email</Link>
      <p className="field-help">Use another address by creating an account with the correct email.</p>
    </div>}
    <nav className="auth-links" aria-label="Login options">
      {mode === 'sign-in' && <p>New to Anime Watchlist? <Link href={authViewHref('sign-up', destination, email)}>Create an account</Link></p>}
      {mode === 'sign-in' && emailExpanded && <Link href={authViewHref('forgot-password', destination, email)}>Forgot your password?</Link>}
      {mode === 'sign-up' && <p>Already have an account? <Link href={authViewHref('sign-in', destination, email)}>Sign in</Link></p>}
      {mode === 'forgot-password' && <Link href={authViewHref('sign-in', destination, email)}>Back to sign in</Link>}
      {mode === 'reset-password' && !verifiedNeedsSignIn && <Link href={authViewHref('forgot-password', destination, email)}>Request a new reset link</Link>}
    </nav>
  </section>;
}
