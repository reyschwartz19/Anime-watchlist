'use client';

export default function PrivateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="panel stack" role="alert"><h1>This page could not load</h1><p>Your saved data has not been changed. Try loading the page again.</p><button type="button" onClick={reset}>Try again</button></section>;
}
