import React from 'react';

export type LogoVariant = 'onLight' | 'onDark' | 'markOnly';

export interface HounigoLogoProps {
  /**
   * 'onLight' (scritte Navy su superfici Cloud o Bianco)
   * 'onDark' (scritte Bianche su superfici Navy o scure)
   * 'markOnly' (solo il simbolo H con freccia e gradiente Coral-Arancio)
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
  variant = 'onLight',
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
      case 'xs': return '20px';
      case 'sm': return '28px';
      case 'md': return '38px';
      case 'lg': return '52px';
      case 'xl': return '68px';
      default: return '38px';
    }
  };

  const height = getHeight();

  if (variant === 'markOnly') {
    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 ${animated ? 'transition-transform duration-300 hover:scale-105 motion-reduce:transform-none' : ''} ${className}`}
        style={{ height, width: height }}
      >
        <img
          src={`${baseUrl}favicon.svg`}
          alt={alt}
          className="w-full h-full object-contain select-none"
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
