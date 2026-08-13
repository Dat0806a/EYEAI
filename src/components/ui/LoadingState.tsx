import React from 'react';

interface LoadingStateProps {
  type?: 'card' | 'list' | 'text';
  count?: number;
}

export function LoadingState({ type = 'card', count = 2 }: LoadingStateProps) {
  const items = Array.from({ length: count });

  if (type === 'card') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {items.map((_, i) => (
          <div
            key={`skeleton-card-${i}`}
            className="w-full min-h-[120px] p-5 bg-white/70 border-2 border-[#14213D]/10 card-asymmetric animate-pulse flex items-center gap-4"
          >
            <div className="w-14 h-14 rounded-[16px] bg-[#6AC9F0]/20" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-[#14213D]/15 rounded-md w-3/4" />
              <div className="h-4 bg-[#14213D]/10 rounded-md w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 p-4">
      {items.map((_, i) => (
        <div
          key={`skeleton-row-${i}`}
          className="h-12 bg-white/60 border border-[#14213D]/10 rounded-[18px] animate-pulse"
        />
      ))}
    </div>
  );
}
