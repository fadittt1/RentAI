import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WalletService } from '../generated';
import { ApiError } from '../generated';
import { api } from '../http';

export interface TopUpDto {
  amount: number;
}

export const walletKeys = {
  all: ['wallet'] as const,
  me: () => [...walletKeys.all, 'me'] as const,
};

export function useWallet() {
  return useQuery({
    queryKey: walletKeys.me(),
    queryFn: () => WalletService.walletControllerGetWallet(),
    retry: false,
  });
}

export function useTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation<any, ApiError, TopUpDto>({
    mutationFn: async (data: TopUpDto) => {
      // Direct API call since swagger didn't pick up the DTO without restart
      const res = await api.post('/wallet/topup', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: walletKeys.me() });
    },
  });
}
