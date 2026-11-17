import { test, expect, type Page } from '@playwright/test';
const site = { id: 'site_cranbourne_byd', name: 'Booran BYD Cranbourne', code: 'CR', isActive: true, authorizedBrandIds: ['brand_byd'] };
async function setup(page: Page, role = 'TECHNICIAN') {
  const user = { id: 'workflow-user', name: 'Workflow Tester', email: 'workflow@example.test', role, defaultSiteId: site.id, authorizedSiteIds: [site.id] };
  const state: any = { users: [user], cases: [{ id: 'review-case', roNumber: 'RO-REVIEW', status: 'Awaiting Review', vin: 'LGXCE4C86P0019283', siteId: site.id, brandId: 'brand_byd', brandName: 'BYD', make: 'BYD', model: 'ATTO 3', concernTitle: 'Inspection concern', evidenceItems: [], voiceNotes: [], flagHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], loans: [], inspections: [], calls: [] };
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), method = request.method(), endpoint = new URL(request.url()).pathname.replace('/api/v1', '');
    const body = method !== 'GET' && method !== 'DELETE' ? request.postDataJSON() : undefined;
    state.calls.push({ endpoint, method, body }); let result: any = [];
    if (endpoint.endsWith('/pdf')) { state.pdfAuthorized = request.headers().authorization === 'Bearer workflow-token'; await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); return; }
    if (endpoint === '/auth/me') result = user;
    else if (endpoint === '/sites') result = [site];
    else if (endpoint === `/sites/${site.id}`) result = site;
    else if (endpoint === '/brands') result = [{ id: 'brand_byd', name: 'BYD' }];
    else if (endpoint === '/auth/users') {
      if (method === 'POST') { result = { ...body, id: 'created-user', defaultSiteId: body.siteId }; state.users.push(result); } else result = state.users;
    } else if (endpoint.startsWith('/auth/users/')) {
      if (method === 'PATCH') { state.users = state.users.map((item: any) => item.id === 'created-user' ? { ...item, ...body } : item); result = state.users.find((item: any) => item.id === 'created-user'); }
      else { state.users = state.users.filter((item: any) => item.id !== 'created-user'); result = { success: true }; }
    } else if (endpoint === '/warranty-cases') result = state.cases;
    else if (endpoint.endsWith('/mark-submitted')) { Object.assign(state.cases[0], body, { status: 'Submitted' }); result = state.cases[0]; }
    else if (endpoint.endsWith('/flag')) { Object.assign(state.cases[0], { status: 'Flagged', flagHistory: [{ ...body, flaggedAt: new Date().toISOString() }] }); result = state.cases[0]; }
    else if (endpoint === '/warranty-cases/review-case') result = state.cases[0];
    else if (endpoint === '/loan-agreements/kpis') result = { available: 1, outNow: state.loans.length, overdue: 0, dueSoon: 0 };
    else if (endpoint === '/loan-agreements') result = state.loans;
    else if (endpoint === '/loan-agreements/issue') { result = { ...body, id: 'loan-workflow', status: 'DRAFT', agreementNumber: 'LA-WORKFLOW', loanStartDateTime: new Date().toISOString(), templateVersion: 'v2026.1' }; state.loans.push(result); }
    else if (endpoint.endsWith('/sign')) { Object.assign(state.loans[0], { status: 'ACTIVE', signatures: { ...body, borrowerSignedAt: new Date().toISOString() } }); result = state.loans[0]; }
    else if (endpoint.endsWith('/return')) { Object.assign(state.loans[0], { status: 'RETURNED', inbound: { ...body, returnedAt: new Date().toISOString() } }); result = state.loans[0]; }
    else if (endpoint === '/loan-agreements/loan-workflow') { Object.assign(state.loans[0], body); result = state.loans[0]; }
    else if (endpoint === '/hoists') result = [{ id: 'hoist-workflow', name: 'Workflow Bay', hoistNumber: 1, facility: 'hyundai_chery', siteId: site.id, status: 'OPERATIONAL', type: 'TWO_POST', lockoutTagoutActive: false }];
    else if (endpoint === '/hoists/summary') result = { totalHoists: 1, inspectedToday: 0, notInspectedToday: 1, passed: 0, faultIdentified: 0, outOfService: 0 };
    else if (endpoint === '/hoists/inspections') result = state.inspections;
    else if (endpoint === '/hoists/inspect') { result = { ...body, id: 'inspection-workflow', signedAt: new Date().toISOString() }; state.inspections.push(result); }
    else if (endpoint.includes('geofence')) result = { status: 'OFF_SITE', insideGeofence: false, distanceMeters: 0, radiusMeters: 180, siteName: site.name };
    await route.fulfill({ json: result });
  });
  await page.addInitScript(user => { sessionStorage.setItem('booran-user', JSON.stringify(user)); sessionStorage.setItem('booran-token', 'workflow-token'); }, user);
  await page.goto('/'); await expect(page.getByText('APP MENU', { exact: true })).toBeVisible();
  return state;
}
test('administrator creates, edits and deletes a user through the UI', async ({ page }) => {
  const state = await setup(page, 'ADMIN'); await page.getByText('Profile & settings', { exact: true }).click();
  await page.getByText('+ Add User', { exact: true }).click(); await page.getByPlaceholder('E.g., John Smith').fill('Created Workflow User');
  await page.getByPlaceholder('E.g., jsmith@booran.com.au').fill('new-user@example.test'); await page.getByText('Create Account', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'User Created', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByLabel('Edit user Created Workflow User', { exact: true }).click(); await expect(page.getByPlaceholder('User name')).toHaveValue('Created Workflow User'); await page.getByPlaceholder('User name').fill('Updated Workflow User'); await expect(page.getByPlaceholder('User name')).toHaveValue('Updated Workflow User'); await page.getByText('Save Changes', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rooftop & User Updated' })).toBeVisible(); await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect.poll(() => state.users.find((item: any) => item.id === 'created-user')?.name).toBe('Updated Workflow User');
  await page.getByLabel('Delete user Updated Workflow User', { exact: true }).click(); await page.getByRole('button', { name: 'Delete Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'User Deleted', exact: true })).toBeVisible(); expect(state.users).toHaveLength(1);
});
for (const action of ['approve', 'flag']) test('reviewer can ' + action + ' a warranty case', async ({ page }) => {
  const state = await setup(page, 'CLERK'); await page.getByText('Warranty Capture', { exact: true }).click(); await page.getByText('RO-REVIEW', { exact: true }).first().click();
  if (action === 'approve') {
    await page.getByText('Accept Case', { exact: true }).click(); await page.getByPlaceholder('E.g., BYD-CLM-2026-9841').fill('CLM-WORKFLOW');
    await page.getByText('Accept & Approve', { exact: true }).last().click(); await expect(page.getByRole('heading', { name: 'Case Accepted & Approved', exact: true })).toBeVisible(); expect(state.cases[0].status).toBe('Submitted');
  } else {
    await page.getByText('Reject with Comments', { exact: true }).click(); await page.getByPlaceholder('E.g., The VIN compliance plate photo is blurry. Please wipe the lens, use a torch, and retake.').fill('Please retake the VIN photo.');
    await page.getByText('Confirm Rejection', { exact: true }).click(); await expect(page.getByRole('heading', { name: 'Case Rejected & Flagged', exact: true })).toBeVisible(); expect(state.cases[0].status).toBe('Flagged');
  }
});
test('technician case details resolve the saved rooftop ID to its dealership name', async ({ page }) => {
  const state = await setup(page);
  Object.assign(state.cases[0], { technicianId: 'workflow-user', siteName: 'Booran Dealership' });
  await page.getByText('Warranty Capture', { exact: true }).click();
  await page.getByText('RO-REVIEW', { exact: true }).first().click();
  await expect(page.getByText('DEALERSHIP ROOFTOP', { exact: true })).toBeVisible();
  await expect(page.getByText(site.name, { exact: true })).toBeVisible();
});
test('technician completes a hoist checklist and server-confirmed sign-off', async ({ page }) => {
  const state = await setup(page); await page.getByText('Hoist Inspections', { exact: true }).click(); await page.getByText('Start Pre-Shift Check', { exact: true }).first().click();
  await page.getByText('All Pass', { exact: true }).click(); await page.getByText('Sign & Complete Inspection', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspection Submitted', exact: true })).toBeVisible(); expect(state.inspections).toHaveLength(1); expect(state.inspections[0].status).toBe('PASS');
});

test('technician issues, signs and returns a courtesy vehicle agreement', async ({ page }) => {
  const state = await setup(page); await page.getByText('Loaners', { exact: true }).click(); await page.getByText('New Agreement', { exact: true }).click();
  await page.getByRole('button', { name: 'Service Loan Vehicle', exact: true }).click();
  await page.getByPlaceholder('e.g. Priya Nair').fill('Loan Workflow Customer'); await page.getByPlaceholder('0412 345 678').fill('0412345678');
  await page.getByPlaceholder('e.g. 98765432').fill('98765432'); await page.getByText('Physical Licence Sighted by Staff *', { exact: true }).click();
  await page.getByPlaceholder('CRN-882', { exact: true }).fill('E2E-123'); await page.getByPlaceholder('BYD', { exact: true }).fill('BYD'); await page.getByPlaceholder('DOLPHIN Premium', { exact: true }).fill('DOLPHIN');
  await page.getByText('Select date', { exact: true }).click(); await page.getByRole('dialog').getByText('Done', { exact: true }).click();
  await page.getByText('Select time', { exact: true }).click(); await page.getByRole('dialog').getByText('Done', { exact: true }).click();
  await page.getByText('Condition & 5-Point Photos', { exact: true }).click(); await page.getByPlaceholder('e.g. 4820').fill('10000');
  await page.getByText('Terms & Conditions', { exact: true }).click();
  await page.getByText(/I have read, understood, and accept all operative clauses/).click(); await page.getByText(/I consent to digital execution and receiving SMS/).click(); await page.getByText(/I acknowledge the Privacy Act Collection Notice/).click();
  await page.getByText('Customer Signature & Staff', { exact: true }).click(); await page.getByText(/Tap to Auto-Certify Signature/).click(); await page.getByPlaceholder('e.g. Shaun Davies').fill('Workflow Staff');
  await page.getByText('Save & Activate Agreement', { exact: true }).click(); await expect(page.getByRole('heading', { name: 'Agreement #LA-WORKFLOW Activated!', exact: true })).toBeVisible();
  expect(state.loans[0].signatures.borrowerSignatureDataUrl).toMatch(/^data:image\/svg\+xml;base64,/); await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByText('View agreement', { exact: false }).first().click(); await page.getByText('Edit Details', { exact: true }).click();
  await page.getByPlaceholder('Full Name', { exact: true }).fill('Updated Loan Customer'); await page.getByText('Save Changes', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updated', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByText('View agreement', { exact: false }).first().click(); await page.getByText('View PDF', { exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByText('Download PDF', { exact: true }).click(); await download; expect(state.pdfAuthorized).toBe(true);
  await page.getByLabel('Close loan agreement', { exact: true }).click();
  await page.getByText('Mark returned', { exact: true }).click(); await page.getByPlaceholder('e.g. 12549').fill('10010');
  await page.getByText(/^Confirm \(/).click(); await expect.poll(() => state.loans[0].status).toBe('RETURNED');
});
