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

function sanitizeAvatarUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
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
      const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'Người dùng';
      const safeAvatarUrl = sanitizeAvatarUrl(avatarUrl);

      this.container.replaceChildren();

      const wrapper = document.createElement('div');
      wrapper.className = 'group relative flex flex-col items-center select-none transition-transform duration-200 hover:scale-105';

      // Name / Status Badge (strictly textContent, no HTML interpolation)
      const badge = document.createElement('div');
      badge.className = 'mb-1.5 px-3 py-0.5 bg-[#14213D] text-[#FFF2D6] text-[11px] font-black rounded-full shadow-md border border-[#6AC9F0]/60 flex items-center gap-1.5 whitespace-nowrap';

      const statusDot = document.createElement('span');
      statusDot.className = `w-2 h-2 rounded-full ${isCurrentUser ? 'bg-[#6AC9F0]' : 'bg-[#FF6F61]'}`;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = safeName;

      badge.appendChild(statusDot);
      badge.appendChild(nameSpan);
      wrapper.appendChild(badge);

      // Marker Core
      const core = document.createElement('div');
      core.className = 'relative flex items-center justify-center';

      if (!isEyeMode) {
        const pulseRing = document.createElement('div');
        pulseRing.className = 'absolute w-14 h-14 rounded-full bg-[#6AC9F0]/30 border border-[#6AC9F0]/50 animate-ping opacity-50 pointer-events-none';
        core.appendChild(pulseRing);
      }

      const shell = document.createElement('div');
      shell.className = 'relative w-11 h-11 rounded-full bg-[#FFFDF9] border-3 border-[#6AC9F0] shadow-[0_4px_14px_rgba(20,33,61,0.22)] flex items-center justify-center z-10';

      if (safeAvatarUrl) {
        const img = document.createElement('img');
        img.src = safeAvatarUrl;
        img.alt = safeName;
        img.className = 'w-8 h-8 rounded-full object-cover';
        img.referrerPolicy = 'no-referrer';
        shell.appendChild(img);
      } else if (isCurrentUser) {
        const avatarCircle = document.createElement('div');
        avatarCircle.className = 'w-7 h-7 rounded-full bg-[#6AC9F0] border-2 border-[#14213D] flex items-center justify-center shadow-inner';
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'w-4 h-4 text-[#14213D]');
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('viewBox', '0 0 20 20');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('d', 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z');
        path.setAttribute('clip-rule', 'evenodd');
        svg.appendChild(path);
        avatarCircle.appendChild(svg);
        shell.appendChild(avatarCircle);
      } else {
        const initialCircle = document.createElement('div');
        initialCircle.className = 'w-7 h-7 rounded-full bg-[#FF6F61] text-white text-xs font-black flex items-center justify-center shadow-inner';
        initialCircle.textContent = safeName.charAt(0).toUpperCase();
        shell.appendChild(initialCircle);
      }

      core.appendChild(shell);

      const pointerTip = document.createElement('div');
      pointerTip.className = 'w-3.5 h-3.5 bg-[#6AC9F0] rotate-45 border-r border-b border-[#14213D]/20 -mt-2 z-0 rounded-xs';
      core.appendChild(pointerTip);

      wrapper.appendChild(core);
      this.container.appendChild(wrapper);
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
