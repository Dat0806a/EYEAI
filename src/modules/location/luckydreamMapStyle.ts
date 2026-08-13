// Custom Google Maps Art Direction Style for LUCKY DREAM - EYEAI
// Aesthetic: Illustrated, Pastel, Soft, Healing, Premium Healthcare Map

export const luckydreamMapStyle: google.maps.MapTypeStyle[] = [
  // 1. Base Land & Geometry: Soft Warm Cream
  {
    elementType: 'geometry',
    stylers: [{ color: '#FDF8EC' }],
  },
  // 2. Text Labels: Deep Navy with Warm Cream Stroke Halo
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#14213D' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#FDF8EC' }, { weight: 4 }],
  },
  // 3. Administrative / Neighborhood Labels
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#14213D' }, { weight: 'bold' }],
  },
  {
    featureType: 'administrative.neighborhood',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3B4B68' }],
  },
  // 4. POIs: Hide commercial noise (restaurants, shops, business), keep medical & safety
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.attraction',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.sports_complex',
    stylers: [{ visibility: 'off' }],
  },
  {
    // Medical & Healthcare Facilities Priority
    featureType: 'poi.medical',
    elementType: 'geometry',
    stylers: [{ color: '#FFE0DC' }, { visibility: 'on' }],
  },
  {
    featureType: 'poi.medical',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#FF6F61' }, { visibility: 'on' }],
  },
  {
    featureType: 'poi.medical',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'on' }],
  },
  // 5. Parks & Nature: Soft Healing Pastel Green
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#D7F4E3' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#2C5E43' }, { visibility: 'simplified' }],
  },
  // 6. Roads: Soft, Clean & Illustrated Palette
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#FFFFFF' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#EAE0D0' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3B4B68' }],
  },
  // Major Arterials / Major Roads: Pale Blue-Gray
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#E2F3FC' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#CBE5F5' }],
  },
  // Highways: Soft Sky Blue Highlight
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#CDEFFC' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#ACDCF2' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#14213D' }],
  },
  // 7. Transit: Off
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  // 8. Water Bodies: Soft Sky Blue
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#BFEAF8' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#14213D' }],
  },
  // 9. Buildings / Landscape Structures
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#F7EFE2' }],
  },
];
