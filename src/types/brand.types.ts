export interface Brand {
  _id?: string;
  id: string;
  name: string;
  code?: string;
  isActive?: boolean;
  activeBrandPackId?: string;
  logoUrl?: string;
  supportEmail?: string;
}
