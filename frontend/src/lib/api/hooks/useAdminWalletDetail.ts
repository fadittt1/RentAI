import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminWalletDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'wallets', userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await api.get(`/admin/wallets/${userId}`);
      return res.data?.data ?? res.data;
    },
  });
}
