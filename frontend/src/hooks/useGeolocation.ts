import { useEffect, useState } from "react";

type GeolocationCoords = {
  lat: number;
  lng: number;
};

/**
 * Requests the browser's geolocation once on mount and returns the user's
 * latitude/longitude. Returns `null` while the position is being acquired
 * or if the user denies permission / the API is unavailable.
 */
export function useGeolocation(): GeolocationCoords | null {
  const [coords, setCoords] = useState<GeolocationCoords | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        // Permission denied or unavailable — leave coords null.
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  return coords;
}
