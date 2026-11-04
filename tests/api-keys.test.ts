import { beforeEach, describe, expect, it } from 'vitest';

import {
  authenticateApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '@/lib/api-keys';
import { clearAllTables } from './helpers/db';
import { createUser, setPlan } from './helpers/factories';

beforeEach(async () => {
  await clearAllTables();
});

describe('API keys', () => {
  it('issues a prefixed key and never stores it in the clear', async () => {
    const { user } = await createUser();
    const created = await createApiKey(user.id, 'Client dashboard');

    expect(created.key.startsWith('sp_')).toBe(true);
    expect(created.key.length).toBeGreaterThan(30);

    const [stored] = await listApiKeys(user.id);
    expect(stored.prefix).toBe(created.key.slice(0, 11));
    // The listing is what the UI renders; it must never carry the full key.
    expect(JSON.stringify(stored)).not.toContain(created.key);
  });

  it('authenticates a valid key on the Agency plan', async () => {
    const { user } = await createUser();
    await setPlan(user.id, 'agency');
    const created = await createApiKey(user.id, 'ci');

    const { caller } = await authenticateApiKey(`Bearer ${created.key}`);
    expect(caller?.userId).toBe(user.id);
    expect(caller?.plan).toBe('agency');
  });

  it('refuses a key whose plan no longer includes API access', async () => {
    const { user } = await createUser();
    await setPlan(user.id, 'agency');
    const created = await createApiKey(user.id, 'downgrade');

    // The customer downgrades but keeps the key. Entitlement is re-checked on
    // every call, so it has to stop working immediately.
    await setPlan(user.id, 'pro');

    const { caller, reason } = await authenticateApiKey(`Bearer ${created.key}`);
    expect(caller).toBeNull();
    expect(reason).toMatch(/Agency/);
  });

  it('refuses a key whose subscription lapsed', async () => {
    const { user } = await createUser();
    await setPlan(user.id, 'agency', { status: 'past_due' });
    const created = await createApiKey(user.id, 'unpaid');

    const { caller } = await authenticateApiKey(`Bearer ${created.key}`);
    expect(caller).toBeNull();
  });

  it('refuses malformed, missing and unknown keys', async () => {
    for (const header of [
      null,
      '',
      'Bearer ',
      'Bearer not-a-securepulse-key',
      'Bearer sp_completely_made_up_value',
      'sp_missing_the_bearer_prefix',
    ]) {
      const { caller } = await authenticateApiKey(header);
      expect(caller).toBeNull();
    }
  });

  it('stops working the moment it is revoked', async () => {
    const { user } = await createUser();
    await setPlan(user.id, 'agency');
    const created = await createApiKey(user.id, 'temporary');

    expect((await authenticateApiKey(`Bearer ${created.key}`)).caller).not.toBeNull();
    expect(await revokeApiKey(user.id, created.id)).toBe(true);
    expect((await authenticateApiKey(`Bearer ${created.key}`)).caller).toBeNull();
  });

  it('will not let one account revoke another account key', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    await setPlan(owner.user.id, 'agency');
    const created = await createApiKey(owner.user.id, 'owned');

    expect(await revokeApiKey(attacker.user.id, created.id)).toBe(false);
    // Still works for its actual owner.
    expect((await authenticateApiKey(`Bearer ${created.key}`)).caller).not.toBeNull();
  });
});
