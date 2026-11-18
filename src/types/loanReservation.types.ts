export interface LoanReservation {
  id: string;
  siteId: string;
  loanerNumber: number;
  loanerName: string;
  customerName: string;
  customerMobile: string;
  startAt: string;
  endAt: string;
  status: 'RESERVED' | 'ISSUED' | 'CANCELLED' | 'RETURNED';
  agreementId?: string;
  rego?: string;
}
export type ReserveLoanerInput = Pick<LoanReservation,
  'siteId' | 'loanerNumber' | 'customerName' | 'customerMobile' | 'startAt' | 'endAt'>;
