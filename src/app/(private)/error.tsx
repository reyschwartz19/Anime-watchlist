'use client';

export default function PrivateError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="panel stack" role="alert"><h1>This page could not load</h1><p>Your account or saved data is temporarily unavailable. Retry to continue.</p><button type="button" onClick={retry}>Retry</button></section>;
}
