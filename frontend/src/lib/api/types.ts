export type Listing = {
  id: string;
  title: string;
  description?: string;
  pricePerDay: number;
  address?: string;
  images?: string[];
  category?: { id: string; name: string; slug: string };
  location?: { type: 'Point'; coordinates: [number, number] };
  distance?: number; // metres, present when sorted by distance
};

export type Booking = {
  id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paid: boolean;
  totalPrice?: number;
  commission?: number;
  startDate: string;
  endDate: string;
  listing?: Listing;
};

export type User = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  isHost: boolean;
  roles?: string[];
  avatarUrl?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
  homeCityName?: string | null;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  allowed_for_private?: boolean;
};
