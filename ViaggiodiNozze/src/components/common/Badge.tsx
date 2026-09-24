
interface BadgeProps {
  label: string;
  variant?: 'amber' | 'purple' | 'sky' | 'slate' | 'emerald' | 'rose';
  size?: 'sm' | 'md';
}

export default function Badge({ label, variant = 'slate', size = 'sm' }: BadgeProps) {
  const variantStyles = {
    amber: 'bg-amber-50 text-amber-800 border-amber-200/80',
    purple: 'bg-purple-50 text-purple-800 border-purple-200/80',
    sky: 'bg-sky-50 text-sky-800 border-sky-200/80',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
    rose: 'bg-rose-50 text-rose-800 border-rose-200/80'
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1'
  };

  return (
    <span className={"inline-flex items-center font-medium rounded-full border " + variantStyles[variant] + " " + sizeStyles[size]}>
      {label}
    </span>
  );
}
