import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-sky-blue text-white hover:bg-[#4ab7e4]',
  secondary: 'bg-health-green text-white hover:bg-[#115543]',
  accent: 'bg-coral text-white hover:bg-[#e85f52]',
  ghost: 'bg-transparent text-navy border border-gray-300 hover:bg-gray-50',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`touch-target rounded-2xl px-5 py-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-navy outline-none transition focus:border-sky-blue focus:ring-2 focus:ring-sky-blue/30 focus-visible:ring-sky-blue ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Đang xử lý...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-navy" role="status">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-blue border-t-transparent" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'warning' | 'info' }) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-sky-blue/40 bg-sky-blue/10 text-navy',
  };
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
