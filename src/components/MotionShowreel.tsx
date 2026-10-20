import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { cn } from '../utils/cn';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Radio, 
  WifiOff, 
  ShieldCheck, 
  Sparkles, 
  Cpu, 
  Scan, 
  Archive, 
  ExternalLink,
  Smartphone,
  Monitor,
  Flame,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { 
  playRelayClick, 
  playSubBassDrop, 
  playDataChirp, 
  playLaserSweep, 
  playSuccessChime 
} from '../utils/showreelAudio';

interface MotionShowreelProps {
  onClose?: () => void;
}

export default function MotionShowreel({ onClose }: MotionShowreelProps) {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [format, setFormat] = useState<'vertical' | 'landscape'>('vertical');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dynamic QR demo frame cache
  const [qrCodeDataUrls, setQrCodeDataUrls] = useState<string[]>([]);
  const [activeQrIndex, setActiveQrIndex] = useState(0);

  // Telemetry simulation state
  const [fountainProgress, setFountainProgress] = useState(0);
  const [decryptedText, setDecryptedText] = useState('');
  const [isNuked, setIsNuked] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const lastChirpTimeRef = useRef<number>(0);
  const hasTriggeredChimeRef = useRef<boolean>(false);
  const hasTriggeredBassScene1Ref = useRef<boolean>(false);
  const hasTriggeredBassScene2Ref = useRef<boolean>(false);
  const hasTriggeredBassScene4Ref = useRef<boolean>(false);
  const hasTriggeredBassScene5Ref = useRef<boolean>(false);

  const TOTAL_DURATION = 20.0; // 20 seconds standard brag duration

  // Generate a set of realistic fountain code QR frames
  useEffect(() => {
    async function generateSampleQRs() {
      const urls: string[] = [];
      const samples = [
        'QRMESH:LT:SEED=101:DEG=1:K=48:CHUNK=7f8b9a2c',
        'QRMESH:LT:SEED=102:DEG=2:K=48:CHUNK=3d1e4a90',
        'QRMESH:LT:SEED=103:DEG=3:K=48:CHUNK=8c4b12e7',
        'QRMESH:LT:SEED=104:DEG=1:K=48:CHUNK=99a34bc2',
        'QRMESH:LT:SEED=105:DEG=4:K=48:CHUNK=11df77aa',
        'QRMESH:LT:SEED=106:DEG=2:K=48:CHUNK=e320aa54'
      ];

      for (const text of samples) {
        try {
          const url = await QRCode.toDataURL(text, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 320,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          urls.push(url);
        } catch (e) {
          console.error(e);
        }
      }
      setQrCodeDataUrls(urls);
    }
    generateSampleQRs();
  }, []);

  // Main animation timer loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimestampRef.current = null;
      return;
    }

    const updatePlayhead = (now: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = now;
      }
      const delta = (now - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= TOTAL_DURATION) {
          setIsPlaying(false);
          return TOTAL_DURATION;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    animFrameRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying]);

  // Audio cues and telemetry synchronization based on currentTime
  useEffect(() => {
    const t = currentTime;

    // Cycle QR code frames during scene 2 & 3
    if (t >= 3.2 && t <= 12.5 && qrCodeDataUrls.length > 0) {
      const idx = Math.floor((t * 6) % qrCodeDataUrls.length);
      setActiveQrIndex(idx);

      // Acoustic staccato data chirps
      if (!isMuted && t - lastChirpTimeRef.current > 0.16) {
        playDataChirp(Math.floor(t * 10), 0.12);
        lastChirpTimeRef.current = t;
      }
    }

    // Scene 1 Sub Drop
    if (t >= 0.1 && t <= 0.4 && !hasTriggeredBassScene1Ref.current) {
      if (!isMuted) {
        playRelayClick(0.3);
        playSubBassDrop(0.25);
      }
      hasTriggeredBassScene1Ref.current = true;
    }

    // Scene 2 Optical Beam Sub Drop
    if (t >= 3.3 && t <= 3.6 && !hasTriggeredBassScene2Ref.current) {
      if (!isMuted) {
        playSubBassDrop(0.35);
        playLaserSweep(0.2);
      }
      hasTriggeredBassScene2Ref.current = true;
    }

    // Scene 4 Peeling Decoder progress
    if (t >= 12.5 && t <= 16.8) {
      const progress = Math.min(100, Math.floor(((t - 12.5) / 3.0) * 100));
      setFountainProgress(progress);

      if (progress > 50 && !decryptedText) {
        setDecryptedText("air-gap protocol bypass: confidential seed phrase verified 🔒");
      }

      if (progress >= 100 && !hasTriggeredChimeRef.current) {
        if (!isMuted) playSuccessChime(0.3);
        hasTriggeredChimeRef.current = true;
      }
    }

    // Scene 4 Nuke Vault trigger at 15.8s
    if (t >= 15.6 && t <= 16.6) {
      setIsNuked(true);
      if (!hasTriggeredBassScene4Ref.current) {
        if (!isMuted) playRelayClick(0.35);
        hasTriggeredBassScene4Ref.current = true;
      }
    } else if (t < 15.6) {
      setIsNuked(false);
    }

    // Scene 5 Brand resolve at 16.8s
    if (t >= 16.9 && !hasTriggeredBassScene5Ref.current) {
      if (!isMuted) {
        playSubBassDrop(0.4);
      }
      hasTriggeredBassScene5Ref.current = true;
    }
  }, [currentTime, qrCodeDataUrls, isMuted, decryptedText]);

  const handleRestart = () => {
    setCurrentTime(0);
    setIsPlaying(true);
    hasTriggeredChimeRef.current = false;
    hasTriggeredBassScene1Ref.current = false;
    hasTriggeredBassScene2Ref.current = false;
    hasTriggeredBassScene4Ref.current = false;
    hasTriggeredBassScene5Ref.current = false;
    setDecryptedText('');
    setIsNuked(false);
    setFountainProgress(0);
    lastTimestampRef.current = null;
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    lastTimestampRef.current = null;
    if (time < 12.5) {
      hasTriggeredChimeRef.current = false;
      setDecryptedText('');
      setFountainProgress(0);
    }
    if (time < 15.6) {
      setIsNuked(false);
    }
  };

  // Determine current active scene
  let currentScene = 1;
  if (currentTime < 3.5) currentScene = 1;
  else if (currentTime < 8.0) currentScene = 2;
  else if (currentTime < 12.5) currentScene = 3;
  else if (currentTime < 16.8) currentScene = 4;
  else currentScene = 5;

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full max-w-5xl mx-auto flex flex-col items-center justify-center p-3 sm:p-5 select-none",
        isFullscreen ? "fixed inset-0 z-[100] max-w-none bg-black/95 p-4" : ""
      )}
    >
      {/* Top Bar with Format Toggle & Controls */}
      <div className="w-full flex items-center justify-between gap-3 mb-3 bg-[#1e1e1e] border-3 border-[#333] shadow-[4px_4px_0px_#111] p-3 rounded-2xl text-white">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#E3000B] animate-pulse" />
          <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#FFD500]">
            QRMesh Launch Showreel
          </span>
          <span className="hidden sm:inline-block px-2 py-0.5 bg-[#333] rounded text-[10px] font-mono text-[#aaa]">
            /brag vertical • 20s
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Format Selector */}
          <div className="flex bg-[#2a2a2a] p-1 rounded-xl border border-[#444]">
            <button
              onClick={() => setFormat('vertical')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                format === 'vertical' ? "bg-[#0057A6] text-white shadow-sm" : "text-[#888] hover:text-white"
              )}
              title="Vertical (9:16 mobile reel)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reel (9:16)</span>
            </button>
            <button
              onClick={() => setFormat('landscape')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                format === 'landscape' ? "bg-[#0057A6] text-white shadow-sm" : "text-[#888] hover:text-white"
              )}
              title="Landscape (16:9 cinematic widescreen)"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cinema (16:9)</span>
            </button>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] rounded-xl text-white transition-all"
            title={isMuted ? "Enable Sound" : "Mute Sound"}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-[#00A650]" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 bg-[#2a2a2a] hover:bg-[#333] border border-[#444] rounded-xl text-white transition-all"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-[#E3000B] hover:bg-red-700 text-white font-black text-xs uppercase rounded-xl transition-all"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* Main Video Viewport Canvas */}
      <div 
        className={cn(
          "relative overflow-hidden bg-[#0d0d0d] border-4 border-[#2B2B2B] shadow-[8px_8px_0px_#1a1a1a] rounded-3xl transition-all duration-300 flex items-center justify-center",
          format === 'vertical' 
            ? "w-[360px] sm:w-[390px] h-[640px] sm:h-[690px]" 
            : "w-full aspect-video max-w-[850px] min-h-[440px]"
        )}
      >
        {/* Lego Stud Grid Texture Background */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 10px 10px, rgba(255,255,255,0.2) 2px, transparent 2px)`,
            backgroundSize: '20px 20px',
          }}
        />

        {/* Ambient Glow Aura */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0057A6]/10 to-[#FFD500]/10 pointer-events-none" />

        {/* ======================================================== */}
        {/* SCENE 1: The Threat & The Air-Gap Hook (0.0s - 3.5s) */}
        {/* ======================================================== */}
        <AnimatePresence>
          {currentScene === 1 && (
            <motion.div 
              key="scene-1"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 p-6 flex flex-col items-center justify-between text-center z-10"
            >
              {/* Top Security Status Bar */}
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-1.5 px-3 py-1 bg-[#222] border-2 border-[#444] rounded-lg text-[10px] font-mono font-bold text-red-400">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>AIRPLANE MODE: ON</span>
                </div>
                <div className="flex items-center gap-1 px-3 py-1 bg-[#00A650]/20 border-2 border-[#00A650] rounded-lg text-[10px] font-mono font-bold text-[#00A650]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>AIR-GAP VERIFIED</span>
                </div>
              </motion.div>

              {/* Center Kinetic Typography */}
              <div className="my-auto flex flex-col items-center">
                <motion.div 
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: -2 }}
                  transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.15 }}
                  className="bg-[#E3000B] text-white px-5 py-2 rounded-2xl border-4 border-black shadow-[5px_5px_0px_#000] mb-4 text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  ZERO WI-FI • ZERO BLUETOOTH
                </motion.div>

                <motion.h2 
                  initial={{ y: 25, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="text-2xl sm:text-4xl font-black uppercase text-white tracking-tight leading-tight max-w-xs sm:max-w-md drop-shadow-md"
                >
                  How do you beam data across a <span className="text-[#FFD500] underline decoration-[#0057A6] decoration-4">total air-gap?</span>
                </motion.h2>

                {/* Radar Pulse Icon */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="mt-6 flex items-center gap-2 px-4 py-2 bg-[#1b1b1b] border-2 border-[#333] rounded-xl text-xs font-mono text-[#aaa]"
                >
                  <Radio className="w-4 h-4 text-[#00A650] animate-spin" />
                  <span>Physical Channel: Photons + Sound</span>
                </motion.div>
              </div>

              {/* Bottom Badge */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-[11px] font-bold text-gray-400 uppercase tracking-widest"
              >
                No Cables • No Cloud • 100% Offline
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* SCENE 2: The Optical Fountain Stream (3.5s - 8.0s) */}
        {/* ======================================================== */}
        <AnimatePresence>
          {currentScene === 2 && (
            <motion.div 
              key="scene-2"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 p-4 sm:p-6 flex flex-col items-center justify-between text-center z-10 bg-black/40"
            >
              {/* Telemetry Header */}
              <div className="w-full flex items-center justify-between gap-2">
                <span className="px-3 py-1 bg-[#0057A6] text-white font-black text-[11px] rounded-lg border-2 border-[#003B73] uppercase tracking-wide">
                  ⚡ Fountain Engine
                </span>
                <span className="px-3 py-1 bg-[#FFD500] text-[#2B2B2B] font-black text-[11px] rounded-lg border-2 border-black uppercase font-mono">
                  18.4 KB/s • 12 FPS
                </span>
              </div>

              {/* Centerpiece: Rapid Staccato QR Matrix Beam */}
              <div className="relative my-auto flex flex-col items-center">
                {/* Glowing Laser Sweep Line */}
                <motion.div 
                  animate={{ y: [-130, 130, -130] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="absolute z-20 w-[240px] sm:w-[260px] h-[3px] bg-gradient-to-r from-transparent via-[#00A650] to-transparent shadow-[0_0_15px_#00A650]"
                />

                {/* Animated Pulsing Matrix Container */}
                <motion.div 
                  animate={{ scale: [0.98, 1.02, 0.98] }}
                  transition={{ repeat: Infinity, duration: 0.25 }}
                  className="relative p-3 bg-white rounded-3xl border-6 border-[#2B2B2B] shadow-[0_0_40px_rgba(255,213,0,0.3)]"
                >
                  {qrCodeDataUrls.length > 0 ? (
                    <img 
                      src={qrCodeDataUrls[activeQrIndex]} 
                      alt="Fountain QR Matrix"
                      className="w-[190px] h-[190px] sm:w-[220px] sm:h-[220px] object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-[190px] h-[190px] bg-black flex items-center justify-center text-white font-mono text-xs">
                      [GENERATING QR MATRIX]
                    </div>
                  )}
                </motion.div>

                {/* Mathematical Label */}
                <div className="mt-3 px-4 py-1.5 bg-[#2B2B2B] text-[#FFD500] font-mono text-xs font-bold rounded-xl border-2 border-[#444] shadow-sm">
                  Luby Transform GF(2) XOR Droplets
                </div>
              </div>

              {/* Bottom Feature Callout */}
              <motion.div 
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-[#00A650] text-white px-4 py-1.5 rounded-xl border-2 border-black font-black text-xs uppercase tracking-wide"
              >
                Zero Dropped Frames • Collect Any K Packets
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* SCENE 3: Multimodal Acoustic Redundancy (8.0s - 12.5s) */}
        {/* ======================================================== */}
        <AnimatePresence>
          {currentScene === 3 && (
            <motion.div 
              key="scene-3"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 p-4 sm:p-6 flex flex-col items-center justify-between text-center z-10"
            >
              {/* Badge */}
              <div className="w-full flex items-center justify-between">
                <span className="px-3 py-1 bg-[#FFD500] text-black font-black text-[11px] rounded-lg border-2 border-black uppercase tracking-wider">
                  🔊 Acoustic Channel
                </span>
                <span className="px-2.5 py-1 bg-[#222] border-2 border-[#444] rounded-lg text-emerald-400 font-mono text-[10px] font-bold">
                  2.2 kHz CARRIER SYNC
                </span>
              </div>

              {/* Frequency Waveform Oscilloscope Visualizer */}
              <div className="my-auto flex flex-col items-center w-full px-4">
                <motion.div 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-full max-w-[280px] sm:max-w-xs h-32 bg-[#141414] border-4 border-[#2B2B2B] rounded-2xl shadow-[4px_4px_0px_#222] flex items-center justify-center gap-1.5 px-4 overflow-hidden relative"
                >
                  {/* Frequency bars */}
                  {[...Array(16)].map((_, i) => (
                    <motion.div 
                      key={i}
                      animate={{ 
                        height: [
                          `${15 + ((i * 17) % 65)}%`,
                          `${80 - ((i * 13) % 55)}%`,
                          `${25 + ((i * 23) % 70)}%`
                        ] 
                      }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 0.35 + (i % 4) * 0.1, 
                        ease: "easeInOut" 
                      }}
                      className={cn(
                        "w-2 sm:w-2.5 rounded-full transition-colors",
                        i % 2 === 0 ? "bg-[#00A650]" : "bg-[#FFD500]"
                      )}
                    />
                  ))}
                  
                  <div className="absolute bottom-2 left-3 text-[9px] font-mono text-[#777]">
                    SYNTH: 1400Hz ↔ 3600Hz
                  </div>
                </motion.div>

                {/* Description */}
                <h3 className="mt-4 text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
                  Dual-Channel Backup
                </h3>
                <p className="mt-1 text-xs text-gray-300 font-medium max-w-xs">
                  Web Audio ultrasound chirps sync in real-time with optical light pulses.
                </p>
              </div>

              {/* Bottom Tag */}
              <div className="px-4 py-1 bg-[#0057A6] text-white font-mono text-[11px] font-bold rounded-xl border-2 border-black">
                Across-The-Room Range: 10+ Feet
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* SCENE 4: AR Peeling Decoder & Vault (12.5s - 16.8s) */}
        {/* ======================================================== */}
        <AnimatePresence>
          {currentScene === 4 && (
            <motion.div 
              key="scene-4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 p-4 sm:p-6 flex flex-col items-center justify-between text-center z-10"
            >
              {/* Viewfinder Header */}
              <div className="w-full flex items-center justify-between">
                <span className="flex items-center gap-1 px-3 py-1 bg-[#00A650] text-white font-black text-[11px] rounded-lg border-2 border-black uppercase">
                  <Scan className="w-3.5 h-3.5" />
                  AR Reticle Locked
                </span>
                <span className="font-mono text-xs font-bold text-[#FFD500]">
                  K = 48/48 DROPS
                </span>
              </div>

              {/* Viewfinder Targeting HUD */}
              <div className="my-auto flex flex-col items-center w-full px-2">
                <div className="relative w-64 sm:w-72 p-5 bg-[#181818] border-4 border-[#00A650] shadow-[0_0_25px_rgba(0,166,80,0.3)] rounded-3xl flex flex-col items-center">
                  {/* AR Reticle Corner Nodes */}
                  <div className="absolute top-2 left-2 w-4 h-4 border-t-4 border-l-4 border-[#00A650]" />
                  <div className="absolute top-2 right-2 w-4 h-4 border-t-4 border-r-4 border-[#00A650]" />
                  <div className="absolute bottom-2 left-2 w-4 h-4 border-b-4 border-l-4 border-[#00A650]" />
                  <div className="absolute bottom-2 right-2 w-4 h-4 border-b-4 border-r-4 border-[#00A650]" />

                  {/* Circular Progress Bar */}
                  <div className="relative w-20 h-20 mb-3 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#333]"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[#00A650] transition-all duration-150"
                        strokeDasharray={`${fountainProgress}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span className="absolute font-black text-sm text-white">
                      {fountainProgress}%
                    </span>
                  </div>

                  {/* Decrypted Payload Result */}
                  <AnimatePresence>
                    {!isNuked ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="w-full bg-[#242424] p-2.5 rounded-xl border border-[#444] text-left"
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#00A650] uppercase mb-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Decrypted In-Browser</span>
                        </div>
                        <p className="font-mono text-[11px] text-gray-200 line-clamp-2">
                          {decryptedText || "Peeling Luby equations over GF(2)..."}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-full bg-[#E3000B] text-white p-3 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-2 border-2 border-black"
                      >
                        <Flame className="w-4 h-4 animate-bounce" />
                        <span>💥 VAULT NUKED (ZERO RESIDUAL TRACE)</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Bottom Tag */}
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                IndexedDB Offline Storage • Instant Memory Purge
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================== */}
        {/* SCENE 5: Brand Resolve & Outro (16.8s - 20.0s) */}
        {/* ======================================================== */}
        <AnimatePresence>
          {currentScene === 5 && (
            <motion.div 
              key="scene-5"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ type: "spring", damping: 15, stiffness: 200 }}
              className="absolute inset-0 p-6 flex flex-col items-center justify-between text-center z-10 bg-gradient-to-b from-[#111] to-[#1e1e1e]"
            >
              <div className="w-full flex justify-center">
                <span className="px-3 py-1 bg-[#00A650] text-white font-black text-[11px] rounded-lg border-2 border-black uppercase tracking-wider">
                  Open Source Protocol & PWA
                </span>
              </div>

              {/* Hero Logo Card with Playful Lego 3D Tilt */}
              <motion.div 
                initial={{ rotate: -5, y: 15 }}
                animate={{ rotate: 0, y: 0 }}
                transition={{ duration: 0.4 }}
                className="my-auto flex flex-col items-center"
              >
                <div className="bg-[#FFD500] px-7 py-3 rounded-2xl border-5 border-black shadow-[6px_6px_0px_#000] rotate-[-2deg] mb-3">
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#2B2B2B] uppercase">
                    QRMesh
                  </h1>
                </div>

                <p className="text-sm sm:text-base font-bold text-white max-w-xs mt-2 leading-snug">
                  Zero Network Optical & Acoustic Air-Gap Suite
                </p>

                {/* Author Badge */}
                <div className="mt-4 px-4 py-1.5 bg-[#0057A6] text-white font-bold text-xs rounded-xl border-3 border-black shadow-[3px_3px_0px_#000]">
                  Crafted by <span className="underline font-black">Aryan</span>
                </div>

                {/* GitHub pill */}
                <div className="mt-3 flex items-center gap-1.5 text-xs font-mono text-[#aaa]">
                  <ExternalLink className="w-3.5 h-3.5 text-[#FFD500]" />
                  <span>github.com/aryan0880/QR_APP</span>
                </div>
              </motion.div>

              {/* Replay Prompt */}
              <button
                onClick={handleRestart}
                className="px-5 py-2 bg-[#FFD500] hover:bg-[#ffe033] border-3 border-black shadow-[3px_3px_0px_#000] rounded-xl text-black font-black text-xs uppercase flex items-center gap-2 transition-all active:translate-y-1 active:shadow-none"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Replay Showreel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Progress Bar at bottom of screen */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 z-30">
          <motion.div 
            className="h-full bg-[#FFD500]"
            style={{ width: `${(currentTime / TOTAL_DURATION) * 100}%` }}
          />
        </div>
      </div>

      {/* Timeline Controls & Scrubber */}
      <div className="w-full mt-3 bg-[#1e1e1e] border-3 border-[#333] shadow-[4px_4px_0px_#111] p-3 sm:p-4 rounded-2xl text-white">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Play/Pause & Replay */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-[#FFD500] hover:bg-[#ffe033] text-black rounded-xl border-2 border-black shadow-[2px_2px_0px_#000] active:translate-y-0.5 active:shadow-none transition-all font-black"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
            </button>

            <button
              onClick={handleRestart}
              className="p-3 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-xl border border-[#444] transition-all"
              title="Restart"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="font-mono text-xs text-[#aaa]">
              <span className="text-white font-bold">{currentTime.toFixed(1)}s</span> / {TOTAL_DURATION.toFixed(1)}s
            </div>
          </div>

          {/* Interactive Scene Jump Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
            {[
              { label: '1. Air-Gap', time: 0 },
              { label: '2. Optical', time: 3.5 },
              { label: '3. Acoustic', time: 8.0 },
              { label: '4. Decoder', time: 12.5 },
              { label: '5. Resolve', time: 16.8 },
            ].map((sc, i) => (
              <button
                key={i}
                onClick={() => handleSeek(sc.time)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap border",
                  currentScene === i + 1 
                    ? "bg-[#FFD500] text-black border-black shadow-[2px_2px_0px_#000]" 
                    : "bg-[#2a2a2a] text-[#888] border-[#444] hover:text-white"
                )}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Range Slider for Scrubbing */}
        <div className="mt-3">
          <input 
            type="range"
            min="0"
            max={TOTAL_DURATION}
            step="0.05"
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="w-full accent-[#FFD500] cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
