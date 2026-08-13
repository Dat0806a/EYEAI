import React, { useEffect, useRef, useState, useCallback } from 'react';
import { loadGoogleMaps } from './mapLoader';
import { luckydreamMapStyle } from './luckydreamMapStyle';
import { createCustomOverlayMarker, ICustomOverlayMarker } from './CustomOverlayMarker';
import { EyeFocusable } from '../eye-control/EyeFocusable';
import { Locate, Plus, Minus } from 'lucide-react';

interface GoogleMapViewProps {
  apiKey?: string;
  center: { lat: number; lng: number };
  zoom?: number;
  accuracy?: number | null;
  isEyeMode?: boolean;
  onMapLoaded?: () => void;
  onRecenter?: () => void;
}

export function GoogleMapView({
  apiKey = '',
  center,
  zoom = 16,
  accuracy,
  isEyeMode = false,
  onMapLoaded,
  onRecenter,
}: GoogleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<ICustomOverlayMarker | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);

  const [useIframeFallback, setUseIframeFallback] = useState<boolean>(false);
  const [currentZoom, setCurrentZoom] = useState<number>(zoom);

  // Monitor auth failure for Google Maps JS API key restriction
  useEffect(() => {
    window.gm_authFailure = () => {
      console.warn('Google Maps JS API key restricted or not enabled. Falling back to Google Maps Embed renderer.');
      setUseIframeFallback(true);
    };
    return () => {
      delete window.gm_authFailure;
    };
  }, []);

  // Initialize Maps JS API Instance
  const initMap = useCallback(async () => {
    if (!containerRef.current || useIframeFallback) return;

    if (!apiKey) {
      setUseIframeFallback(true);
      return;
    }

    try {
      await loadGoogleMaps(apiKey);
      if (!containerRef.current) return;

      if (!mapInstanceRef.current) {
        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom: currentZoom,
          styles: luckydreamMapStyle,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        });

        mapInstanceRef.current = map;

        // Create Custom User Marker
        const userMarker = createCustomOverlayMarker(
          map,
          new google.maps.LatLng(center.lat, center.lng),
          {
            name: 'Bạn',
            isCurrentUser: true,
            isEyeMode,
          }
        );
        userMarkerRef.current = userMarker;

        // Create Accuracy Circle
        if (accuracy && accuracy > 0) {
          const circle = new google.maps.Circle({
            map,
            center,
            radius: accuracy,
            fillColor: '#6AC9F0',
            fillOpacity: 0.12,
            strokeColor: '#6AC9F0',
            strokeOpacity: 0.4,
            strokeWeight: 1.5,
          });
          accuracyCircleRef.current = circle;
        }

        if (onMapLoaded) onMapLoaded();
      }
    } catch (err) {
      console.warn('Maps JS API initialization error, switching to iframe fallback:', err);
      setUseIframeFallback(true);
    }
  }, [apiKey, useIframeFallback, currentZoom]);

  useEffect(() => {
    initMap();

    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null);
        userMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setMap(null);
        accuracyCircleRef.current = null;
      }
      mapInstanceRef.current = null;
    };
  }, [initMap]);

  // Smooth position & props updates for JS API map
  useEffect(() => {
    if (!mapInstanceRef.current || useIframeFallback) return;

    const latLng = new google.maps.LatLng(center.lat, center.lng);

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(latLng);
      userMarkerRef.current.updateProps({ isEyeMode });
    }

    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setCenter(latLng);
      if (accuracy && accuracy > 0) {
        accuracyCircleRef.current.setRadius(accuracy);
      }
    }

    mapInstanceRef.current.panTo(latLng);
  }, [center.lat, center.lng, accuracy, isEyeMode, useIframeFallback]);

  // Control Handlers
  const handleRecenter = () => {
    setCurrentZoom(zoom);
    if (mapInstanceRef.current && !useIframeFallback) {
      mapInstanceRef.current.panTo(new google.maps.LatLng(center.lat, center.lng));
      mapInstanceRef.current.setZoom(zoom);
    }
    if (onRecenter) onRecenter();
  };

  const handleZoomIn = () => {
    const nextZoom = Math.min(currentZoom + 1, 20);
    setCurrentZoom(nextZoom);
    if (mapInstanceRef.current && !useIframeFallback) {
      mapInstanceRef.current.setZoom(nextZoom);
    }
  };

  const handleZoomOut = () => {
    const nextZoom = Math.max(currentZoom - 1, 1);
    setCurrentZoom(nextZoom);
    if (mapInstanceRef.current && !useIframeFallback) {
      mapInstanceRef.current.setZoom(nextZoom);
    }
  };

  const embedUrl = `https://www.google.com/maps?q=${center.lat},${center.lng}&z=${currentZoom}&output=embed`;

  return (
    <div className="relative w-full h-[340px] sm:h-[400px] rounded-[32px] border-3 border-[#14213D]/10 bg-[#FFFDF9] overflow-hidden shadow-[0_12px_32px_rgba(20,33,61,0.08)] transition-all">
      {/* Decorative Frame Inner Glow Accent */}
      <div className="absolute inset-0 rounded-[30px] border border-white/60 pointer-events-none z-10" />

      {/* Map Content Renderer */}
      {useIframeFallback ? (
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          title="Google Maps"
          className="w-full h-full"
        />
      ) : (
        <div ref={containerRef} className="w-full h-full" />
      )}

      {/* Custom Redesigned Controls: Vertical Floating Capsule */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
        {/* Recenter Button */}
        <EyeFocusable id="btn-map-recenter" onSelect={handleRecenter}>
          <button
            type="button"
            aria-label="Về vị trí của tôi"
            className="w-11 h-11 rounded-2xl bg-white/95 backdrop-blur-md border-2 border-[#14213D]/15 text-[#14213D] shadow-md flex items-center justify-center hover:bg-[#6AC9F0]/20 active:scale-95 transition-all cursor-pointer"
          >
            <Locate className="w-5 h-5 text-[#14213D]" />
          </button>
        </EyeFocusable>

        {/* Zoom In & Out Capsule */}
        <div className="flex flex-col bg-white/95 backdrop-blur-md border-2 border-[#14213D]/15 rounded-2xl shadow-md overflow-hidden">
          <EyeFocusable id="btn-map-zoomin" onSelect={handleZoomIn}>
            <button
              type="button"
              aria-label="Phóng to"
              className="w-11 h-11 flex items-center justify-center text-[#14213D] hover:bg-[#6AC9F0]/15 active:scale-95 transition-all border-b border-[#14213D]/10 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </EyeFocusable>
          <EyeFocusable id="btn-map-zoomout" onSelect={handleZoomOut}>
            <button
              type="button"
              aria-label="Thu nhỏ"
              className="w-11 h-11 flex items-center justify-center text-[#14213D] hover:bg-[#6AC9F0]/15 active:scale-95 transition-all cursor-pointer"
            >
              <Minus className="w-5 h-5" />
            </button>
          </EyeFocusable>
        </div>
      </div>
    </div>
  );
}
