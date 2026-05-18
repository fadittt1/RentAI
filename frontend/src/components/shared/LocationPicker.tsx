import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

export type { LocationPickerValue } from './LocationPickerLeaflet';

type LocationPickerProps = React.ComponentProps<typeof import('./LocationPickerLeaflet').default>;

const LocationPicker = dynamic<LocationPickerProps>(
  () => import('./LocationPickerLeaflet'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[340px] w-full items-center justify-center rounded-lg border border-gray-300 bg-gray-50">
        <i className="fa-solid fa-spinner animate-spin text-2xl text-gray-400" />
      </div>
    ),
  },
) as ComponentType<LocationPickerProps>;

export default LocationPicker;
