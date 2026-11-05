'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';
import { authViewHref, safeAuthDestination } from './destination';

export type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' | 'verify-email';

const titles: Record<AuthMode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create your new login',
  'forgot-password': 'Reset your password',
  'reset-password': 'Choose a new password',
  'verify-email': 'Verify your email',
};

function requireSuccess(result: { error?: { message?: string } | null }) {
  if (result.error) throw new Error(result.error.message || 'This request could not be completed. Please try again.');
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const search = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(search.get('email') ?? '');
  const destination = safeAuthDestination(search.get('returnTo') ?? search.get('next'));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    try {
      if (mode === 'sign-in') {
        requireSuccess(await authClient.signIn.email({ email, password, callbackURL: `${window.location.origin}${destination}` }));
        window.location.assign(destination);
        return;
      }
      if (mode === 'sign-up') {
        requireSuccess(await authClient.signUp.email({ email, password, name: String(data.get('name') ?? '').trim() }));
        form.reset();
        setMessage('Your new login is created. Complete email verification if requested, then sign in.');
      } else if (mode === 'forgot-password') {
        requireSuccess(await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}${authViewHref('reset-password', destination)}` }));
        setMessage('If this account can receive a reset email, it has been sent. Check your inbox.');
      } else if (mode === 'reset-password') {
        const token = search.get('token');
        if (!token) throw new Error('This reset link is missing its token. Request a new password reset.');
        requireSuccess(await authClient.resetPassword({ newPassword: password, token }));
        form.reset();
        setMessage('Your password is updated. Sign in with your new password.');
      } else {
        requireSuccess(await authClient.emailOtp.verifyEmail({ email, otp: String(data.get('code') ?? '').trim() }));
        setMessage('Your email is verified. Sign in to continue.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The request failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  async function google() {
    setPending(true);
    setError('');
    try {
      requireSuccess(await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}${destination}` }));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Google sign-in failed. Try email sign-in.');
    } finally {
      setPending(false);
    }
  }

  async function resendVerification() {
    setPending(true);
    setError('');
    try {
      if (!email.trim()) throw new Error('Enter your email address before requesting verification.');
      requireSuccess(await authClient.sendVerificationEmail({ email, callbackURL: `${window.location.origin}${authViewHref('sign-in', destination)}` }));
      setMessage('Verification sent. Enter the emailed code here, or follow the link if your account uses links.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Verification could not be sent. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-panel panel" aria-labelledby="auth-title">
      <h1 id="auth-title">{titles[mode]}</h1>
      {mode === 'sign-up' && <p>Create a new login for this version. Your Firebase login and data stay intact; this does not import your list.</p>}
      <form onSubmit={submit} className="stack">
        {mode === 'sign-up' && <label htmlFor="auth-name">Display name<input id="auth-name" name="name" autoComplete="name" required maxLength={120} /></label>}
        {mode !== 'reset-password' && <label htmlFor="auth-email">Email address<input id="auth-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>}
        {(['sign-in', 'sign-up', 'reset-password'] as AuthMode[]).includes(mode) && <label htmlFor="auth-password">{mode === 'reset-password' ? 'New password' : 'Password'}<input id="auth-password" name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} required minLength={mode === 'sign-in' ? undefined : 8} maxLength={128} /></label>}
        {mode === 'verify-email' && <label htmlFor="auth-code">Verification code<input id="auth-code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={32} /></label>}
        {error && <p role="alert" className="error">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'sign-up' ? 'Create login' : mode === 'forgot-password' ? 'Send reset email' : mode === 'reset-password' ? 'Update password' : mode === 'verify-email' ? 'Verify email' : 'Sign in'}</button>
      </form>
      {mode === 'sign-in' && <button className="secondary" type="button" onClick={google} disabled={pending}>Continue with Google</button>}
      {mode === 'verify-email' && <button className="secondary" type="button" onClick={resendVerification} disabled={pending}>Send verification again</button>}
      <nav className="auth-links" aria-label="Login options">
        {mode !== 'sign-in' && <Link href={authViewHref('sign-in', destination, email)}>Sign in</Link>}
        {mode !== 'sign-up' && <Link href={authViewHref('sign-up', destination, email)}>Create a new login</Link>}
        {mode === 'sign-in' && <Link href={authViewHref('forgot-password', destination, email)}>Forgot your password?</Link>}
        {mode !== 'verify-email' && <Link href={authViewHref('verify-email', destination, email)}>Verify email</Link>}
      </nav>
    </section>
  );
}
