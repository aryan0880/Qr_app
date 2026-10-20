/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import SendMode from './components/SendMode';
import ReceiveMode from './components/ReceiveMode';
import VaultMode from './components/VaultMode';
import MotionShowreel from './components/MotionShowreel';
import { cn } from './utils/cn';
import { ScanLine, Send, Moon, Sun, DownloadCloud, WifiOff, Archive, Clapperboard } from 'lucide-react';
import { AppMode } from './types';

export default function App() {
  const [mode, setMode] = useState<AppMode>('send');
  const [isDark, setIsDark] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDark(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className={cn("min-h-screen bg-[var(--lego-bg)] text-[var(--lego-text)] overflow-hidden relative transition-colors duration-300", isDark ? "dark" : "")}>
      {/* Top Header Floating Controls */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
        {isInstallable && (
          <button
            onClick={handleInstallClick}
            className="px-4 py-2.5 bg-[#00A650] border-4 border-[#007036] shadow-[4px_4px_0px_#007036] rounded-xl hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all text-white font-black text-xs uppercase tracking-wide flex items-center gap-2"
            title="Install QRMesh PWA for 100% offline use"
          >
            <DownloadCloud className="w-4 h-4" />
            Install App
          </button>
        )}

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-3 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] shadow-[4px_4px_0px_var(--lego-border)] rounded-xl hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_var(--lego-border)] active:translate-y-1 active:shadow-none transition-all text-[var(--lego-text)]"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-6 h-6" strokeWidth={2.5}/> : <Moon className="w-6 h-6" strokeWidth={2.5}/>}
        </button>
      </div>

      {/* Top Left Air-Gap Indicator */}
      <div className="absolute top-4 left-4 z-50 hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[var(--lego-card)] border-2 border-[var(--lego-border)] shadow-[3px_3px_0px_var(--lego-border)] rounded-lg text-xs font-black text-[var(--lego-text)]">
        <WifiOff className="w-3.5 h-3.5 text-[#00A650]" />
        <span>100% AIR-GAP READY</span>
      </div>

      {/* Playful Lego Baseplate Background Mesh */}
      <div className="fixed inset-0 z-0 pointer-events-none transition-colors duration-300">
        <div 
          className="absolute inset-0 opacity-[0.25]"
          style={{
            backgroundImage: `
              radial-gradient(circle at 10px 10px, var(--lego-stud-dark) 2.5px, transparent 3px),
              radial-gradient(circle at 10px 10px, var(--lego-stud-light) 2px, transparent 2px)
            `,
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="w-full p-4 sm:p-6 flex flex-col items-center">
          <div className="bg-[#FFD500] px-6 py-2 rounded-xl border-4 border-[var(--lego-border)] shadow-[4px_4px_0px_var(--lego-border)] mb-3 rotate-[-2deg] flex items-center gap-2 transition-colors duration-300">
            <ScanLine className="w-6 h-6 text-[#2B2B2B]" strokeWidth={3} />
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#2B2B2B] uppercase">
              QRMesh
            </h1>
          </div>
          <p className="text-[var(--lego-muted)] font-medium text-center text-xs sm:text-sm transition-colors duration-300">
            Send text, photos & audio using only light. Zero internet needed!
          </p>
          
          {/* Main 3-Way Mode Toggle */}
          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
            <button
              onClick={() => setMode('send')}
              className={cn(
                "px-5 sm:px-7 py-2.5 rounded-xl text-base font-bold transition-all border-4 flex items-center gap-2 uppercase tracking-wide",
                mode === 'send' 
                  ? "bg-[#0057A6] border-[#003B73] text-white shadow-none translate-y-1" 
                  : "bg-[var(--lego-card)] border-[var(--lego-border)] text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
              )}
            >
              <Send className="w-4 h-4" strokeWidth={2.5} />
              Transmit
            </button>

            <button
              onClick={() => setMode('receive')}
              className={cn(
                "px-5 sm:px-7 py-2.5 rounded-xl text-base font-bold transition-all border-4 flex items-center gap-2 uppercase tracking-wide",
                mode === 'receive' 
                  ? "bg-[#00A650] border-[#007036] text-white shadow-none translate-y-1" 
                  : "bg-[var(--lego-card)] border-[var(--lego-border)] text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
              )}
            >
              <ScanLine className="w-4 h-4" strokeWidth={2.5} />
              Scan
            </button>

            <button
              onClick={() => setMode('vault')}
              className={cn(
                "px-5 sm:px-7 py-2.5 rounded-xl text-base font-bold transition-all border-4 flex items-center gap-2 uppercase tracking-wide",
                mode === 'vault' 
                  ? "bg-[#FFD500] border-[#B29500] text-[#2B2B2B] shadow-none translate-y-1" 
                  : "bg-[var(--lego-card)] border-[var(--lego-border)] text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
              )}
            >
              <Archive className="w-4 h-4" strokeWidth={2.5} />
              Vault
            </button>

            <button
              onClick={() => setMode('showreel')}
              className={cn(
                "px-5 sm:px-7 py-2.5 rounded-xl text-base font-bold transition-all border-4 flex items-center gap-2 uppercase tracking-wide",
                mode === 'showreel' 
                  ? "bg-[#E3000B] border-[#990007] text-white shadow-none translate-y-1" 
                  : "bg-[var(--lego-card)] border-[var(--lego-border)] text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none"
              )}
              title="Watch 20-second /brag Launch Video Motion Showreel"
            >
              <Clapperboard className="w-4 h-4" strokeWidth={2.5} />
              Showreel
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col items-center justify-start p-3 sm:p-6">
          {mode === 'send' ? (
            <SendMode />
          ) : mode === 'receive' ? (
            <ReceiveMode />
          ) : mode === 'vault' ? (
            <VaultMode />
          ) : (
            <MotionShowreel onClose={() => setMode('send')} />
          )}
        </main>
        
        {/* Footer */}
        <footer className="py-4 text-center text-xs font-bold text-[var(--lego-muted)] uppercase tracking-widest transition-colors duration-300">
          <p>
            Crafted by <span className="text-[#0057A6] dark:text-[#FFD500] font-black">Aryan</span> • Zero Internet • 100% Optical Air-Gap
          </p>
        </footer>
      </div>
    </div>
  );
}
