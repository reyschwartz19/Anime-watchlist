import { getVerifiedAuthSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { createIdentityReceipt } from '@/lib/migration-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A download from a verified login binds the operator's explicit CLI destination. */
export async function GET() {
  const noStore = { 'Cache-Control': 'private, no-store' };
  if (process.env.MIGRATION_ENABLED !== 'true' || process.env.MIGRATION_TARGET !== 'preview' || process.env.VERCEL_ENV === 'production') {
    return Response.json({ error: 'Migration identity downloads are disabled.' }, { status: 404, headers: noStore });
  }
  const identity = await getVerifiedAuthSession();
  if (!identity) return Response.json({ error: 'Sign in first.' }, { status: 401, headers: noStore });
  if (!identity.emailVerified || !identity.email) {
    return Response.json({ error: 'Verify the new login email before requesting a destination receipt.' }, { status: 403, headers: noStore });
  }
  const user = await getDb().appUser.findUnique({ where: { authProviderId: identity.id } });
  if (!user) return Response.json({ error: 'Open your library or profile once to create the internal user ID.' }, { status: 409, headers: noStore });
  try {
    const receipt = createIdentityReceipt({ userId: user.id, authProviderId: identity.id, email: identity.email, emailVerified: true }, {
      authBaseUrl: process.env.NEON_AUTH_BASE_URL ?? '',
      databaseUrl: process.env.DATABASE_URL ?? '',
      secret: process.env.MIGRATION_IDENTITY_SECRET ?? '',
    });
    return Response.json(receipt, { headers: { ...noStore, 'Content-Disposition': 'attachment; filename="destination-identity.json"' } });
  } catch {
    return Response.json({ error: 'Migration identity configuration is incomplete. Check the server-only environment variables.' }, { status: 503, headers: noStore });
  }
}
