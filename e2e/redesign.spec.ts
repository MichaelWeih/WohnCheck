import { test, expect } from '@playwright/test';

const company = { id: 'ui-test-company', slug: 'ui-test-company', name: 'Test Wohnungsverwaltung mit einem sehr langen Unternehmensnamen GmbH & Co. KG', companyType: 'Hausverwaltung', city: 'Berlin', reviewCount: 0, ratingOverall: null, properties: [] };
const result = { landlords: [company], properties: [], neighborhoods: [] };

test('live directory: search, keyboard autocomplete, profile and login return path', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const input = page.getByRole('combobox');
  await input.fill('Vonovia');
  await expect(page.getByRole('option').first()).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page).toHaveURL(/vermieter\//);
  await expect(page.getByRole('heading', { name: /Vonovia/ })).toBeVisible();
  await page.getByRole('link', { name: 'Erfahrung teilen', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await expect(page.getByLabel('E-Mail', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('browser history keeps search text in sync and Escape dismisses suggestions', async ({ page }) => {
  await page.goto('/suche?q=Berlin');
  await expect(page.getByRole('combobox')).toHaveValue('Berlin');
  await page.getByRole('combobox').fill('Hamburg');
  await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(page).toHaveURL(/Hamburg/);
  await page.goBack();
  await expect(page.getByRole('combobox')).toHaveValue('Berlin');
  await page.getByRole('combobox').focus();
  await page.getByRole('combobox').press('Escape');
  await expect(page.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
});

test('empty search offers typo correction from the real directory', async ({ page }) => {
  await page.goto('/suche?q=Vonvia');
  await expect(page.getByRole('heading', { name: 'Meintest du …?' })).toBeVisible();
  await expect(page.locator('.directory-row', { hasText: 'Vonovia' })).toBeVisible();
});

test('loading, error recovery and empty results stay distinct', async ({ page }) => {
  let mode = 'loading';
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/search?*', async route => {
    if (mode === 'loading') await gate;
    await route.fulfill(mode === 'error' ? { status: 503, json: { message: 'Test failure' } } : { json: { landlords: [], properties: [], neighborhoods: [] } });
  });
  await page.goto('/suche?q=KeineTreffer');
  await expect(page.getByText('Verzeichnis wird durchsucht …')).toBeVisible();
  mode = 'error'; release();
  await expect(page.getByRole('heading', { name: 'Die Suche ist gerade nicht verfügbar.' })).toBeVisible();
  mode = 'empty';
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Keine Ergebnisse für „KeineTreffer“' })).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`responsive pages and long empty profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/landlords/ui-test-company', route => route.fulfill({ json: company }));
    await page.route('**/api/reviews?*', route => route.fulfill({ json: [] }));
    await page.route('**/api/reviews/aggregate/**', route => route.fulfill({ json: { reviewCount: 0, overallRating: null, categoryRatings: {} } }));
    for (const path of ['/', '/suche?q=Berlin', '/vermieter/ui-test-company', '/login', '/registrieren', '/impressum', '/datenschutz', '/not-a-page']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('/vermieter/ui-test-company');
    await expect(page.getByRole('heading', { name: 'Noch keine Erfahrungen geteilt.' })).toBeVisible();
    await expect(page.getByText('0.0')).toHaveCount(0);
    await page.screenshot({ path: `artifacts/redesign/empty-profile-${width}.png`, fullPage: true });
  });
}

test('review form uses live directory data and keyboard stars; submission is mocked', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => localStorage.setItem('wohncheck_auth', JSON.stringify({ accessToken: 'ui-test-only' })));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'ui-test', displayName: 'Testnutzer', role: 'USER', email: 'test@example.invalid' } } }));
  await page.route('**/api/search?*', route => route.fulfill({ json: result }));
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/reviews', async route => { submitted = route.request().postDataJSON(); await route.fulfill({ json: { id: 'ui-test-review' } }); });
  await page.goto('/bewertung/neu?targetType=landlord&targetId=ui-test-company');
  await expect(page.getByText(company.name, { exact: false }).first()).toBeVisible();
  await page.getByLabel('Titel deiner Bewertung *', { exact: true }).fill('Meine Erfahrung');
  await page.getByLabel('Dein Erfahrungsbericht *', { exact: true }).fill('Dies ist eine lokale Testbewertung.');
  const star = page.getByRole('button', { name: 'Bewertung: 4 von 5 Sternen', exact: true });
  await star.focus(); await star.press('Space');
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/redesign/review-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Bewertung absenden' }).click();
  await expect(page.getByRole('heading', { name: 'Vielen Dank!' })).toBeVisible();
  expect(submitted).toMatchObject({ targetId: company.id, targetType: 'LANDLORD', overallRating: 4 });
});

test('map stays consent gated, property and neighborhood links work', async ({ page }) => {
  await page.goto('/suche?q=Berlin');
  await page.getByText('Karte der Wohnorte anzeigen', { exact: true }).click();
  await expect(page.getByRole('button', { name: /erlauben|aktivieren/i }).first()).toBeVisible();
  const property = page.locator('a.directory-row[href^="/gebaeude/"]').first();
  await property.click();
  await expect(page.getByRole('heading', { name: 'Erfahrungen auf WohnCheck' })).toBeVisible();
  const neighborhood = page.locator('.profile-aside a[href^="/nachbarschaft/"]').first();
  await neighborhood.click();
  await expect(page.getByRole('heading', { name: 'Die Nachbarschaft' })).toBeVisible();
});

test('authentication errors remain visible beside the form', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { message: 'E-Mail oder Passwort stimmt nicht.' } }));
  await page.goto('/login');
  await page.getByLabel('E-Mail', { exact: true }).fill('test@example.invalid');
  await page.getByLabel('Passwort', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('E-Mail oder Passwort stimmt nicht.');
});

test('enlarged text and missing profile remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route('**/api/landlords/missing', route => route.fulfill({ status: 404, json: { message: 'Nicht gefunden' } }));
  await page.goto('/vermieter/missing');
  await expect(page.getByRole('heading', { name: 'Vermieter nicht gefunden.' })).toBeVisible();
  await page.getByRole('link', { name: 'Zur Suche', exact: true }).click();
  await expect(page).toHaveURL('/suche');
});

test('all three portal categories lead to matching results and preserve search scope', async ({ page }) => {
  await page.goto('/');
  const categories = page.getByRole('navigation', { name: 'Bewertungsbereiche' });
  await categories.getByRole('link', { name: /Wohngegenden/ }).click();
  await expect(page).toHaveURL(/type=neighborhood/);
  await expect(page.getByRole('heading', { name: 'Wohngegenden entdecken' })).toBeVisible();
  await expect(page.locator('a.directory-row[href^="/gebaeude/"]')).toHaveCount(0);
  await page.getByRole('combobox').fill('Berlin');
  await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  await expect(page).toHaveURL(/type=neighborhood/);
  await expect(page.locator('a.directory-row[href^="/nachbarschaft/"]').first()).toBeVisible();
  await page.getByRole('button', { name: /^Vermieter/ }).click();
  await expect(page.locator('a.directory-row[href^="/vermieter/"]').first()).toBeVisible();
  await expect(page.locator('a.directory-row[href^="/nachbarschaft/"]')).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('button', { name: 'Vermieter', exact: true }).click();
  await expect(page.locator('.portal-entry-grid a[href^="/vermieter/"]').first()).toBeVisible();
});
