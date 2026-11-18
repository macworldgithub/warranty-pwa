import { apiClient } from './client';
import { LoanReservation, ReserveLoanerInput } from '../types/loanReservation.types';
// Reservations require a server response so availability is confirmed across devices.
export const loanReservationsApi = {
  list: (siteId?: string): Promise<LoanReservation[]> => apiClient.get(
    '/loan-agreements/reservations' + (siteId && siteId !== 'all' ? '?siteId=' + encodeURIComponent(siteId) : ''),
  ),
  reserve: (dto: ReserveLoanerInput): Promise<LoanReservation> => apiClient.post('/loan-agreements/reservations', dto),
  cancel: (id: string): Promise<{ success: boolean }> => apiClient.post(`/loan-agreements/reservations/${id}/cancel`, {}),
};
