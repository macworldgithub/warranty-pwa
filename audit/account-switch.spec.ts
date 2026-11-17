import { test, expect } from '@playwright/test';
test('regression: the next technician must not see the previous technician’s road history', async ({ page }) => {
  const makeUser = (id: string) => ({ id, name: id, email: `${id}@example.com`, role: 'TECHNICIAN', defaultSiteId: 'site_cranbourne_byd', authorizedSiteIds: ['site_cranbourne_byd'] });
  let activeUser = makeUser('audit-a');
  await page.addInitScript(({ user }) => { sessionStorage.setItem('booran-user', JSON.stringify(user)); sessionStorage.setItem('booran-token', 'audit-token'); }, { user: activeUser });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: any = [];
    if (path === '/auth/me') data = activeUser;
    else if (path === '/auth/login') { activeUser = makeUser('audit-b'); data = { token: 'audit-token-b', user: activeUser }; }
    else if (path === '/sites') data = [{ id: 'site_cranbourne_byd', name: 'Booran BYD Cranbourne', isActive: true }];
    else if (path === '/brands') data = [{ id: 'brand_byd', name: 'BYD' }];
    else if (path === '/test-drives' && activeUser.id === 'audit-a') data = [{ id: 'audit-private-trip-a', registration: 'AUDIT-A-123', repairOrder: 'RO-A-PRIVATE', vehicleLabel: 'A private test vehicle', siteId: 'site_cranbourne_byd', technicianName: 'audit-a', outcome: 'Passed', startTime: '2026-11-17T06:00:00Z' }];
    await route.fulfill({ json: data });
  });
  await page.goto('/'); await page.getByText('Internal Test Drive', { exact: true }).click();
  await expect(page.getByText('AUDIT-A-123', { exact: true })).toBeVisible();
  await page.getByText('Home', { exact: true }).last().click();
  await page.getByLabel('Log Out', { exact: true }).click(); await page.getByText('Log Out', { exact: true }).last().click();
  await expect(page.getByText('First Login Activation', { exact: true })).toBeVisible();
  await page.getByText('Sign In', { exact: true }).first().click();
  await page.getByPlaceholder('Username or email').fill('audit-b@example.com'); await page.getByPlaceholder('Enter your password').fill('audit-password');
  await page.getByText('Sign In', { exact: true }).last().click(); await page.getByText('Internal Test Drive', { exact: true }).click();
  await expect(page.getByText('Previous drives', { exact: true })).toBeVisible();
  await expect(page.getByText('AUDIT-A-123', { exact: true })).toHaveCount(0);
});
