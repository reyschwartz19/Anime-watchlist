import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AuthForm, type AuthMode } from '@/features/auth/AuthForm';
import { isAuthConfigured } from '@/lib/auth';

const modes: AuthMode[] = ['sign-in', 'sign-up', 'forgot-password', 'reset-password', 'verify-email'];
export const dynamic = 'force-dynamic';

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  if (!modes.includes(path as AuthMode)) notFound();
  return (
    <main className="auth-page">
      {!isAuthConfigured() && <aside className="panel" role="status"><h1>Login setup needed</h1><p>Configure the preview environment using <code>docs/NEON_SETUP.md</code>, then restart the app. No account can be created until setup is complete.</p></aside>}
      {isAuthConfigured() && <Suspense fallback={<p role="status">Loading login…</p>}><AuthForm key={path} mode={path as AuthMode} /></Suspense>}
    </main>
  );
}
