import type { ReactNode } from 'react';

interface CardTitleWithTimeProps {
  title: ReactNode;
  timeLabel?: string;
  timeStatus?: 'confermato' | 'indicativo';
  timeTitle?: string;
}

/**
 * Renders the booking or activity title immediately followed by its time badge,
 * keeping mobile wrapping clean on narrow iPhone viewports.
 */
export default function CardTitleWithTime({
  title,
  timeLabel,
  timeStatus,
  timeTitle,
}: CardTitleWithTimeProps) {
  const isConfirmed = timeStatus === 'confermato';

  return (
    <div className="hounigo-ds-title-row">
      <h3 className="font-extrabold text-base sm:text-[17px] leading-snug tracking-tight text-slate-900 dark:text-white break-words min-w-0">
        {title}
      </h3>
      {timeLabel && (
        <span
          data-time-status={timeStatus}
          className={`hounigo-ds-time-stamp hounigo-ds-time-stamp--inline ${
            isConfirmed
              ? 'hounigo-ds-time-stamp-confirmed text-[#E11D48] dark:text-[#FF6B5F] font-black border-[#E11D48]/40 bg-rose-50 dark:bg-rose-950/40'
              : ''
          }`}
          title={timeTitle}
        >
          {isConfirmed && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#E11D48] dark:bg-[#FF6B5F] mr-1" aria-hidden="true" />
          )}
          {timeLabel}
        </span>
      )}
    </div>
  );
}
