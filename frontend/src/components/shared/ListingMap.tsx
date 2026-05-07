import dynamic from 'next/dynamic';
import type { ListingMapProps } from './ListingMapLeaflet';

export type { ListingMapProps, MapListing } from './ListingMapLeaflet';

const ListingMap = dynamic<ListingMapProps>(
  () => import('./ListingMapLeaflet'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-gray-100">
        <i className="fa-solid fa-spinner animate-spin text-2xl text-gray-400" />
      </div>
    ),
  },
);

export default ListingMap;
