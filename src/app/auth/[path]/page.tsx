import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AuthForm, type AuthMode } from '@/features/auth/AuthForm';
import { isAuthConfigured } from '@/lib/auth';
import { AuthCallback } from '@/features/auth/AuthCallback';
import { Wordmark } from '@/components/Wordmark';
import { previewEnabled } from '@/lib/preview';

const modes: AuthMode[] = ['sign-in', 'sign-up', 'forgot-password', 'reset-password', 'verify-email'];
export const dynamic = 'force-dynamic';

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  if (!modes.includes(path as AuthMode) && path !== 'callback') notFound();
  const configured = isAuthConfigured() || previewEnabled();
  return (
    <main className={`auth-page auth-${path}`}>
      <div className="auth-art"><Wordmark /><div className="entrance-graphic" aria-hidden="true"><span>Find your<br />next story.</span><i /><i /><i /></div></div>
      <div className="auth-control">
        {!configured && <aside className="panel" role="status"><h1>Login setup needed</h1><p>Configure the preview environment using <code>docs/NEON_SETUP.md</code>, then restart the app.</p></aside>}
        {configured && <Suspense fallback={<p role="status">Loading login…</p>}>{path === 'callback' ? <AuthCallback /> : <AuthForm key={path} mode={path as AuthMode} verificationMethod={process.env.NEON_AUTH_EMAIL_VERIFICATION_METHOD === 'link' ? 'link' : 'otp'} />}</Suspense>}
      </div>
    </main>
  );
}
