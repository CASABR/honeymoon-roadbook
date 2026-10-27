import assert from 'node:assert/strict';
import { buildTripDiscoveryPlan, resolveVerifiedTripRole } from './src/utils/tripDiscovery.ts';

assert.deepEqual(buildTripDiscoveryPlan([], null, []), {
  indexedTripIds: [], localCandidateIds: [], uniqueTripIds: []
});

assert.deepEqual(buildTripDiscoveryPlan(['trip-a'], 'trip-a', []), {
  indexedTripIds: ['trip-a'], localCandidateIds: [], uniqueTripIds: ['trip-a']
});

assert.deepEqual(buildTripDiscoveryPlan(['owner-trip', 'copilot-trip'], 'copilot-trip', ['owner-trip']), {
  indexedTripIds: ['owner-trip', 'copilot-trip'],
  localCandidateIds: ['owner-trip'],
  uniqueTripIds: ['owner-trip', 'copilot-trip']
});

assert.deepEqual(buildTripDiscoveryPlan(['new-account-trip'], 'new-account-trip', ['old-account-trip']), {
  indexedTripIds: ['new-account-trip'],
  localCandidateIds: ['old-account-trip'],
  uniqueTripIds: ['new-account-trip', 'old-account-trip']
});

assert.deepEqual(buildTripDiscoveryPlan([], null, ['pwa-local-trip', 'pwa-local-trip']), {
  indexedTripIds: [],
  localCandidateIds: ['pwa-local-trip'],
  uniqueTripIds: ['pwa-local-trip']
});

assert.equal(resolveVerifiedTripRole('owner', { ownerUid: 'owner' }), 'owner');
assert.equal(resolveVerifiedTripRole('copilot', { members: ['copilot'] }), 'copilota');
assert.equal(resolveVerifiedTripRole('owner-member', {}, true, 'owner'), 'owner');
assert.equal(resolveVerifiedTripRole('copilot-member', {}, true, 'copilota'), 'copilota');
assert.equal(resolveVerifiedTripRole('other', { ownerUid: 'owner', members: ['copilot'] }), null);

console.log('PASS: zero, uno, multipli, Owner/Copilota, cambio account e riapertura PWA');
