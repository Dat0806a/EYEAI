import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

let currentApiKey: string | null = null;
let mapsPromise: Promise<google.maps.MapsLibrary> | null = null;

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

