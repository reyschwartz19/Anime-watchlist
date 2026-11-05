import { redirect } from 'next/navigation';
import { authViewHref } from '@/features/auth/destination';

export default async function AuthEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const destination = query.returnTo ?? query.next;
  const email = typeof query.email === 'string' && query.email.length <= 254 ? query.email : undefined;
  redirect(authViewHref('sign-in', destination, email));
}
