import { useMemo } from 'react';
import { resolvePaymentInfo } from '../../utils/priceHelper';

interface DesktopEconomySummaryProps {
  items: any[];
  categoryName?: string;
  accentColor?: 'indigo' | 'amber' | 'blue' | 'orange' | 'emerald';
}

export default function DesktopEconomySummary({
  items,
  categoryName,
  accentColor = 'indigo'
}: DesktopEconomySummaryProps) {
  const summary = useMemo(() => {
    let totalCost = 0;
    let paidCost = 0;

    items.forEach((item) => {
      const paymentInfo = resolvePaymentInfo({
        cost: item.cost ?? item.budget ?? item.amount,
        depositPaid: item.depositPaid ?? item.acconto ?? item.amountPaid,
        paymentStatus: item.paymentStatus,
        status: item.status,
        completed: item.completed,
        packageIncluded: item.packageIncluded
      });

      if (paymentInfo.isFree || paymentInfo.isPackageIncluded) {
        return;
      }

      const cost = paymentInfo.costNum;
      totalCost += cost;

      if (paymentInfo.isPaid) {
        paidCost += cost;
      } else if (paymentInfo.paidNum > 0) {
        paidCost += Math.min(cost, paymentInfo.paidNum);
      }
    });

    const toPayCost = Math.max(0, totalCost - paidCost);

    return {
      totalCost,
      paidCost,
      toPayCost,
      count: items.length
    };
  }, [items]);

  const borderAccents = {
    indigo: 'border-indigo-100 dark:border-indigo-900/40',
    amber: 'border-amber-100 dark:border-amber-900/40',
    blue: 'border-blue-100 dark:border-blue-900/40',
    orange: 'border-orange-100 dark:border-orange-900/40',
    emerald: 'border-emerald-100 dark:border-emerald-900/40'
  };

  return (
    <div className="hidden md:grid md:grid-cols-3 gap-3.5 mb-5">
      {/* 1. Spesa Totale Prevista */}
      <div className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border ${borderAccents[accentColor]} shadow-2xs`}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Totale {categoryName || 'Spesa'}
          </span>
          <span className="text-base">💰</span>
        </div>
        <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">
          € {summary.totalCost.toFixed(2)}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {summary.count} {summary.count === 1 ? 'elemento registrato' : 'elementi registrati'}
        </p>
      </div>

      {/* 2. Già Saldato */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Già Saldato
          </span>
          <span className="text-base">✓</span>
        </div>
        <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
          € {summary.paidCost.toFixed(2)}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {summary.totalCost > 0 ? `${Math.round((summary.paidCost / summary.totalCost) * 100)}% coperto` : 'Nessun costo'}
        </p>
      </div>

      {/* 3. Da Saldare / Rimanente */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/40 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            Da Saldare
          </span>
          <span className="text-base">⏳</span>
        </div>
        <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
          € {summary.toPayCost.toFixed(2)}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {summary.toPayCost === 0 ? '✓ Tutto saldato' : 'Rimanente da pagare'}
        </p>
      </div>
    </div>
  );
}
