import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export interface WalletAdjustDto {
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  reason: string;
}

export function useAdminWalletAdjust(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: WalletAdjustDto) => {
      const res = await api.post(`/admin/wallets/${userId}/adjust`, data);
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallets', userId] });
    },
  });
}
