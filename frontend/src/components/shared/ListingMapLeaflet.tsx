import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { formatTnd } from '@/lib/utils/format';

export interface MapListing {
  id: string;
  title: string;
  pricePerDay: number;
  location?: { type: string; coordinates: [number, number] } | null;
  images?: string[];
  category?: { name: string; slug: string } | null;
}

export interface ListingMapProps {
  listings: MapListing[];
  center: [number, number];
  zoom?: number;
  height?: string;
}

function makePriceIcon(price: number) {
  return L.divIcon({
    className: '',
    html: `<span style="display:inline-block;background:#3b82f6;color:#fff;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3);white-space:nowrap;cursor:pointer">${formatTnd(price)}</span>`,
    iconAnchor: [0, 12],
    popupAnchor: [40, -14],
  });
}

export default function ListingMapLeaflet({
  listings,
  center,
  zoom = 12,
  height = '400px',
}: ListingMapProps) {
  const valid = listings.filter(
    (l) =>
      Array.isArray(l.location?.coordinates) &&
      l.location!.coordinates.length === 2,
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      style={{ height, width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {valid.map((l) => {
        const [lng, lat] = l.location!.coordinates;
        return (
          <Marker key={l.id} position={[lat, lng]} icon={makePriceIcon(l.pricePerDay)}>
            <Popup>
              <div style={{ minWidth: 160 }}>
                {l.images?.[0] && (
                  <img
                    src={l.images[0]}
                    alt={l.title}
                    style={{
                      width: '100%',
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 6,
                      marginBottom: 6,
                    }}
                  />
                )}
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  {l.title}
                </p>
                <p style={{ color: '#3b82f6', fontSize: 12, marginBottom: 6 }}>
                  {formatTnd(l.pricePerDay)}/day
                </p>
                <a
                  href={`/listings/${l.id}`}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  View listing
                </a>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
