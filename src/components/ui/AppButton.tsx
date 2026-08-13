import React, { ReactNode } from 'react';
import { EyeFocusable } from '../../modules/eye-control/EyeFocusable';

interface AppButtonProps {
  id: string;
  onClick?: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  row?: number;
  col?: number;
}

export function AppButton({
  id,
  onClick,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  icon,
  className = '',
  disabled = false,
  row,
  col,
}: AppButtonProps) {
  const baseClasses = 'min-h-[56px] font-bold rounded-[20px] transition-all flex items-center justify-center gap-2.5 px-6 shadow-sm active:scale-96 cursor-pointer select-none';

  const variantClasses = {
    primary: 'bg-[#6AC9F0] hover:bg-[#5bbce3] text-[#14213D] border-2 border-[#6AC9F0]',
    accent: 'bg-[#FF6F61] hover:bg-[#f06052] text-white border-2 border-[#FF6F61] shadow-[0_8px_20px_-4px_rgba(255,111,97,0.4)]',
    secondary: 'bg-white hover:bg-slate-50 text-[#14213D] border-2 border-[#14213D]/15',
    outline: 'bg-transparent text-[#14213D] border-2 border-[#14213D]/30 hover:bg-[#14213D]/5',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white border-2 border-rose-700',
  };

  const sizeClasses = {
    sm: 'text-sm py-2.5 px-4 min-h-[48px]',
    md: 'text-base py-3.5 px-6 min-h-[56px]',
    lg: 'text-lg py-4 px-8 min-h-[64px]',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <EyeFocusable
      id={id}
      onSelect={disabled ? undefined : onClick}
      row={row}
      col={col}
      className={`${widthClass} ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span className="truncate">{children}</span>
      </button>
    </EyeFocusable>
  );
}
