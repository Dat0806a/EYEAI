import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let currentApiKey: string | null = null;
let mapsPromise: Promise<google.maps.MapsLibrary> | null = null;

/**
 * Nap thu vien Google Maps bat dong bo qua `@googlemaps/js-api-loader`.
 * Nhan `apiKey` (tu `VITE_GOOGLE_MAPS_API_KEY` o `LocationPage`) va luu dem tac vu nap theo tung khoa.
 */
export async function loadGoogleMaps(apiKey: string): Promise<google.maps.MapsLibrary> {
  if (currentApiKey !== apiKey) {
    setOptions({
      key: apiKey,
      v: 'weekly',
    });
    currentApiKey = apiKey;
    mapsPromise = importLibrary('maps');
  }

  return mapsPromise!;
}

