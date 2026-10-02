import React from 'react';
import { AlertTriangle, Check, Trash2, Upload, X } from 'lucide-react';

interface DriveModalProps {
  isOpen: boolean;
  type: 'save' | 'delete';
  title: string;
  description: string;
  itemCount?: number;
  itemList?: string[];
  isProcessing?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const DriveModal: React.FC<DriveModalProps> = ({
  isOpen,
  type,
  title,
  description,
  itemCount,
  itemList,
  isProcessing = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900/95 border border-purple-500/40 rounded-2xl shadow-2xl shadow-purple-950/60 p-6 text-slate-100">
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start space-x-3 mb-4">
          <div
            className={`p-2.5 rounded-xl ${
              type === 'delete'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-gradient-to-tr from-rose-500/20 to-purple-500/20 text-pink-300 border border-pink-500/40'
            }`}
          >
            {type === 'delete' ? (
              <Trash2 className="w-6 h-6" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">{description}</p>
          </div>
        </div>

        {itemList && itemList.length > 0 && (
          <div className="mb-4 bg-slate-950/90 rounded-xl p-3 border border-purple-900/40 max-h-40 overflow-y-auto">
            <div className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider mb-2">
              Betroffene Dateien ({itemCount || itemList.length}):
            </div>
            <ul className="space-y-1 text-xs font-mono text-slate-300">
              {itemList.map((item, idx) => (
                <li key={idx} className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>
                  <span className="truncate">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {type === 'delete' && (
          <div className="flex items-center space-x-2 p-3 mb-4 bg-rose-950/50 border border-rose-800/50 rounded-xl text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Diese Datei wird unwiderruflich aus deinem Google Drive entfernt.</span>
          </div>
        )}

        <div className="flex items-center justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center space-x-2 transition shadow-lg ${
              type === 'delete'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                : 'bg-gradient-to-r from-rose-500 via-purple-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white font-bold shadow-purple-900/40'
            }`}
          >
            {isProcessing ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Wird verarbeitet...</span>
              </span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{type === 'delete' ? 'Löschen bestätigen' : 'In Google Drive speichern'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
