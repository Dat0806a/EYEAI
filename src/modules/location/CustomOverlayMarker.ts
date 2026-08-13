// Custom Overlay Marker for Google Maps supporting custom HTML, CSS animations, and future friend avatars

export interface PersonMarkerProps {
  name: string;
  isCurrentUser: boolean;
  avatarUrl?: string;
  isEyeMode?: boolean;
}

export interface ICustomOverlayMarker {
  setPosition(newPos: google.maps.LatLng): void;
  updateProps(newProps: Partial<PersonMarkerProps>): void;
  setMap(map: google.maps.Map | null): void;
}

export function createCustomOverlayMarker(
  map: google.maps.Map,
  position: google.maps.LatLng,
  props: PersonMarkerProps
): ICustomOverlayMarker | null {
  if (typeof google === 'undefined' || !google.maps || !google.maps.OverlayView) {
    return null;
  }

  class CustomOverlayMarkerImpl extends google.maps.OverlayView implements ICustomOverlayMarker {
    private position: google.maps.LatLng;
    private container: HTMLDivElement;
    private props: PersonMarkerProps;

    constructor() {
      super();
      this.position = position;
      this.props = props;
      this.container = document.createElement('div');
      this.container.style.position = 'absolute';
      this.container.style.transform = 'translate(-50%, -100%)';
      this.container.style.cursor = 'pointer';
      this.container.style.pointerEvents = 'auto';
      this.renderContent();
      this.setMap(map);
    }

    private renderContent() {
      const { name, isCurrentUser, avatarUrl, isEyeMode } = this.props;

      this.container.innerHTML = `
        <div class="group relative flex flex-col items-center select-none transition-transform duration-200 hover:scale-105">
          <!-- Small Name / Status Badge -->
          <div class="mb-1.5 px-3 py-0.5 bg-[#14213D] text-[#FFF2D6] text-[11px] font-black rounded-full shadow-md border border-[#6AC9F0]/60 flex items-center gap-1.5 whitespace-nowrap">
            <span class="w-2 h-2 rounded-full ${isCurrentUser ? 'bg-[#6AC9F0]' : 'bg-[#FF6F61]'}"></span>
            <span>${name}</span>
          </div>

          <!-- Marker Core -->
          <div class="relative flex items-center justify-center">
            <!-- Subtle Radar Halo Pulse Ring (Disabled in Eye Mode) -->
            ${
              !isEyeMode
                ? `<div class="absolute w-14 h-14 rounded-full bg-[#6AC9F0]/30 border border-[#6AC9F0]/50 animate-ping opacity-50 pointer-events-none"></div>`
                : ''
            }

            <!-- Main Marker Shell -->
            <div class="relative w-11 h-11 rounded-full bg-[#FFFDF9] border-3 border-[#6AC9F0] shadow-[0_4px_14px_rgba(20,33,61,0.22)] flex items-center justify-center z-10">
              ${
                avatarUrl
                  ? `<img src="${avatarUrl}" alt="${name}" class="w-8 h-8 rounded-full object-cover" />`
                  : isCurrentUser
                  ? `<div class="w-7 h-7 rounded-full bg-[#6AC9F0] border-2 border-[#14213D] flex items-center justify-center shadow-inner">
                       <svg class="w-4 h-4 text-[#14213D]" fill="currentColor" viewBox="0 0 20 20">
                         <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                       </svg>
                     </div>`
                  : `<div class="w-7 h-7 rounded-full bg-[#FF6F61] text-white text-xs font-black flex items-center justify-center shadow-inner">
                       ${name.charAt(0)}
                     </div>`
              }
            </div>

            <!-- Soft Drop Pointer Tip -->
            <div class="w-3.5 h-3.5 bg-[#6AC9F0] rotate-45 border-r border-b border-[#14213D]/20 -mt-2 z-0 rounded-xs"></div>
          </div>
        </div>
      `;
    }

    onAdd() {
      const panes = this.getPanes();
      if (panes?.overlayMouseTarget) {
        panes.overlayMouseTarget.appendChild(this.container);
      }
    }

    draw() {
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(this.position);
      if (point) {
        this.container.style.left = `${Math.round(point.x)}px`;
        this.container.style.top = `${Math.round(point.y)}px`;
      }
    }

    public setPosition(newPos: google.maps.LatLng) {
      this.position = newPos;
      this.draw();
    }

    public updateProps(newProps: Partial<PersonMarkerProps>) {
      this.props = { ...this.props, ...newProps };
      this.renderContent();
    }

    onRemove() {
      if (this.container.parentElement) {
        this.container.parentElement.removeChild(this.container);
      }
    }
  }

  return new CustomOverlayMarkerImpl();
}
