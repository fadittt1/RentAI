import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/http';

export function useAdminWallets() {
  return useQuery({
    queryKey: ['admin', 'wallets'],
    queryFn: async () => {
      const res = await api.get('/admin/wallets');
      return res.data?.data ?? res.data;
    },
  });
}
