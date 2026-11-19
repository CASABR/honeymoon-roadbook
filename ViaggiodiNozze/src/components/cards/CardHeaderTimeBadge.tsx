interface CardHeaderTimeBadgeProps {
  label?: string;
  status?: 'confermato' | 'indicativo';
  title?: string;
}

/**
 * Renders the single time or fallback date pill inside the top-right slot of card headers.
 */
export default function CardHeaderTimeBadge({
  label,
  status,
  title,
}: CardHeaderTimeBadgeProps) {
  if (!label) return null;

  const isConfirmed = status === 'confermato';

  return (
    <span
      data-time-status={status}
      className={`hounigo-ds-time-stamp ${
        isConfirmed
          ? 'hounigo-ds-time-stamp-confirmed text-[#E11D48] dark:text-[#FF6B5F] font-black border-[#E11D48]/40 bg-rose-50 dark:bg-rose-950/40'
          : ''
      }`}
      title={title}
    >
      {isConfirmed && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-[#E11D48] dark:bg-[#FF6B5F] shrink-0"
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  );
}
