import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOOTSTRAP_SPLASH_SUBTITLE,
  BOOTSTRAP_TENANT_SUBTITLE,
  buildBootDecision,
} from '../lib/appBootDecision.ts';

describe('buildBootDecision', () => {
  it('allows routes with no splash when ready', () => {
    const decision = buildBootDecision('ready');
    assert.equal(decision.allowRoutes, true);
    assert.equal(decision.showSplash, false);
  });

  it('uses branded splash for cold auth/app-data boot', () => {
    const auth = buildBootDecision('auth', { hasCachedSession: false });
    assert.equal(auth.showSplash, true);
    assert.equal(auth.splashVariant, 'branded');
    assert.equal(auth.subtitle, BOOTSTRAP_SPLASH_SUBTITLE);
    assert.equal(auth.allowRoutes, false);

    const appData = buildBootDecision('app-data');
    assert.equal(appData.splashVariant, 'branded');
    assert.equal(appData.subtitle, BOOTSTRAP_SPLASH_SUBTITLE);
  });

  it('skips all splash screens when a cached session exists', () => {
    const auth = buildBootDecision('auth', { hasCachedSession: true });
    assert.equal(auth.showSplash, false);
    assert.equal(auth.allowRoutes, true);
    assert.equal(auth.subtitle, '');

    const tenant = buildBootDecision('tenant', { hasCachedSession: true });
    assert.equal(tenant.showSplash, false);
    assert.equal(tenant.allowRoutes, true);

    const appData = buildBootDecision('app-data', { hasCachedSession: true });
    assert.equal(appData.showSplash, false);
    assert.equal(appData.allowRoutes, true);
  });

  it('keeps tenant copy for cold tenant resolve', () => {
    const tenant = buildBootDecision('tenant', { hasCachedSession: false });
    assert.equal(tenant.splashVariant, 'branded');
    assert.equal(tenant.subtitle, BOOTSTRAP_TENANT_SUBTITLE);
  });
});
