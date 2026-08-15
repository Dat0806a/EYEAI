export type AccountType = 'impaired' | 'patient';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  impaired: 'Người suy giảm',
  patient: 'Bệnh nhân',
};

export function getAccountTypeLabel(accountType: AccountType | string | null | undefined): string {
  if (!accountType) return 'Chưa thiết lập';
  if (accountType === 'impaired') return ACCOUNT_TYPE_LABELS.impaired;
  if (accountType === 'patient') return ACCOUNT_TYPE_LABELS.patient;
  return 'Chưa thiết lập';
}
