import { useState, useEffect } from 'react';
import { VaultItem } from '../types';
import { getAllVaultItems, deleteVaultItem, nukeVault } from '../utils/vault';
import { 
  Archive, 
  Trash2, 
  Download, 
  Copy, 
  Check, 
  Image as ImageIcon, 
  Music, 
  FileText, 
  Clock, 
  HardDrive, 
  AlertTriangle 
} from 'lucide-react';
import { cn } from '../utils/cn';
import { motion, AnimatePresence } from 'motion/react';

export default function VaultMode() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const data = await getAllVaultItems();
      setItems(data);
    } catch (err) {
      console.error("Failed to load vault items:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteVaultItem(id);
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleNuke = async () => {
    try {
      await nukeVault();
      setItems([]);
      setShowNukeConfirm(false);
    } catch (err) {
      console.error("Failed to nuke vault:", err);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.warn("Failed to copy:", err);
    }
  };

  const formatTimestamp = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const totalBytes = items.reduce((acc, item) => acc + item.sizeBytes, 0);

  return (
    <div className="flex flex-col items-center justify-start w-full max-w-2xl mx-auto py-2">
      {/* Top Header Card */}
      <div className="w-full bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-2xl p-4 shadow-[6px_6px_0px_var(--lego-border)] mb-6 flex items-center justify-between transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#FFD500] border-3 border-[var(--lego-border)] rounded-xl text-[#2B2B2B] shadow-[2px_2px_0px_var(--lego-border)]">
            <Archive className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase text-[var(--lego-text)]">
              Air-Gap Vault
            </h2>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--lego-muted)]">
              <HardDrive className="w-3.5 h-3.5" />
              <span>{items.length} Saved Transmissions • {(totalBytes / 1024).toFixed(1)} KB Offline</span>
            </div>
          </div>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNukeConfirm(true)}
            className="px-3 py-2 bg-[#D01012] border-3 border-[#8C0000] text-white rounded-xl text-xs font-black uppercase shadow-[2px_2px_0px_#8C0000] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all flex items-center gap-1.5"
            title="Purge all vault history"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Nuke Vault
          </button>
        )}
      </div>

      {/* Confirmation Modal for Nuke */}
      {showNukeConfirm && (
        <div className="w-full bg-red-50 dark:bg-red-950/40 border-4 border-[#D01012] rounded-2xl p-4 shadow-[6px_6px_0px_#D01012] mb-6 flex flex-col items-center text-center">
          <AlertTriangle className="w-8 h-8 text-[#D01012] mb-2" />
          <h3 className="font-black text-[#D01012] uppercase text-base">Permanently Wipe Entire Vault?</h3>
          <p className="text-xs font-bold text-[var(--lego-muted)] mb-4">
            This will permanently delete all stored transmissions from this device.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleNuke}
              className="px-4 py-2 bg-[#D01012] border-2 border-[#8C0000] text-white font-black text-xs uppercase rounded-lg shadow-sm"
            >
              Yes, Wipe Everything
            </button>
            <button
              onClick={() => setShowNukeConfirm(false)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-[var(--lego-text)] font-black text-xs uppercase rounded-lg border-2 border-[var(--lego-border)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items List */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#0057A6] rounded-full animate-spin mb-3"></div>
          <p className="text-xs font-bold text-[var(--lego-muted)] uppercase">Loading Vault...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="w-full bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-2xl p-8 shadow-[6px_6px_0px_var(--lego-border)] flex flex-col items-center text-center">
          <div className="p-4 bg-slate-100 dark:bg-slate-800 border-3 border-[var(--lego-border)] rounded-full mb-3 text-[var(--lego-muted)]">
            <Archive className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black uppercase text-[var(--lego-text)] mb-1">
            Vault is Empty
          </h3>
          <p className="text-xs font-medium text-[var(--lego-muted)] max-w-sm">
            Any photos, audio clips, or secret notes received via the optical scanner will automatically be archived here for offline access!
          </p>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-4">
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-2xl p-4 shadow-[6px_6px_0px_var(--lego-border)] flex flex-col transition-colors duration-300 relative overflow-hidden"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border-2",
                      item.type === 'image' && "bg-[#0057A6]/10 text-[#0057A6] border-[#0057A6]",
                      item.type === 'audio' && "bg-[#00A650]/10 text-[#00A650] border-[#007036]",
                      item.type === 'text' && "bg-[#D01012]/10 text-[#D01012] border-[#D01012]"
                    )}>
                      {item.type === 'image' && <ImageIcon className="w-3.5 h-3.5" />}
                      {item.type === 'audio' && <Music className="w-3.5 h-3.5" />}
                      {item.type === 'text' && <FileText className="w-3.5 h-3.5" />}
                      {item.type}
                    </span>
                    <span className="text-xs font-bold text-[var(--lego-muted)] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {item.type === 'text' && (
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, item.data)}
                        className="p-1.5 bg-slate-100 dark:bg-slate-800 border-2 border-[var(--lego-border)] rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                        title="Copy text"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-4 h-4 text-[#00A650]" />
                        ) : (
                          <Copy className="w-4 h-4 text-[var(--lego-text)]" />
                        )}
                      </button>
                    )}

                    <a
                      href={item.type === 'text' ? URL.createObjectURL(new Blob([item.data], { type: 'text/plain' })) : item.data}
                      download={
                        item.type === 'audio' 
                          ? `qrmesh-${item.id}.wav` 
                          : item.type === 'text' 
                          ? `qrmesh-${item.id}.txt` 
                          : `qrmesh-${item.id}.jpg`
                      }
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 border-2 border-[var(--lego-border)] rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors text-[var(--lego-text)]"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-900 rounded-lg text-xs font-bold text-[#D01012] hover:bg-red-100 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Content Preview */}
                <div className="w-full rounded-xl overflow-hidden bg-[var(--lego-bg)] border-2 border-[var(--lego-border)] p-2">
                  {item.type === 'image' ? (
                    <img
                      src={item.data}
                      alt={item.title}
                      className="w-full h-auto max-h-[220px] object-contain rounded-lg"
                    />
                  ) : item.type === 'audio' ? (
                    <div className="p-3 flex items-center justify-center bg-[#FFD500] rounded-lg">
                      <audio src={item.data} controls className="w-full max-w-xs outline-none" />
                    </div>
                  ) : (
                    <pre className="p-2 font-mono text-xs text-[var(--lego-text)] whitespace-pre-wrap break-words max-h-[160px] overflow-y-auto select-all">
                      {item.data}
                    </pre>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
