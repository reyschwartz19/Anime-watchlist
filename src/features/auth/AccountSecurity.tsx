'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

export function AccountSecurity({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function request(operation: () => Promise<{ error?: { message?: string } | null }>, success: string) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await operation();
      if (result.error) throw new Error(result.error.message || 'This change could not be completed.');
      setMessage(success);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'This change failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void request(async () => {
      const result = await authClient.changePassword({ currentPassword: String(data.get('currentPassword')), newPassword: String(data.get('newPassword')), revokeOtherSessions: true });
      if (!result.error) form.reset();
      return result;
    }, 'Password updated. Other sessions were signed out.');
  }

  function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void request(() => authClient.changeEmail({ newEmail: String(data.get('newEmail')).trim(), callbackURL: `${window.location.origin}/profile` }), 'Check your inbox to confirm the email change, then reload this page.');
  }

  return (
    <section className="panel stack" aria-labelledby="security-title">
      <h2 id="security-title">Login and security</h2>
      <p>{email} · {emailVerified ? 'Email verified' : 'Email not verified'}</p>
      {!emailVerified && <div className="stack"><button className="secondary" type="button" disabled={pending} onClick={() => void request(() => authClient.sendVerificationEmail({ email, callbackURL: `${window.location.origin}/profile` }), 'Verification sent. Check your email for a code or link.')}>Send verification again</button><Link href={`/auth/verify-email?email=${encodeURIComponent(email)}`}>Enter a verification code</Link></div>}
      <details>
        <summary>Change login email</summary>
        <form onSubmit={changeEmail} className="stack">
          <label htmlFor="new-email">New email address<input id="new-email" name="newEmail" type="email" autoComplete="email" required maxLength={254} /></label>
          <button type="submit" disabled={pending}>Request email change</button>
        </form>
      </details>
      <details>
        <summary>Change password</summary>
        <form onSubmit={changePassword} className="stack">
          <label htmlFor="current-password">Current password<input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label htmlFor="new-password">New password<input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          <button type="submit" disabled={pending}>Update password</button>
        </form>
        <p>Signed up with Google? <Link href="/auth/forgot-password">Request a password reset</Link> if your account supports email passwords.</p>
      </details>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
