import React from 'react';

interface StatusBadgeProps {
  label: string;
  status?: 'active' | 'warning' | 'idle';
  className?: string;
}

export function StatusBadge({ label, status = 'active', className = '' }: StatusBadgeProps) {
  const statusStyles = {
    active: 'bg-[#6AC9F0]/20 text-[#14213D] border-[#6AC9F0]/50',
    warning: 'bg-[#FF6F61]/20 text-[#14213D] border-[#FF6F61]/50',
    idle: 'bg-slate-100 text-[#3B4B68] border-slate-300',
  };

  const dotStyles = {
    active: 'bg-[#6AC9F0] animate-pulse',
    warning: 'bg-[#FF6F61] animate-pulse',
    idle: 'bg-slate-400',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${statusStyles[status]} ${className}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${dotStyles[status]}`} />
      <span>{label}</span>
    </div>
  );
}
