/**
 * Runs once when the server starts, in every runtime Next.js boots.
 *
 * Its only job is to refuse to serve traffic with a missing production secret.
 * Validating here rather than at module load keeps `next build` from requiring
 * runtime credentials, while still failing a bad deployment immediately rather
 * than on the first request that happens to need a session.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { checkRequiredEnv, env } = await import('@/lib/env');
  checkRequiredEnv();

  if (env.isProd) {
    const notes: string[] = [];
    if (!env.DATABASE_URL) {
      notes.push(
        'DATABASE_URL is not set, so the app is running on PGlite. That is a local file, not a shared database: it will not survive a redeploy and will not be shared between instances.',
      );
    }
    if (!env.stripe.enabled) notes.push('Billing is disabled (Stripe not configured).');
    if (!env.email.enabled) notes.push('Email is disabled; messages are recorded but not sent.');
    if (!env.anthropic.enabled) {
      notes.push('No Anthropic API key; remediation summaries use the built-in template.');
    }
    for (const note of notes) console.warn(`[startup] ${note}`);
  }
}
