import { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { 
  reassembleAndDecompress, 
  reassembleFromFountainChunks, 
  base64ToArrayBuffer, 
  BYTE_CHUNK_SIZE 
} from '../utils/dataUtils';
import { FountainDecoder } from '../utils/fountain';
import { saveToVault } from '../utils/vault';
import { 
  Camera, 
  RefreshCw, 
  CheckCircle2, 
  Download, 
  AlertTriangle, 
  Zap, 
  Gauge, 
  Radio, 
  Clock, 
  Crosshair, 
  Copy, 
  Check, 
  FileText,
  Archive
} from 'lucide-react';
import { cn } from '../utils/cn';
import { motion } from 'motion/react';

// Scan throttling to keep mobile devices cool and responsive
const SCAN_INTERVAL_MS = 36; // ~28 FPS scan evaluation
const MAX_SCAN_DIM = 480;    // Bound processing canvas to 480px max for instant jsQR processing

interface ARCorner {
  x: number;
  y: number;
}

interface ARTarget {
  topLeft: ARCorner;
  topRight: ARCorner;
  bottomRight: ARCorner;
  bottomLeft: ARCorner;
  timestamp: number;
}

export default function ReceiveMode() {
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  
  // Storage for legacy mode & fountain mode
  const [chunks, setChunks] = useState<Record<number, string>>({});
  const [solvedFountainIndices, setSolvedFountainIndices] = useState<Set<number>>(new Set());
  const [totalExpected, setTotalExpected] = useState<number>(0);
  const [dataType, setDataType] = useState<'image' | 'audio' | 'text'>('image');
  const [isFountainMode, setIsFountainMode] = useState<boolean>(true);
  
  const [resultData, setResultData] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  
  // AR Viewfinder Tracking
  const [arTarget, setArTarget] = useState<ARTarget | null>(null);
  
  // Telemetry HUD State
  const [kbPerSec, setKbPerSec] = useState<number>(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [scannedFps, setScannedFps] = useState<number>(0);
  const [usefulPacketsCount, setUsefulPacketsCount] = useState<number>(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const lastScanTimeRef = useRef<number>(0);
  const fpsCounterRef = useRef<{ frames: number; lastTime: number }>({ frames: 0, lastTime: 0 });

  // Fountain Decoder Ref
  const fountainDecoderRef = useRef<FountainDecoder | null>(null);
  const origCompressedLengthRef = useRef<number>(0);
  
  // Telemetry tracking refs
  const transferStartTimeRef = useRef<number>(0);
  const totalBytesReceivedRef = useRef<number>(0);

  // Resolved count calculation
  const collectedCount = isFountainMode 
    ? solvedFountainIndices.size 
    : Object.keys(chunks).length;

  const startCamera = async () => {
    setDecodeError(null);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available. HTTPS is required on mobile browsers.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', 
          width: { ideal: 720 }, 
          height: { ideal: 720 } 
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setHasCamera(true);
        setIsScanning(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setHasCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsScanning(false);
      setArTarget(null);
    }
  };

  const handleCopyText = async () => {
    if (!resultData) return;
    try {
      await navigator.clipboard.writeText(resultData);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (err) {
      console.warn("Copy to clipboard failed:", err);
    }
  };

  // Reassembly Trigger for Legacy Mode
  useEffect(() => {
    if (!isFountainMode && totalExpected > 0 && collectedCount === totalExpected && !resultData && !decodeError) {
      const sortedChunks: string[] = [];
      for (let i = 0; i < totalExpected; i++) {
        sortedChunks.push(chunks[i]);
      }
      try {
        const decoded = reassembleAndDecompress(sortedChunks, dataType);
        setResultData(decoded);
        setDecodeError(null);
        stopCamera();
        saveToVault({ type: dataType, data: decoded }).catch(e => console.warn("Auto-vault save error:", e));
        
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([40, 60, 40]); } catch (_) {}
        }
      } catch (err: any) {
        console.error("Failed to decode:", err);
        setDecodeError(err?.message || "Reconstruction failed. Data may have been incomplete.");
        stopCamera();
      }
    }
  }, [chunks, totalExpected, collectedCount, resultData, decodeError, dataType, isFountainMode]);

  // Main Scanning & AR Tracking Loop
  useEffect(() => {
    const tick = () => {
      if (isScanning && videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const now = performance.now();

        // Calculate actual FPS
        fpsCounterRef.current.frames++;
        if (now - fpsCounterRef.current.lastTime >= 1000) {
          setScannedFps(fpsCounterRef.current.frames);
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastTime = now;
        }

        // Throttle scans to avoid freezing mobile CPUs
        if (now - lastScanTimeRef.current >= SCAN_INTERVAL_MS) {
          lastScanTimeRef.current = now;

          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          
          if (ctx) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            let targetW = vw;
            let targetH = vh;

            if (vw > MAX_SCAN_DIM || vh > MAX_SCAN_DIM) {
              if (vw >= vh) {
                targetW = MAX_SCAN_DIM;
                targetH = Math.round((vh / vw) * MAX_SCAN_DIM);
              } else {
                targetH = MAX_SCAN_DIM;
                targetW = Math.round((vw / vh) * MAX_SCAN_DIM);
              }
            }

            if (canvas.width !== targetW || canvas.height !== targetH) {
              canvas.width = targetW;
              canvas.height = targetH;
            }

            ctx.drawImage(video, 0, 0, targetW, targetH);
            
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });

            if (code && code.data) {
              // Update AR Tracking Reticle (normalized to 0-100% of container)
              setArTarget({
                topLeft: { x: (code.location.topLeftCorner.x / targetW) * 100, y: (code.location.topLeftCorner.y / targetH) * 100 },
                topRight: { x: (code.location.topRightCorner.x / targetW) * 100, y: (code.location.topRightCorner.y / targetH) * 100 },
                bottomRight: { x: (code.location.bottomRightCorner.x / targetW) * 100, y: (code.location.bottomRightCorner.y / targetH) * 100 },
                bottomLeft: { x: (code.location.bottomLeftCorner.x / targetW) * 100, y: (code.location.bottomLeftCorner.y / targetH) * 100 },
                timestamp: now,
              });

              // Telemetry initialization
              if (transferStartTimeRef.current === 0) {
                transferStartTimeRef.current = now;
              }
              totalBytesReceivedRef.current += code.data.length;

              const elapsedSec = (now - transferStartTimeRef.current) / 1000;
              if (elapsedSec > 0.3) {
                const currentKbps = (totalBytesReceivedRef.current / 1024) / elapsedSec;
                setKbPerSec(parseFloat(currentKbps.toFixed(1)));
              }

              // Parse Code Payload
              const parts = code.data.split('|');

              if (parts[0] === 'f' && parts.length >= 6) {
                // FOUNTAIN CODE PACKET: f|seed|totalK|origLen|type|payload
                setIsFountainMode(true);
                const seed = parseInt(parts[1], 10);
                const totalK = parseInt(parts[2], 10);
                const origLen = parseInt(parts[3], 10);
                const typeChar = parts[4];
                const base64Data = parts[5];

                if (!isNaN(seed) && !isNaN(totalK) && !isNaN(origLen)) {
                  const resolvedType: 'image' | 'audio' | 'text' = 
                    typeChar === 'a' ? 'audio' : typeChar === 't' ? 'text' : 'image';

                  // Initialize decoder if needed
                  if (!fountainDecoderRef.current || fountainDecoderRef.current.totalChunks !== totalK) {
                    fountainDecoderRef.current = new FountainDecoder(totalK, BYTE_CHUNK_SIZE);
                    setTotalExpected(totalK);
                    setDataType(resolvedType);
                    origCompressedLengthRef.current = origLen;
                  }

                  const rawBuffer = base64ToArrayBuffer(base64Data);
                  const packetBytes = new Uint8Array(rawBuffer);

                  const madeProgress = fountainDecoderRef.current.addPacket(seed, packetBytes);
                  if (madeProgress) {
                    setUsefulPacketsCount(prev => prev + 1);

                    // Update solved indices set
                    const solvedIndices = new Set(fountainDecoderRef.current.solvedChunks.keys());
                    setSolvedFountainIndices(solvedIndices);

                    // Haptic tick
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                      try { navigator.vibrate(20); } catch (_) {}
                    }

                    // Calculate ETA
                    const remaining = totalK - solvedIndices.size;
                    const elapsed = (now - transferStartTimeRef.current) / 1000;
                    if (solvedIndices.size > 1 && elapsed > 0) {
                      const chunksPerSec = solvedIndices.size / elapsed;
                      setEtaSeconds(Math.max(1, Math.round(remaining / chunksPerSec)));
                    }

                    // Check if complete
                    if (fountainDecoderRef.current.isComplete()) {
                      const solvedChunks = fountainDecoderRef.current.getResolvedChunks()!;
                      try {
                        const decoded = reassembleFromFountainChunks(
                          solvedChunks, 
                          origCompressedLengthRef.current, 
                          resolvedType
                        );
                        setResultData(decoded);
                        setDecodeError(null);
                        stopCamera();
                        saveToVault({ type: resolvedType, data: decoded }).catch(e => console.warn("Auto-vault save error:", e));

                        if (typeof navigator !== 'undefined' && navigator.vibrate) {
                          try { navigator.vibrate([40, 60, 40]); } catch (_) {}
                        }
                      } catch (err: any) {
                        console.error("Fountain assembly failed:", err);
                        setDecodeError(err?.message || "Fountain decoding failed.");
                        stopCamera();
                      }
                    }
                  }
                }
              } else if (parts.length >= 4) {
                // LEGACY FIXED CAROUSEL: index|total|type|base64
                setIsFountainMode(false);
                const index = parseInt(parts[0], 10);
                const total = parseInt(parts[1], 10);
                const typeChar = parts[2];
                const data = code.data.substring(parts[0].length + parts[1].length + parts[2].length + 3);

                if (!isNaN(index) && !isNaN(total)) {
                  const resolvedType: 'image' | 'audio' | 'text' = 
                    typeChar === 'a' ? 'audio' : typeChar === 't' ? 'text' : 'image';

                  if (totalExpected === 0) {
                    setTotalExpected(total);
                    setDataType(resolvedType);
                  }
                  setChunks(prev => {
                    if (prev[index]) return prev;
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                      try { navigator.vibrate(20); } catch (_) {}
                    }
                    return { ...prev, [index]: data };
                  });
                }
              }
            } else {
              // Fade out AR target if no code seen for > 300ms
              if (arTarget && now - arTarget.timestamp > 300) {
                setArTarget(null);
              }
            }
          }
        }
      }

      requestRef.current = requestAnimationFrame(tick);
    };

    if (isScanning && !resultData && !decodeError) {
      requestRef.current = requestAnimationFrame(tick);
    }
    
    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [isScanning, totalExpected, resultData, decodeError, arTarget, dataType, isFountainMode]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleReset = () => {
    setChunks({});
    setSolvedFountainIndices(new Set());
    fountainDecoderRef.current = null;
    setTotalExpected(0);
    setResultData(null);
    setDecodeError(null);
    setArTarget(null);
    setKbPerSec(0);
    setEtaSeconds(null);
    setUsefulPacketsCount(0);
    transferStartTimeRef.current = 0;
    totalBytesReceivedRef.current = 0;
    setCopiedText(false);
    startCamera();
  };

  // Helper to create download URL for text or media
  const getDownloadHref = (): string => {
    if (!resultData) return '';
    if (dataType === 'text') {
      const blob = new Blob([resultData], { type: 'text/plain;charset=utf-8' });
      return URL.createObjectURL(blob);
    }
    return resultData;
  };

  return (
    <div className="flex flex-col items-center justify-start w-full max-w-2xl mx-auto py-2">
      
      {decodeError ? (
        /* Error State */
        <motion.div 
          className="w-full max-w-md bg-[var(--lego-card)] border-4 border-[#D01012] rounded-2xl p-6 shadow-[8px_8px_0px_#D01012] flex flex-col items-center text-center transition-colors duration-300"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="bg-[#D01012] p-4 rounded-full border-4 border-[var(--lego-border)] shadow-[4px_4px_0px_var(--lego-border)] mb-4 text-white">
            <AlertTriangle className="w-10 h-10" strokeWidth={2.5} />
          </div>
          <h3 className="text-2xl font-black text-[#D01012] uppercase mb-2">Rebuild Failed</h3>
          <p className="font-bold text-[var(--lego-muted)] mb-6 text-sm">
            {decodeError}
          </p>
          <button
            onClick={handleReset}
            className="px-8 py-3 rounded-xl bg-[#0057A6] border-4 border-[#003B73] text-white font-black uppercase text-sm shadow-[4px_4px_0px_#003B73] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={3} />
            Scan Again
          </button>
        </motion.div>
      ) : !resultData ? (
        <div className="w-full relative flex flex-col items-center">
          
          {/* Telemetry Speedometer HUD */}
          {isScanning && (
            <div className="w-full max-w-md mb-4 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-2xl p-3 shadow-[6px_6px_0px_var(--lego-border)] flex items-center justify-between transition-colors duration-300">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-400/20 text-[#2B2B2B] dark:text-yellow-400 rounded-lg text-xs font-black">
                <Gauge className="w-4 h-4 text-[#D01012]" />
                <span>{kbPerSec > 0 ? `${kbPerSec} KB/s` : 'SYNCING'}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-[#0057A6] rounded-lg text-xs font-black">
                <Radio className="w-4 h-4" />
                <span>{scannedFps} FPS</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-[#00A650] rounded-lg text-xs font-black">
                <Clock className="w-4 h-4" />
                <span>{etaSeconds !== null ? `~${etaSeconds}s ETA` : 'CALC...'}</span>
              </div>
              <div className="hidden sm:flex items-center px-2 py-1 bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded-lg text-xs font-black">
                <span>{isFountainMode ? 'FOUNTAIN' : 'CAROUSEL'}</span>
              </div>
            </div>
          )}

          {/* Camera Viewfinder with AR Overlay */}
          <div className="relative w-full max-w-md aspect-square rounded-2xl overflow-hidden bg-[#2B2B2B] border-[12px] border-[#0057A6] shadow-[8px_8px_0px_var(--lego-border)] flex items-center justify-center transition-shadow duration-300">
            {hasCamera === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-[var(--lego-bg)]">
                <Camera className="w-16 h-16 text-[#D01012] mb-3" strokeWidth={2.5} />
                <p className="text-[#D01012] font-black uppercase text-xl">Camera Blocked</p>
                <p className="font-bold text-[var(--lego-muted)] mt-2 text-sm max-w-xs">
                  {!window.isSecureContext 
                    ? "Camera access requires HTTPS on mobile. Use https:// in the address bar." 
                    : "Please allow camera permissions in your browser settings."}
                </p>
                <button
                  onClick={startCamera}
                  className="mt-4 px-6 py-2 rounded-xl bg-[#0057A6] border-2 border-[#003B73] text-white font-black text-sm uppercase tracking-wide shadow-[3px_3px_0px_#003B73] hover:-translate-y-0.5 active:translate-y-1 active:shadow-none transition-all"
                >
                  Try Again
                </button>
              </div>
            )}
            
            <video 
              ref={videoRef} 
              className={cn("w-full h-full object-cover", !isScanning && "hidden")}
              muted playsInline
            />
            
            {/* AR Target Reticle Overlay */}
            {isScanning && (
              <div className="absolute inset-0 pointer-events-none z-10">
                {!arTarget ? (
                  <div className="relative w-full h-full">
                    {/* Corner Guides */}
                    <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-[#FFD500]/60 rounded-tl-lg" />
                    <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-[#FFD500]/60 rounded-tr-lg" />
                    <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-[#FFD500]/60 rounded-bl-lg" />
                    <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-[#FFD500]/60 rounded-br-lg" />
                    
                    {/* Animated Scanning Laser Line */}
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-[#00A650] to-transparent shadow-[0_0_12px_#00A650] animate-bounce opacity-80" />
                    
                    <div className="absolute inset-0 flex items-center justify-center opacity-30">
                      <Crosshair className="w-16 h-16 text-white stroke-1" />
                    </div>
                  </div>
                ) : (
                  /* AR Locked Target Box */
                  <svg className="w-full h-full absolute inset-0">
                    <polygon
                      points={`
                        ${arTarget.topLeft.x}%,${arTarget.topLeft.y}% 
                        ${arTarget.topRight.x}%,${arTarget.topRight.y}% 
                        ${arTarget.bottomRight.x}%,${arTarget.bottomRight.y}% 
                        ${arTarget.bottomLeft.x}%,${arTarget.bottomLeft.y}%
                      `}
                      fill="rgba(0, 166, 80, 0.25)"
                      stroke="#00A650"
                      strokeWidth="4"
                      strokeDasharray="6 4"
                    />
                    {/* Target Corner Nodes */}
                    <circle cx={`${arTarget.topLeft.x}%`} cy={`${arTarget.topLeft.y}%`} r="6" fill="#FFD500" stroke="#2B2B2B" strokeWidth="2" />
                    <circle cx={`${arTarget.topRight.x}%`} cy={`${arTarget.topRight.y}%`} r="6" fill="#FFD500" stroke="#2B2B2B" strokeWidth="2" />
                    <circle cx={`${arTarget.bottomRight.x}%`} cy={`${arTarget.bottomRight.y}%`} r="6" fill="#FFD500" stroke="#2B2B2B" strokeWidth="2" />
                    <circle cx={`${arTarget.bottomLeft.x}%`} cy={`${arTarget.bottomLeft.y}%`} r="6" fill="#FFD500" stroke="#2B2B2B" strokeWidth="2" />
                  </svg>
                )}
              </div>
            )}

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} className="hidden" />

            {!isScanning && hasCamera !== false && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--lego-bg)] z-10 transition-colors duration-300">
                <button
                  onClick={startCamera}
                  className="px-8 py-4 rounded-xl bg-[#00A650] border-4 border-[#007036] text-white font-black text-xl hover:-translate-y-1 shadow-[4px_4px_0px_#007036] hover:shadow-[6px_6px_0px_#007036] active:translate-y-1 active:shadow-none transition-all flex items-center gap-3 uppercase tracking-wide"
                >
                  <Camera className="w-8 h-8" strokeWidth={3} />
                  Start Scanner
                </button>
              </div>
            )}
          </div>

          {/* Progress Indicators & Lego Block Visualizer */}
          {isScanning && (
            <div className="mt-6 w-full max-w-md bg-[var(--lego-card)] border-4 border-[var(--lego-border)] rounded-2xl p-6 shadow-[8px_8px_0px_var(--lego-border)] transition-colors duration-300">
              <div className="flex justify-between items-center mb-4">
                <span className="font-black text-[var(--lego-text)] uppercase text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#FFD500]" fill="#FFD500" />
                  Building {dataType === 'audio' ? 'Audio' : dataType === 'text' ? 'Secret Note' : 'Photo'}
                </span>
                <span className="font-black text-[#0057A6] text-base">
                  {totalExpected > 0 ? `${collectedCount} / ${totalExpected}` : 'POINT AT TRANSMITTER'}
                </span>
              </div>
              
              {/* Chunk visualizer grid (LEGO blocks style) */}
              <div className="w-full flex flex-wrap gap-1.5 p-3 bg-[var(--lego-bg)] border-2 border-[var(--lego-border)] rounded-xl min-h-[64px] content-start transition-colors duration-300">
                {totalExpected > 0 ? (
                  Array.from({ length: totalExpected }).map((_, i) => {
                    const isSolved = isFountainMode 
                      ? solvedFountainIndices.has(i) 
                      : Boolean(chunks[i]);
                    return (
                      <motion.div 
                        key={i} 
                        initial={{ scale: 0 }}
                        animate={{ 
                          scale: isSolved ? 1 : 0.7,
                          backgroundColor: isSolved ? '#FFD500' : 'rgba(0,0,0,0.08)'
                        }}
                        className={cn(
                          "w-4 h-4 rounded-sm border-2 transition-all",
                          isSolved ? "border-[#B29500] shadow-sm" : "border-dashed border-slate-300 dark:border-slate-700"
                        )}
                      />
                    );
                  })
                ) : (
                  <div className="w-full text-center text-sm font-bold text-[var(--lego-muted)] uppercase py-2">
                    Point camera at transmitting screen
                  </div>
                )}
              </div>

              {isFountainMode && totalExpected > 0 && (
                <div className="mt-3 flex items-center justify-between text-xs font-bold text-[var(--lego-muted)]">
                  <span>⛲ Rateless Fountain</span>
                  <span>{usefulPacketsCount} packets solved</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Reveal Animation State */
        <motion.div 
          className="w-full flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
        >
          <div className="relative w-full max-w-md p-4 rounded-2xl bg-[var(--lego-card)] border-4 border-[var(--lego-border)] shadow-[10px_10px_0px_var(--lego-border)] mb-10 flex flex-col items-center transition-colors duration-300">
            {/* Stud Decoration Header */}
            <div className="absolute -top-3 left-4 right-4 flex justify-around">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-6 h-4 bg-[var(--lego-card)] border-4 border-[var(--lego-border)] border-b-0 rounded-t-md transition-colors duration-300" />
              ))}
            </div>

            {/* Reconstructed Content Box */}
            <div className="relative rounded-xl overflow-hidden bg-[var(--lego-bg)] border-4 border-[var(--lego-border)] w-full p-2 mt-2 transition-colors duration-300 flex items-center justify-center min-h-[220px]">
              {dataType === 'audio' ? (
                <div className="flex flex-col items-center justify-center p-8 bg-[#FFD500] rounded-lg w-full">
                  <audio src={resultData} controls autoPlay className="w-full max-w-xs outline-none" />
                </div>
              ) : dataType === 'text' ? (
                /* Terminal style text card */
                <div className="w-full flex flex-col p-4 bg-[#1E1E1E] text-green-400 font-mono text-sm rounded-xl max-h-[340px] overflow-y-auto border-2 border-[var(--lego-border)]">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-green-800 text-xs text-green-500 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Optical Text Beam
                    </span>
                    <span>{resultData?.length || 0} characters</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs sm:text-sm select-all leading-relaxed">
                    {resultData}
                  </pre>
                </div>
              ) : (
                <img 
                  src={resultData} 
                  alt="Received air-gapped data" 
                  className="w-full h-auto max-h-[360px] object-contain rounded-lg"
                />
              )}
            </div>
            
            {/* Success Badge */}
            <motion.div 
              className="absolute -bottom-6 bg-[#00A650] border-4 border-[#007036] text-white px-6 py-3 rounded-xl shadow-[4px_4px_0px_#007036] flex items-center gap-2 font-black uppercase tracking-wide text-lg"
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: -5 }}
              transition={{ delay: 0.3, type: 'spring', bounce: 0.6 }}
            >
              <CheckCircle2 className="w-6 h-6" strokeWidth={3} />
              Reconstructed!
            </motion.div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#00A650]/15 text-[#007036] dark:text-[#00A650] border border-[#007036] rounded-full text-xs font-black uppercase mb-4">
            <Archive className="w-3.5 h-3.5" />
            Saved to Air-Gap Vault
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
            {dataType === 'text' ? (
              <button
                type="button"
                onClick={handleCopyText}
                className="px-6 py-3 rounded-xl bg-[#00A650] border-4 border-[#007036] text-white shadow-[4px_4px_0px_#007036] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#007036] active:translate-y-1 active:shadow-none transition-all flex items-center gap-2 uppercase font-black tracking-wide text-base flex-1 justify-center min-w-[150px]"
              >
                {copiedText ? (
                  <>
                    <Check className="w-5 h-5" strokeWidth={3} />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" strokeWidth={3} />
                    Copy Text
                  </>
                )}
              </button>
            ) : null}

            <a
              href={getDownloadHref()}
              download={
                dataType === 'audio' 
                  ? 'qrmesh-audio.wav' 
                  : dataType === 'text' 
                  ? 'qrmesh-secret-note.txt' 
                  : 'qrmesh-photo.jpg'
              }
              className="px-5 py-3 rounded-xl bg-[#FFD500] border-4 border-[#B29500] text-[#2B2B2B] shadow-[4px_4px_0px_#B29500] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#B29500] active:translate-y-1 active:shadow-none transition-all flex items-center gap-2 uppercase font-black tracking-wide text-base flex-1 justify-center min-w-[140px]"
            >
              <Download className="w-5 h-5" strokeWidth={3} />
              Save {dataType === 'audio' ? 'Audio' : dataType === 'text' ? '.txt' : 'Photo'}
            </a>

            <button
              onClick={handleReset}
              className="px-5 py-3 rounded-xl bg-[#0057A6] border-4 border-[#003B73] text-white shadow-[4px_4px_0px_#003B73] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#003B73] active:translate-y-1 active:shadow-none transition-all flex items-center gap-2 uppercase font-black tracking-wide text-base flex-1 justify-center min-w-[140px]"
            >
              <RefreshCw className="w-5 h-5" strokeWidth={3} />
              Scan Another
            </button>
          </div>
        </motion.div>
      )}
      
    </div>
  );
}
