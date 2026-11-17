import { apiClient } from './client';
import { durableMutation, getLocalRecords, mergePendingRecords, resolveServerId, cacheRecords } from '../../web/outbox';
import type { LoanAgreement, LoanAgreementKpis } from '../types/loanAgreement.types';
async function stored(id: string): Promise<any> {
  const resolved = await resolveServerId(id);
  const local = (await getLocalRecords('loans')).find(item => item.id === id || item.id === resolved);
  if (local) return local;
  const item = await apiClient.get<LoanAgreement>('/loan-agreements/' + resolved);
  await cacheRecords('loans', [item]); return item;
}
async function change(id: string, action: string, method: string, dto: any, patch: any): Promise<LoanAgreement> {
  const base = await stored(id);
  const optimistic = { ...base, ...patch, customer: { ...base.customer, ...patch.customer }, vehicle: { ...base.vehicle, ...patch.vehicle }, outbound: { ...base.outbound, ...patch.outbound } };
  return durableMutation({ method, endpoint: '/loan-agreements/' + id + action, body: dto, collection: 'loans', optimistic });
}
export const loanAgreementsApi = {
  getKpis: async (siteId?: string): Promise<LoanAgreementKpis> => apiClient.get('/loan-agreements/kpis' + (siteId && siteId !== 'all' ? '?siteId=' + encodeURIComponent(siteId) : '')),
  findAll: async (siteId?: string, status?: string): Promise<LoanAgreement[]> => {
    const params = new URLSearchParams();
    if (siteId && siteId !== 'all') params.set('siteId', siteId);
    if (status && status !== 'all') params.set('status', status);
    let data: LoanAgreement[];
    try { data = await apiClient.get('/loan-agreements?' + params); }
    catch (error: any) { if (error.statusCode) throw error; data = await getLocalRecords('loans'); }
    return (await mergePendingRecords('loans', Array.isArray(data) ? data : [])).filter(item => (!siteId || siteId === 'all' || item.siteId === siteId) && (!status || status === 'all' || item.status === status));
  },
  findById: stored,
  issueAgreement: async (dto: any): Promise<LoanAgreement> => {
    const id = 'local_loan_' + crypto.randomUUID();
    const optimistic = { ...dto, id, agreementNumber: 'Pending sync', status: 'DRAFT', loanStartDateTime: new Date().toISOString(), templateVersion: 'v2026.1', createdAt: new Date().toISOString() };
    return durableMutation({ method: 'POST', endpoint: '/loan-agreements/issue', body: dto, localId: id, collection: 'loans', optimistic });
  },
  signAgreement: (id: string, dto: any): Promise<LoanAgreement> => change(id, '/sign', 'POST', dto, { status: 'ACTIVE', signatures: { ...dto, borrowerSignedAt: new Date().toISOString() } }),
  returnAgreement: (id: string, dto: any): Promise<LoanAgreement> => change(id, '/return', 'POST', dto, { status: 'RETURNED', inbound: { ...dto, returnedAt: new Date().toISOString() } }),
  updateAgreement: (id: string, dto: any): Promise<LoanAgreement> => change(id, '', 'PATCH', dto, dto),
  deleteAgreement: async (id: string): Promise<{ success: boolean; message: string; syncPending?: boolean }> => durableMutation({ method: 'DELETE', endpoint: '/loan-agreements/' + id, collection: 'loans', deletedId: id, optimistic: { success: true, message: 'Deletion saved for synchronization.' } }),
};
