'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setPending(true);
    setError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      window.location.assign('/auth/sign-in');
    } catch {
      setError('Sign-out failed. Please try again.');
      setPending(false);
    }
  }
  return <div><button type="button" className="secondary" onClick={signOut} disabled={pending}>{pending ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error">{error}</p>}</div>;
}

export const AccountControls = SignOutButton;
