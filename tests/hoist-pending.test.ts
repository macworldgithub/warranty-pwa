import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../src/api/client',()=>({apiClient:api}));
beforeEach(()=>{vi.resetModules();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('window',{dispatchEvent:vi.fn()});vi.stubGlobal('navigator',{});vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));});
it('keeps an offline hoist fault visible when a stale cached server list is loaded',async()=>{
  const box=await import('../web/outbox');await box.setSyncSession({userId:'hoist-tech',token:'test-token',apiUrl:'https://backend.test/api/v1'});
  const hoist={id:'hoist-a',hoistNumber:1,name:'Test bay',facility:'hyundai_chery',siteId:'site-a',status:'OPERATIONAL'};
  api.get.mockResolvedValue([hoist]);const {hoistApi}=await import('../src/api/hoist.api');await hoistApi.getHoists();
  const result=await hoistApi.submitInspection({hoistId:'hoist-a',inspectorId:'hoist-tech',inspectorName:'Technician',status:'FAULT_IDENTIFIED',checklistItems:[],faultNotes:'Hydraulic leak',faultSeverity:'MAJOR'} as any);
  expect((result as any).syncPending).toBe(true);
  expect((await hoistApi.getHoists())[0]).toMatchObject({status:'FAULT_IDENTIFIED',activeFaultNotes:'Hydraulic leak',syncPending:true});
  expect((await box.getOutboxJobs()).length).toBe(1);
});
