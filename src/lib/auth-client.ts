'use client';

import { createAuthClient } from '@neon/auth/next';

// Same-origin /api/auth proxy. No provider URL or secret is sent to the client.
export const authClient = createAuthClient();
