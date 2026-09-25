import Modal from '../common/Modal';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  title?: string;
  subtitle?: string;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  code,
  title = 'QR Code per la scansione',
  subtitle
}: QRCodeModalProps) {
  if (!code) return null;

  // Usa l'API standard sicura QR Server (nessuna dipendenza JS esterna, 100% stabile)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(code)}&margin=10`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} accentVariant="amber">
      <div className="flex flex-col items-center justify-center p-3 text-center space-y-4">
        {subtitle && (
          <p className="text-xs text-slate-500 font-medium">
            {subtitle}
          </p>
        )}

        {/* Contenitore QR Code ad altissimo contrasto per facilitare la scansione */}
        <div className="bg-white p-4 rounded-3xl border-2 border-slate-900 shadow-xl inline-block">
          <img
            src={qrUrl}
            alt={`QR Code: ${code}`}
            className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl"
            loading="eager"
          />
        </div>

        <div className="w-full bg-slate-50 rounded-2xl p-3 border border-slate-200/80">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-0.5">
            Dato / Codice Scansionato
          </span>
          <p className="font-mono text-xs font-bold text-slate-900 break-all select-all">
            {code}
          </p>
        </div>

        <p className="text-[11px] text-slate-400">
          💡 Suggerimento: alza la luminosità dello schermo per una scansione ottimale.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer"
        >
          Chiudi
        </button>
      </div>
    </Modal>
  );
}
