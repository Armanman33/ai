import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import { TehranPlace } from '../types';
import { formatDistance, toPersianDigits } from '../lib/persian';

interface TehranMapProps {
  lat: number;
  lng: number;
  areaName: string;
  radiusMeters?: number;
  places: TehranPlace[];
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    centerLat: number;
    centerLng: number;
  };
  onChange: (next: { lat: number; lng: number; areaName: string }) => void;
  heightClass?: string;
  autoLocateOnMount?: boolean;
}

const PIN_ICON = L.divIcon({
  className: 'peydash-pin',
  html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-100%);">
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 2C10.82 2 5 7.82 5 15C5 24.75 18 34 18 34C18 34 31 24.75 31 15C31 7.82 25.18 2 18 2Z" fill="#0A0A0A" stroke="#FACC15" stroke-width="2.5"/>
      <circle cx="18" cy="14.5" r="5.5" fill="#FACC15"/>
    </svg>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

function nearestPlaceName(lat: number, lng: number, places: TehranPlace[]): string {
  if (!places.length) return 'تهران';
  let best = places[0];
  let bestD = Infinity;
  for (const p of places) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best.name;
}

export const TehranMap: React.FC<TehranMapProps> = ({
  lat,
  lng,
  areaName,
  radiusMeters,
  places,
  bounds,
  onChange,
  heightClass = 'h-64 sm:h-72',
  autoLocateOnMount = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const isInsideTehran = (la: number, ln: number) =>
    la >= bounds.minLat && la <= bounds.maxLat && ln >= bounds.minLng && ln <= bounds.maxLng;

  const filteredPlaces = useMemo(() => {
    const q = query.trim();
    if (!q) return places.slice(0, 8);
    return places
      .filter((p) => p.name.includes(q) || p.district.includes(q))
      .slice(0, 8);
  }, [places, query]);

  const quickPlaces = useMemo(() => places.slice(0, 6), [places]);

  // Initialize Leaflet map centered on Tehran
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const tehranBounds = L.latLngBounds(
      [bounds.minLat - 0.02, bounds.minLng - 0.02],
      [bounds.maxLat + 0.02, bounds.maxLng + 0.02]
    );

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 13,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: tehranBounds,
      maxBoundsViscosity: 0.9,
      zoomControl: true,
    });

    // Supports Iran tile providers via VITE_MAP_TILE_URL (e.g. Neshan / Map.ir) or OpenStreetMap default
    const tileUrl =
      import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    L.tileLayer(tileUrl, {
      attribution: '&copy; OpenStreetMap | پیداش تهران',
      maxZoom: 18,
    }).addTo(map);

    const marker = L.marker([lat, lng], {
      icon: PIN_ICON,
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      if (!isInsideTehran(pos.lat, pos.lng)) {
        setGeoMsg('موقعیت انتخاب‌شده خارج از محدوده شهر تهران است.');
        marker.setLatLng([lat, lng]);
        return;
      }
      setGeoMsg(null);
      onChangeRef.current({
        lat: Number(pos.lat.toFixed(5)),
        lng: Number(pos.lng.toFixed(5)),
        areaName: nearestPlaceName(pos.lat, pos.lng, places),
      });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: cLat, lng: cLng } = e.latlng;
      if (!isInsideTehran(cLat, cLng)) {
        setGeoMsg('پیداش فقط در محدوده شهر تهران فعال است. لطفاً نقطه‌ای داخل تهران انتخاب کنید.');
        return;
      }
      setGeoMsg(null);
      onChangeRef.current({
        lat: Number(cLat.toFixed(5)),
        lng: Number(cLng.toFixed(5)),
        areaName: nearestPlaceName(cLat, cLng, places),
      });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync pin & radius circle on prop updates
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLatLng([lat, lng]);
    map.panTo([lat, lng], { animate: true, duration: 0.4 });

    if (radiusMeters && radiusMeters > 0) {
      if (!circleRef.current) {
        circleRef.current = L.circle([lat, lng], {
          radius: radiusMeters,
          color: '#0A0A0A',
          weight: 2,
          fillColor: '#FACC15',
          fillOpacity: 0.22,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng([lat, lng]);
        circleRef.current.setRadius(radiusMeters);
      }
    } else if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
  }, [lat, lng, radiusMeters]);

  const handleUseCurrentLocation = (silent = false) => {
    if (!('geolocation' in navigator)) {
      if (!silent) setGeoMsg('مرورگر شما از موقعیت‌یابی خودکار پشتیبانی نمی‌کند. موقعیت را روی نقشه انتخاب کنید.');
      return;
    }
    setLocating(true);
    if (!silent) setGeoMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (!isInsideTehran(latitude, longitude)) {
          if (!silent) {
            setGeoMsg('موقعیت فعلی شما خارج از محدوده شهر تهران است. لطفاً محله موردنظر را از نقشه یا جست‌وجو انتخاب کنید.');
          }
          return;
        }
        onChangeRef.current({
          lat: Number(latitude.toFixed(5)),
          lng: Number(longitude.toFixed(5)),
          areaName: nearestPlaceName(latitude, longitude, places),
        });
      },
      () => {
        setLocating(false);
        if (!silent) {
          setGeoMsg('دسترسی به موقعیت مکانی داده نشد. می‌توانید نام محله را جست‌وجو کرده یا روی نقشه ضربه بزنید.');
        }
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  useEffect(() => {
    if (autoLocateOnMount) {
      handleUseCurrentLocation(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectPlace = (place: TehranPlace) => {
    setGeoMsg(null);
    setQuery('');
    setDropdownOpen(false);
    onChange({ lat: place.lat, lng: place.lng, areaName: place.name });
  };

  return (
    <div className="space-y-3">
      {/* Search Tehran neighborhood + Current Location */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 180)}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
            }}
            placeholder="جست‌وجوی محله، میدان یا ایستگاه مترو در تهران..."
            className="w-full bg-white border border-neutral-300 focus:border-[#0A0A0A] rounded-xl pr-10 pl-9 py-2.5 text-sm outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              aria-label="پاک کردن جست‌وجو"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {dropdownOpen && filteredPlaces.length > 0 && (
            <div className="absolute right-0 left-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-neutral-200 z-[500] max-h-60 overflow-y-auto divide-y divide-neutral-100">
              {filteredPlaces.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectPlace(p)}
                  className="w-full px-4 py-2.5 text-right hover:bg-[#FEFCE8] flex items-center justify-between gap-2 text-sm transition-colors"
                >
                  <span className="font-semibold text-[#0A0A0A] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#CA8A04] shrink-0" />
                    {p.name}
                  </span>
                  <span className="text-xs text-neutral-500">{p.district}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => handleUseCurrentLocation(false)}
          disabled={locating}
          className="inline-flex items-center justify-center gap-2 bg-[#0A0A0A] hover:bg-neutral-800 text-[#FACC15] font-bold text-sm px-4 py-2.5 rounded-xl shrink-0 transition-colors disabled:opacity-60"
        >
          <LocateFixed className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
          <span>{locating ? 'در حال مکان‌یابی...' : 'موقعیت فعلی من'}</span>
        </button>
      </div>

      {/* Quick Tehran neighborhood chips */}
      <div className="flex flex-wrap gap-1.5">
        {quickPlaces.map((p) => {
          const active = areaName === p.name;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPlace(p)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                active
                  ? 'bg-[#FACC15] border-[#0A0A0A] text-[#0A0A0A] font-bold'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {geoMsg && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-3.5 py-2.5 text-xs leading-5">
          {geoMsg}
        </div>
      )}

      {/* Map Canvas */}
      <div className="relative rounded-2xl overflow-hidden border-2 border-[#0A0A0A]/15 shadow-inner">
        <div ref={containerRef} className={`w-full ${heightClass} z-0`} />
        <div className="absolute bottom-2.5 right-2.5 z-[400] bg-[#0A0A0A]/90 text-white text-xs px-3 py-1.5 rounded-xl flex items-center gap-2 backdrop-blur-sm">
          <MapPin className="w-3.5 h-3.5 text-[#FACC15] shrink-0" />
          <span className="font-semibold">{areaName}</span>
          {radiusMeters ? (
            <span className="text-[#FACC15] border-r border-white/20 pr-2">
              شعاع {formatDistance(radiusMeters)}
            </span>
          ) : (
            <span className="text-neutral-400 text-[11px] hidden sm:inline">
              ({toPersianDigits(lat.toFixed(3))}, {toPersianDigits(lng.toFixed(3))})
            </span>
          )}
        </div>
      </div>
      <p className="text-[11px] text-neutral-500">
        برای تغییر موقعیت، روی نقطه موردنظر در نقشه تهران ضربه بزنید یا پین را جابه‌جا کنید.
      </p>
    </div>
  );
};
