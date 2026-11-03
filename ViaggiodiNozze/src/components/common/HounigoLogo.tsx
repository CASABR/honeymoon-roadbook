import React from 'react';

export type LogoVariant = 'auto' | 'onLight' | 'onDark' | 'markOnly';

export interface HounigoLogoProps {
  /**
   * 'auto' (switch automatico tra chiaro e scuro via Tailwind dark mode)
   * 'onLight' (scritte Navy su superfici Cloud o Bianco)
   * 'onDark' (scritte Bianche su superfici Navy o scure)
   * 'markOnly' (solo il simbolo H)
   */
  variant?: LogoVariant;
  /**
   * Dimensione preimpostata o altezza numerica in pixel
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  alt?: string;
  animated?: boolean;
}

export const HounigoLogo: React.FC<HounigoLogoProps> = ({
  variant = 'auto',
  size = 'md',
  className = '',
  alt = 'Hounigo',
  animated = false
}) => {
  const baseUrl = import.meta.env.BASE_URL || '/';

  // Altezze responsive corrispondenti
  const getHeight = (): string => {
    if (typeof size === 'number') return `${size}px`;
    switch (size) {
      case 'xs': return '22px';
      case 'sm': return '28px';
      case 'md': return '36px';
      case 'lg': return '48px';
      case 'xl': return '64px';
      default: return '36px';
    }
  };

  const height = getHeight();

  if (variant === 'auto') {
    return (
      <div
        className={`inline-flex items-center shrink-0 ${animated ? 'transition-all duration-300 hover:opacity-95 motion-reduce:transition-none' : ''} ${className}`}
      >
        <img
          src={`${baseUrl}images/brand/hounigo-logo-on-light.png`}
          alt={alt}
          style={{ height, width: 'auto', maxHeight: '100%' }}
          className="block dark:hidden object-contain select-none max-w-full drop-shadow-none"
          loading="eager"
          decoding="async"
        />
        <img
          src={`${baseUrl}images/brand/hounigo-logo-on-dark.png`}
          alt={alt}
          style={{ height, width: 'auto', maxHeight: '100%' }}
          className="hidden dark:block object-contain select-none max-w-full drop-shadow-none"
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  const logoSrc = variant === 'onDark'
    ? `${baseUrl}images/brand/hounigo-logo-on-dark.png`
    : `${baseUrl}images/brand/hounigo-logo-on-light.png`;

  return (
    <div
      className={`inline-flex items-center shrink-0 ${animated ? 'transition-all duration-300 hover:opacity-95 motion-reduce:transition-none' : ''} ${className}`}
    >
      <img
        src={logoSrc}
        alt={alt}
        style={{ height, width: 'auto', maxHeight: '100%' }}
        className="object-contain select-none max-w-full drop-shadow-none"
        loading="eager"
        decoding="async"
      />
    </div>
  );
};

export default HounigoLogo;
