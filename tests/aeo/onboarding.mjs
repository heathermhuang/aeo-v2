// Isolated operator UI test: API fixtures do not send mail or create customer data.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const origin = process.env.AEO_BROWSER_ORIGIN || 'http://127.0.0.1:3102';
assert.equal(new URL(origin).hostname, '127.0.0.1', 'Fixture journey runs only on loopback');
await mkdir('.local/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
    });
    let authenticated = false,
      submitted;
    await context.route('**/api/aeo/**', async route => {
      const path = new URL(route.request().url()).pathname.slice('/api/aeo/'.length);
      let status = 200,
        data = {};
      if (path === 'session') {
        status = authenticated ? 200 : 401;
        data = authenticated
          ? {
              user: { id: 'fixture-user', email: 'operator@example.test' },
              workspaces: [{ id: 'fixture-team', name: 'My team', role: 'team-owner' }],
              limits: { sites: 3 },
            }
          : { error: 'Sign in' };
      } else if (path === 'public-check') {
        assert.equal(
          JSON.parse(route.request().postData()).url,
          'https://aeo.io/about?private=value',
        );
        data = {
          hostname: 'aeo.io',
          url: 'https://aeo.io/about',
          findings: [
            {
              label: 'Page title',
              state: 'action',
              detail: 'No non-empty page title was found in the HTML response.',
              action: 'Give the page a clear, descriptive title.',
            },
          ],
        };
      } else if (path === 'signup') {
        submitted = JSON.parse(route.request().postData());
        status = 202;
      } else if (path === 'identity/complete') authenticated = true;
      else if (path === 'workspaces/fixture-team/sites') data = { sites: [] };
      else throw new Error('Unexpected fixture API: ' + path);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await page
      .getByLabel('Website URL', { exact: true })
      .fill('https://aeo.io/about?private=value');
    assert.equal(await page.getByLabel('Email', { exact: true }).count(), 0);
    await page.screenshot({
      path: `.local/screenshots/url-first-home-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Check website', exact: true }).click();
    await page.getByRole('heading', { name: 'Page title', exact: true }).waitFor();
    await expect(page.getByRole('region', { name: 'Website check result' })).not.toContainText(
      'private=value',
    );
    await page.screenshot({
      path: `.local/screenshots/url-first-result-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Continue with this website' }).click();
    await page.getByLabel('Email', { exact: true }).fill('operator@example.test');
    assert.equal(await page.getByLabel('Workspace name', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Send email link', exact: true }).click();
    await page.getByRole('status').waitFor();
    assert.deepEqual(submitted, { email: 'operator@example.test' });
    await page.goto(origin + '/?qualification=proof#account=' + 'A'.repeat(43) + '&purpose=verify');
    await page.getByLabel(/^New password/).fill('local-fixture-password-only');
    await page.getByRole('button', { name: 'Confirm and continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Add a website', exact: true }).waitFor();
    await expect(page.getByLabel('Website domain', { exact: true })).toHaveValue('aeo.io');
    assert.equal(await page.getByRole('combobox', { name: 'Team', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'V1 reports', exact: true }).count(), 0);
    assert.equal(await page.getByText(/workspace|candidate release|billing is off/i).count(), 0);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(dimensions.scroll <= dimensions.viewport + 1);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        width,
        urlBeforeAccount: true,
        observedFinding: true,
        emailOnlySignup: true,
        domainCarriedThroughProof: true,
        singleTeamSelectorHidden: true,
        legacyNavigationRemoved: true,
        overflow: false,
        pageErrors: 0,
        fixtureApi: true,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
