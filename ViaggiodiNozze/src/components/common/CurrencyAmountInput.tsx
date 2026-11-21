import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';
import { detectCurrencyFromValue, SUPPORTED_CURRENCIES } from '../../services/currencyService';

export interface CurrencyAmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  currencyLabel?: string;
  currency?: string;
  uncertain?: boolean;
  containerClassName?: string;
  onCurrencyChange?: (currency: string) => void;
}

export default forwardRef<HTMLInputElement, CurrencyAmountInputProps>(function CurrencyAmountInput({ value, onValueChange, currencyLabel = 'Valuta importo', currency, onCurrencyChange, uncertain = false, containerClassName = '', ...props }, ref) {
  const detected = detectCurrencyFromValue(value);
  const knownCode = detected.currency === 'RMB' ? 'CNY' : detected.currency;
  const supported = (code: string | null): code is typeof SUPPORTED_CURRENCIES[number] => SUPPORTED_CURRENCIES.includes(code as typeof SUPPORTED_CURRENCIES[number]);
  const [selected, setSelected] = useState<string>(() => uncertain && !detected.isExplicitEur && !detected.isForeign ? '' : supported(knownCode) ? knownCode : 'EUR');
  useEffect(() => {
    const info = detectCurrencyFromValue(value);
    const next = info.currency;
    if (uncertain && !info.isExplicitEur && !info.isForeign) setSelected('');
    else if (supported(next)) setSelected(next);
    else if (!value) setSelected('EUR');
  }, [value, uncertain]);
  const code = (detected.isForeign || detected.isExplicitEur) && supported(knownCode) ? knownCode : uncertain && !selected ? '' : currency && supported(currency) ? currency : selected;
  const amount = detected.hasValue && !detected.isAmbiguous && /\d/.test(value) ? String(detected.amount) : value;
  return <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${containerClassName}`}>
    <input {...props} ref={ref} className={`${props.className || ''} min-w-0 flex-1`} style={{ ...props.style, minWidth: 0 }} type="text" inputMode="decimal" value={amount} onChange={event => {
      const raw = event.target.value;
      const info = detectCurrencyFromValue(raw);
      if (!raw.trim()) { onValueChange('');return; }
      const qualified = /[a-zA-Z€$£¥₱]/.test(raw);
      onValueChange(qualified || !code ? raw : `${raw.trim()} ${code}`);
      if (qualified && info.currency && supported(info.currency)) { setSelected(info.currency);onCurrencyChange?.(info.currency); }
    }} />
    <select aria-label={currencyLabel} value={code} disabled={props.disabled || props.readOnly} className="h-10 max-w-24 shrink-0 rounded-xl border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" onChange={event => {
      const next = event.target.value;
      setSelected(next as typeof SUPPORTED_CURRENCIES[number]);onCurrencyChange?.(next);
      onValueChange(/\d/.test(value) ? `${detected.amount} ${next}` : value);
    }}>{uncertain && <option value="">Da confermare</option>}{SUPPORTED_CURRENCIES.map(option => <option key={option} value={option}>{option}</option>)}</select>
  </div>;
});
