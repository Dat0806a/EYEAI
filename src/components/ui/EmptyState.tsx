import React, { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="w-full bg-white rounded-[28px] p-8 border-2 border-[#14213D]/10 card-asymmetric shadow-sm flex flex-col items-center text-center gap-4 my-4">
      <div className="w-16 h-16 rounded-[20px] bg-[#6AC9F0]/15 text-[#14213D] border-2 border-[#6AC9F0]/40 flex items-center justify-center">
        {icon}
      </div>

      <div className="max-w-md">
        <h3 className="text-xl font-black text-[#14213D]">{title}</h3>
        <p className="text-sm text-[#3B4B68] mt-1 leading-relaxed">{description}</p>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 px-6 py-3 bg-[#6AC9F0] text-[#14213D] font-bold rounded-[18px] border-2 border-[#6AC9F0] shadow-sm hover:scale-102 transition-all cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
