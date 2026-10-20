import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  compressAndChunkFile, 
  compressAndChunkText, 
  createSampleImageFile, 
  createSampleAudioFile, 
  getSampleSecretText 
} from '../utils/dataUtils';
import { playAcousticChirp } from '../utils/acoustic';
import { 
  UploadCloud, 
  X, 
  RotateCcw, 
  Zap, 
  Music, 
  Image as ImageIcon, 
  Sparkles, 
  Waves, 
  FileText, 
  Clipboard, 
  Send, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX 
} from 'lucide-react';
import { cn } from '../utils/cn';

export default function SendMode() {
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState<string>('');
  const [activePayload, setActivePayload] = useState<{ type: 'file'; file: File } | { type: 'text'; text: string } | null>(null);

  const [chunks, setChunks] = useState<string[]>([]);
  const [qrUrls, setQrUrls] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [useFountain, setUseFountain] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAcousticChirpEnabled, setIsAcousticChirpEnabled] = useState(false);
  
  const [prepProgress, setPrepProgress] = useState(0);
  const [prepStatus, setPrepStatus] = useState('');
  const [fps, setFps] = useState(3); // Slower default for camera reliability

  const frameRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  const handleSelectedFile = (selectedFile: File) => {
    if (selectedFile.type.startsWith('audio') && selectedFile.size > 1024 * 1024 * 5) {
      alert("Audio file too large. Please keep it under 5MB for a reliable demo.");
      return;
    }
    setFile(selectedFile);
    setActivePayload({ type: 'file', file: selectedFile });
  };

  const handleBeamText = () => {
    if (!textInput.trim()) return;
    setActivePayload({ type: 'text', text: textInput.trim() });
  };

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText) {
        setTextInput(clipText);
      }
    } catch (err) {
      console.warn("Clipboard access denied:", err);
    }
  };

  const handleLoadSampleText = () => {
    const sample = getSampleSecretText();
    setTextInput(sample);
  };

  // Keyboard shortcut (Escape) to exit theater mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    let isCancelled = false;

    if (activePayload) {
      setPrepProgress(0);
      setPrepStatus('Initializing...');
      setChunks([]);
      setQrUrls([]);
      setIsTransmitting(false);

      (async () => {
        try {
          let generatedChunks: string[] = [];

          if (activePayload.type === 'file') {
            generatedChunks = await compressAndChunkFile(
              activePayload.file,
              (p, s) => {
                if (!isCancelled) {
                  setPrepProgress(Math.round(p * 0.65));
                  setPrepStatus(s);
                }
              },
              useFountain
            );
          } else {
            generatedChunks = await compressAndChunkText(
              activePayload.text,
              (p, s) => {
                if (!isCancelled) {
                  setPrepProgress(Math.round(p * 0.65));
                  setPrepStatus(s);
                }
              },
              useFountain
            );
          }

          if (isCancelled) return;
          setChunks(generatedChunks);
          setPrepStatus('Pre-rendering QR Frames...');

          // Pre-generate all QR frames for butter-smooth playback without GC jitter
          const urls: string[] = [];
          for (let i = 0; i < generatedChunks.length; i++) {
            if (isCancelled) return;
            const url = await QRCode.toDataURL(generatedChunks[i], {
              errorCorrectionLevel: 'H',
              margin: 2,
              width: 480, // High res for Theater mode clarity
              color: {
                dark: '#1A1A1A',
                light: '#FFFFFF',
              },
            });
            urls.push(url);
            setPrepProgress(65 + Math.round(((i + 1) / generatedChunks.length) * 35));
          }

          if (isCancelled) return;
          setQrUrls(urls);
          setCurrentChunkIndex(0);
          setPrepStatus('Ready to Transmit');
        } catch (err) {
          console.error("Preparation error:", err);
          setPrepStatus('Failed to prepare stream');
        }
      })();
    }

    return () => {
      isCancelled = true;
    };
  }, [activePayload, useFountain]);

  // Transmit loop using RAF for precise frame synchronization & acoustic chirps
  useEffect(() => {
    if (!isTransmitting || qrUrls.length === 0) return;

    const intervalMs = 1000 / fps;
    lastUpdateRef.current = performance.now();

    const updateLoop = (timestamp: number) => {
      if (timestamp - lastUpdateRef.current >= intervalMs) {
        setCurrentChunkIndex((prev) => {
          const nextIdx = (prev + 1) % qrUrls.length;
          // Dual-channel acoustic sync chirp
          if (isAcousticChirpEnabled) {
            playAcousticChirp(nextIdx, 0.12);
          }
          return nextIdx;
        });
        lastUpdateRef.current = timestamp;
      }
      frameRef.current = requestAnimationFrame(updateLoop);
    };

    frameRef.current = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [isTransmitting, qrUrls.length, fps, isAcousticChirpEnabled]);

  const qrDataUrl = qrUrls[currentChunkIndex] || '';

  const handleClear = () => {
    setFile(null);
    setTextInput('');
    setActivePayload(null);
    setChunks([]);
    setQrUrls([]);
    setIsTransmitting(false);
    setIsFullscreen(false);
  };

  return (
    <div className="flex flex-col items-center justify-start w-full max-w-2xl mx-auto py-2">
      {/* Fullscreen Across-The-Room Theater Mode Overlay */}
      {isFullscreen && qrUrls.length > 0 && (
        <div className="fixed inset-0 z-50 bg-[#0F0F0F] flex flex-col items-center justify-between p-4 sm:p-8 animate-in fade-in duration-200">
          {/* Top Theater Header */}
          <div className="w-full flex items-center justify-between text-white max-w-5xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-[#FFD500] text-[#2B2B2B] rounded-lg font-black text-xs uppercase tracking-wider">
                Across-The-Room Theater
              </span>
              <span className="text-xs font-bold text-slate-400 hidden sm:inline">
                Scannable from 10+ feet away
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAcousticChirpEnabled(!isAcousticChirpEnabled)}
                className={cn(
                  "px-3 py-1.5 rounded-xl border-2 text-xs font-black uppercase flex items-center gap-1.5 transition-all",
                  isAcousticChirpEnabled 
                    ? "bg-[#00A650] border-[#007036] text-white" 
                    : "bg-slate-800 border-slate-700 text-slate-400"
                )}
              >
                {isAcousticChirpEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                Sound Chirp
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-2 rounded-xl bg-slate-800 border-2 border-slate-700 text-white hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-xs font-black uppercase"
                title="Exit Theater Mode (Esc)"
              >
                <Minimize2 className="w-4 h-4" />
                Exit Fullscreen
              </button>
            </div>
          </div>

          {/* Centered Massive QR Container */}
          <div className="flex-1 flex items-center justify-center w-full max-w-[85vh] p-2">
            <div className="bg-white p-4 sm:p-6 rounded-3xl border-8 border-[#2B2B2B] shadow-[0_0_50px_rgba(255,255,255,0.15)] aspect-square w-full flex items-center justify-center">
              <img 
                src={qrDataUrl} 
                alt="Theater Mode QR" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {/* Bottom Floating Control HUD */}
          <div className="w-full max-w-xl bg-slate-900/90 border-2 border-slate-700 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-white shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsTransmitting(!isTransmitting)}
                className={cn(
                  "px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wide border-2 transition-all",
                  isTransmitting 
                    ? "bg-[#D01012] border-[#8C0000] text-white" 
                    : "bg-[#00A650] border-[#007036] text-white"
                )}
              >
                {isTransmitting ? 'Pause' : 'Play'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCurrentChunkIndex(0);
                  setIsTransmitting(true);
                }}
                className="p-2.5 rounded-xl bg-slate-800 border-2 border-slate-700 text-slate-300 hover:text-white"
                title="Restart loop"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono">
              <span className="text-xs text-slate-400 uppercase font-sans font-bold">Packet</span>
              <span className="text-xl font-black text-[#FFD500]">{currentChunkIndex + 1} / {qrUrls.length}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">{fps} FPS</span>
              <input
                type="range"
                min="1" max="10" step="1"
                value={fps}
                onChange={(e) => setFps(parseInt(e.target.value))}
                className="w-24 h-2 bg-slate-700 rounded-lg accent-[#00A650] cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {!activePayload ? (
        <div className="w-full flex flex-col items-center max-w-md">
          {/* Source Switcher (File vs Text) */}
          <div className="flex gap-2 p-1.5 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-2xl shadow-[4px_4px_0px_var(--lego-border)] mb-6 w-full">
            <button
              type="button"
              onClick={() => setTab('file')}
              className={cn(
                "flex-1 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border-2",
                tab === 'file'
                  ? "bg-[#0057A6] border-[#003B73] text-white shadow-sm"
                  : "bg-transparent border-transparent text-[var(--lego-muted)] hover:text-[var(--lego-text)]"
              )}
            >
              <UploadCloud className="w-4 h-4" />
              Photo / Audio
            </button>
            <button
              type="button"
              onClick={() => setTab('text')}
              className={cn(
                "flex-1 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all border-2",
                tab === 'text'
                  ? "bg-[#D01012] border-[#8C0000] text-white shadow-sm"
                  : "bg-transparent border-transparent text-[var(--lego-muted)] hover:text-[var(--lego-text)]"
              )}
            >
              <FileText className="w-4 h-4" />
              Text / Secret Note
            </button>
          </div>

          {tab === 'file' ? (
            /* File Upload Tab */
            <>
              <div 
                className={cn(
                  "w-full aspect-square bg-[var(--lego-card)] rounded-2xl border-4 shadow-[8px_8px_0px_var(--lego-border)] flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all group relative overflow-hidden",
                  isDragging 
                    ? "border-[#0057A6] bg-blue-50 dark:bg-blue-950/20 scale-102 shadow-[12px_12px_0px_#0057A6]" 
                    : "border-[var(--lego-border)] hover:-translate-y-1 hover:shadow-[10px_10px_0px_var(--lego-border)] active:translate-y-2 active:shadow-none"
                )}
                onClick={() => document.getElementById('file-upload')?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) handleSelectedFile(droppedFile);
                }}
              >
                <input 
                  id="file-upload" 
                  type="file" 
                  accept="image/*, audio/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleSelectedFile(selectedFile);
                  }} 
                />
                <div className={cn(
                  "p-6 rounded-full border-4 border-[var(--lego-border)] shadow-[4px_4px_0px_var(--lego-border)] mb-6 transition-transform duration-300",
                  isDragging ? "bg-[#0057A6] text-white rotate-12 scale-110" : "bg-[#FFD500] text-[#2B2B2B] group-hover:rotate-12"
                )}>
                  <UploadCloud className="w-10 h-10" strokeWidth={2.5} />
                </div>
                <h3 className="text-2xl font-black text-[var(--lego-text)] mb-2 uppercase">
                  {isDragging ? 'Drop File Here!' : 'Select File'}
                </h3>
                <p className="font-medium text-[var(--lego-muted)]">
                  Drop or pick a photo / short audio to beam across.
                </p>
              </div>

              {/* Quick Demo Sample Action Buttons */}
              <div className="w-full mt-6 flex flex-col items-center">
                <div className="flex items-center gap-2 mb-3 text-xs font-black text-[var(--lego-muted)] uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-[#FFD500]" />
                  Or Test With Instant Demo Media
                </div>
                <div className="grid grid-cols-2 gap-3 w-full">
                  <button
                    type="button"
                    onClick={async () => {
                      const sampleImg = await createSampleImageFile();
                      handleSelectedFile(sampleImg);
                    }}
                    className="p-3 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-xl font-black text-sm uppercase text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_var(--lego-border)] active:translate-y-1 active:shadow-none flex items-center justify-center gap-2 transition-all"
                  >
                    <ImageIcon className="w-4 h-4 text-[#D01012]" strokeWidth={2.5} />
                    Demo Photo
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const sampleAudio = await createSampleAudioFile();
                      handleSelectedFile(sampleAudio);
                    }}
                    className="p-3 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-xl font-black text-sm uppercase text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 hover:shadow-[5px_5px_0px_var(--lego-border)] active:translate-y-1 active:shadow-none flex items-center justify-center gap-2 transition-all"
                  >
                    <Music className="w-4 h-4 text-[#0057A6]" strokeWidth={2.5} />
                    Demo 8-Bit Chime
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Text Transfer Tab */
            <div className="w-full flex flex-col items-center">
              <div className="w-full bg-[var(--lego-card)] rounded-2xl border-4 border-[var(--lego-border)] shadow-[8px_8px_0px_var(--lego-border)] p-4 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black uppercase text-[var(--lego-text)] flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#D01012]" />
                    Secret Text / Note
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border-2 border-[var(--lego-border)] rounded-lg text-xs font-bold text-[var(--lego-text)] hover:bg-slate-200 transition-colors flex items-center gap-1"
                      title="Paste from clipboard"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      Paste
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadSampleText}
                      className="px-2.5 py-1 bg-yellow-400/20 border-2 border-yellow-500 rounded-lg text-xs font-bold text-yellow-800 dark:text-yellow-300 hover:bg-yellow-400/30 transition-colors flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Sample
                    </button>
                  </div>
                </div>

                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste or type secret note, link, BIP39 seed phrase, or code snippet to beam across..."
                  rows={6}
                  className="w-full p-3 bg-[var(--lego-bg)] border-2 border-[var(--lego-border)] rounded-xl font-mono text-sm text-[var(--lego-text)] resize-none outline-none focus:border-[#0057A6] transition-colors"
                />

                <div className="flex justify-between items-center mt-3 text-xs font-bold text-[var(--lego-muted)]">
                  <span>{textInput.length} chars • {textInput.trim() ? textInput.trim().split(/\s+/).length : 0} words</span>
                  {textInput && (
                    <button
                      type="button"
                      onClick={() => setTextInput('')}
                      className="text-[#D01012] hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleBeamText}
                  disabled={!textInput.trim()}
                  className="mt-4 py-3.5 px-6 rounded-xl bg-[#00A650] border-4 border-[#007036] text-white font-black text-base uppercase tracking-wide shadow-[4px_4px_0px_#007036] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  Beam Text via Light
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Transmitting Card */
        <div className="flex flex-col items-center w-full max-w-md">
          {/* LEGO Style Display Card */}
          <div className="relative w-full bg-[var(--lego-card)] rounded-2xl border-4 border-[var(--lego-border)] shadow-[8px_8px_0px_var(--lego-border)] p-4 flex flex-col items-center overflow-visible transition-colors duration-300">
            {/* Stud Decoration Header */}
            <div className="absolute -top-3 left-4 right-4 flex justify-around">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-6 h-4 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] border-b-0 rounded-t-md transition-colors duration-300" />
              ))}
            </div>

            {/* Protocol & Theater Bar */}
            <div className="w-full flex items-center justify-between mt-1 mb-2 px-1">
              <span className="text-xs font-black uppercase text-[var(--lego-muted)] tracking-wide flex items-center gap-1.5">
                {activePayload.type === 'text' ? (
                  <>
                    <FileText className="w-3.5 h-3.5 text-[#D01012]" />
                    Text Payload
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3.5 h-3.5 text-[#0057A6]" />
                    File Payload
                  </>
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAcousticChirpEnabled(!isAcousticChirpEnabled)}
                  className={cn(
                    "p-1.5 rounded-lg border-2 text-xs font-black transition-all",
                    isAcousticChirpEnabled 
                      ? "bg-[#00A650]/15 border-[#007036] text-[#007036]" 
                      : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400"
                  )}
                  title="Toggle Acoustic Sound Chirps (Dual-Channel Light + Audio)"
                >
                  {isAcousticChirpEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-[var(--lego-border)] text-[var(--lego-text)] hover:bg-slate-200 transition-colors"
                  title="Fullscreen Theater Mode (10+ feet across-the-room scanning)"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setUseFountain(!useFountain)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black uppercase transition-all border-2",
                    useFountain 
                      ? "bg-[#0057A6]/10 border-[#0057A6] text-[#0057A6]" 
                      : "bg-slate-200 border-slate-400 text-slate-700"
                  )}
                  title="Toggle Fountain Codes"
                >
                  <Waves className="w-3 h-3" />
                  {useFountain ? 'Fountain' : 'Loop'}
                </button>
              </div>
            </div>

            {/* QR Viewport */}
            <div className="relative bg-[var(--lego-bg)] rounded-xl border-4 border-[var(--lego-border)] flex items-center justify-center min-h-[320px] min-w-[320px] w-full aspect-square overflow-hidden shadow-inner transition-colors duration-300">
              {qrUrls.length > 0 && qrDataUrl ? (
                <img 
                  src={qrDataUrl} 
                  alt="QR Data Frame" 
                  className="w-full h-full object-contain select-none cursor-pointer"
                  onClick={() => setIsFullscreen(true)}
                  title="Click for Fullscreen Theater Mode"
                />
              ) : (
                <div className="w-full max-w-[240px] flex flex-col items-center text-[var(--lego-text)]">
                  <div className="w-12 h-12 border-8 border-slate-200 border-t-[#D01012] rounded-full animate-spin mb-6"></div>
                  <div className="font-black uppercase tracking-wide mb-3 text-center">{prepStatus}</div>
                  <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden border-2 border-[var(--lego-border)] shadow-inner">
                    <div 
                      className="h-full bg-[#00A650] transition-all duration-200 ease-out" 
                      style={{ width: `${prepProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[var(--lego-muted)] mt-2">{prepProgress}%</span>
                </div>
              )}
            </div>

            {/* Status indicator */}
            {qrUrls.length > 0 && (
              <div className="mt-4 w-full flex items-center justify-between bg-[var(--lego-bg)] border-2 border-[var(--lego-border)] p-2.5 rounded-lg transition-colors duration-300">
                <div className="flex items-center gap-2 font-bold text-[var(--lego-text)] px-1">
                  <span className={cn("w-3 h-3 rounded-full border-2 border-[var(--lego-border)]", isTransmitting ? "bg-[#D01012] animate-pulse" : "bg-slate-400")} />
                  <span className="text-sm font-black">{isTransmitting ? 'TRANSMITTING' : 'READY'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[var(--lego-muted)] uppercase">
                    {useFountain ? 'Packet' : 'Frame'}
                  </span>
                  <div className="font-black text-xl text-[#0057A6]">
                    {currentChunkIndex + 1} / {qrUrls.length}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Speed Controls */}
          {qrUrls.length > 0 && (
             <div className="w-full mt-6 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-xl p-4 shadow-[4px_4px_0px_var(--lego-border)] transition-colors duration-300">
                <div className="flex justify-between items-center mb-2">
                  <label className="font-black text-[var(--lego-text)] flex items-center gap-2 uppercase text-sm">
                     <Zap className="w-5 h-5 text-[#FFD500]" fill="#FFD500" strokeWidth={2} />
                     Speed
                  </label>
                  <span className="font-black text-[#0057A6]">{fps} FPS</span>
                </div>
                <input 
                  type="range" 
                  min="1" max="10" step="1" 
                  value={fps} 
                  onChange={(e) => setFps(parseInt(e.target.value))}
                  className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer outline-none border-2 border-[var(--lego-border)] accent-[#D01012]"
                />
                <div className="flex justify-between items-center text-xs font-bold text-[var(--lego-muted)] mt-2">
                  <span>1 FPS (Slow & Sure)</span>
                  <span>10 FPS (Turbo)</span>
                </div>
             </div>
          )}

          {/* Playback Action Buttons */}
          <div className="mt-6 flex flex-wrap justify-center gap-4 w-full">
            <button
              onClick={() => {
                if (!isTransmitting && currentChunkIndex !== 0) {
                  setCurrentChunkIndex(0);
                }
                setIsTransmitting(!isTransmitting);
              }}
              disabled={qrUrls.length === 0}
              className={cn(
                "px-8 py-3 rounded-xl text-lg font-bold transition-all border-4 flex items-center gap-2 uppercase tracking-wide flex-1 justify-center min-w-[180px]",
                isTransmitting 
                  ? "bg-[#D01012] border-[#8C0000] text-white shadow-none translate-y-1"
                  : "bg-[#00A650] border-[#007036] text-white shadow-[4px_4px_0px_#007036] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isTransmitting ? 'Stop' : 'Play'}
            </button>
            
            {qrUrls.length > 0 && (
              <button
                onClick={() => {
                  setCurrentChunkIndex(0);
                  setIsTransmitting(true);
                }}
                className="p-3 rounded-xl bg-[#FFD500] border-4 border-[#B29500] text-[#2B2B2B] shadow-[4px_4px_0px_#B29500] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center"
                title="Restart Loop"
              >
                <RotateCcw className="w-6 h-6" strokeWidth={2.5} />
              </button>
            )}

            <button
              onClick={handleClear}
              className="p-3 rounded-xl bg-[var(--lego-card)] border-4 border-[var(--lego-border)] text-[var(--lego-text)] shadow-[4px_4px_0px_var(--lego-border)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center"
              title="Clear & New Beam"
            >
              <X className="w-6 h-6" strokeWidth={3} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
