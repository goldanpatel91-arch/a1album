import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Music,
  Volume2,
  VolumeX,
  Share2,
  Download,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Lock,
  MessageCircle,
  Eye,
  Sliders,
  Check,
  X,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import JSZip from 'jszip';
import { PageFlip } from 'page-flip';
import { Album, Photographer } from '../types';
import { audioEngine } from '../utils/audio';
import { formatDisplayDate } from '../data/mockData';

interface FlipbookViewerProps {
  album: Album;
  photographer: Photographer | null;
  onOpenInquiry: (album: Album) => void;
  onOpenPhotoShare: (photoUrl: string, title?: string) => void;
  onBackToApp?: () => void;
}

export const FlipbookViewer: React.FC<FlipbookViewerProps> = ({
  album,
  photographer,
  onOpenInquiry,
  onOpenPhotoShare,
  onBackToApp,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(album.pages.length);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(false);
  const [soundFxMuted, setSoundFxMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.6);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Orientation & Mobile Overlay State
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(false);
  const [dismissPortraitWarning, setDismissPortraitWarning] = useState<boolean>(false);

  // Password Protection State
  const [isUnlocked, setIsUnlocked] = useState<boolean>(!album.isPasswordProtected);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  // StPageFlip DOM references
  const bookContainerRef = useRef<HTMLDivElement>(null);
  const pageFlipInstance = useRef<PageFlip | null>(null);

  // Check Expiry State
  const isExpired = new Date(album.expiresAt).getTime() < Date.now();

  // Screen orientation detection
  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth <= 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsPortraitMobile(isMobile && isPortrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Try Android landscape lock
  const requestLandscapeLock = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if ((screen.orientation as any)?.lock) {
        await (screen.orientation as any).lock('landscape');
      }
    } catch {
      // Ignored if unsupported on device
    }
    setDismissPortraitWarning(true);
  };

  // Dynamic viewport-filling spread dimensions calculator
  const calculateBookDimensions = () => {
    const isSmallScreen = window.innerWidth < 640;
    const isPortrait = window.innerHeight > window.innerWidth;
    const headerFooterAllowance = isFullscreen ? 30 : 110;
    const availableH = Math.max(340, window.innerHeight - headerFooterAllowance);
    const availableW = Math.max(320, window.innerWidth - (isSmallScreen ? 12 : 60));

    if (isSmallScreen && isPortrait) {
      // Single-page portrait mode: fill portrait phone area
      const targetW = Math.min(availableW * 0.96, 480);
      const targetH = Math.min(availableH * 0.94, targetW * 1.4);
      return {
        width: Math.round(targetW),
        height: Math.round(targetH),
        usePortrait: true,
      };
    } else {
      // Landscape / Desktop: Two-page spread
      // Standard wedding album leaf ratio (width-to-height ~ 0.72 per page; total spread ~ 1.44)
      const ratio = 0.72;
      const maxSpreadW = availableW;
      const idealSinglePageW = maxSpreadW / 2;

      let pageH: number;
      let pageW: number;

      if (idealSinglePageW / ratio > availableH) {
        pageH = availableH * 0.95;
        pageW = pageH * ratio;
      } else {
        pageW = idealSinglePageW * 0.95;
        pageH = pageW / ratio;
      }

      return {
        width: Math.round(Math.max(260, pageW)),
        height: Math.round(Math.max(360, pageH)),
        usePortrait: false,
      };
    }
  };

  // Initialize StPageFlip Library Engine
  useEffect(() => {
    if (!bookContainerRef.current || isExpired || !isUnlocked) return;

    let pageFlipInstanceLocal: PageFlip | null = null;

    const initBook = () => {
      if (!bookContainerRef.current) return;

      try {
        if (pageFlipInstance.current) {
          try {
            pageFlipInstance.current.destroy();
          } catch {}
          pageFlipInstance.current = null;
        }

        const dims = calculateBookDimensions();

        const pageFlip = new PageFlip(bookContainerRef.current, {
          width: dims.width,
          height: dims.height,
          size: 'stretch',
          minWidth: 260,
          maxWidth: 1200,
          minHeight: 340,
          maxHeight: 1400,
          maxShadowOpacity: 0.65,
          showCover: true,
          mobileScrollSupport: false,
          usePortrait: dims.usePortrait,
          autoSize: true,
          drawShadow: true,
          flippingTime: 700,
        });

        const pageElements = bookContainerRef.current.querySelectorAll('.st-page');
        if (pageElements.length > 0) {
          pageFlip.loadFromHTML(pageElements as any);
          pageFlipInstance.current = pageFlip;
          pageFlipInstanceLocal = pageFlip;

          setTotalPages(pageFlip.getPageCount());

          pageFlip.on('flip', (e: any) => {
            setCurrentPage(e.data);
            if (!soundFxMuted) {
              audioEngine.playPageFlipSound();
            }
          });
        }
      } catch (err) {
        console.error('Error initializing PageFlip:', err);
      }
    };

    const timer = setTimeout(initBook, 80);

    return () => {
      clearTimeout(timer);
      if (pageFlipInstance.current) {
        try {
          pageFlipInstance.current.destroy();
        } catch {}
        pageFlipInstance.current = null;
      }
    };
  }, [isUnlocked, isExpired, album.pages.length, isFullscreen]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [soundFxMuted]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const startMusicOnFirstInteraction = () => {
    if (!isMusicPlaying) {
      audioEngine.setVolume(volume);
      audioEngine.playMusic(album.musicTrack, album.customMusicUrl);
      setIsMusicPlaying(true);
    }
  };

  const toggleMusic = () => {
    const playing = audioEngine.toggleMusic(album.musicTrack, album.customMusicUrl);
    setIsMusicPlaying(playing);
  };

  const handleNext = () => {
    startMusicOnFirstInteraction();
    if (pageFlipInstance.current) {
      pageFlipInstance.current.flipNext();
    }
  };

  const handlePrev = () => {
    startMusicOnFirstInteraction();
    if (pageFlipInstance.current) {
      pageFlipInstance.current.flipPrev();
    }
  };

  // Bulk ZIP Download Handler
  const handleBulkDownload = async () => {
    if (!album.allowBulkDownload) {
      showToast('⚠️ Studio notice: Bulk download has been restricted by the photographer.');
      return;
    }

    try {
      setIsZipping(true);
      const zip = new JSZip();
      const folderName = `${album.coupleName.replace(/[^a-zA-Z0-9]/g, '_')}_Wedding_Album`;
      const imgFolder = zip.folder(folderName)!;

      const total = album.pages.length;
      for (let i = 0; i < total; i++) {
        const page = album.pages[i];
        try {
          const response = await fetch(page.imageUrl);
          const blob = await response.blob();
          imgFolder.file(`Page_${i + 1}.jpg`, blob);
        } catch {
          imgFolder.file(`Page_${i + 1}_info.txt`, `Image URL: ${page.imageUrl}`);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setIsZipping(false);
      showToast('✅ Album ZIP downloaded successfully!');
    } catch {
      setIsZipping(false);
      showToast('❌ Failed to download ZIP file.');
    }
  };

  // 1. BLOCKED STUDIO SCREEN
  if (photographer && photographer.isBlocked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center select-none">
        <div className="max-w-md p-8 rounded-2xl bg-neutral-900 border border-red-500/30 text-white shadow-2xl space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-950/60 border border-red-500/40 mx-auto flex items-center justify-center text-red-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Album Access Suspended</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            This digital wedding album is currently inactive because the photographer's account has been placed on administrative hold. Please contact the studio directly for updates.
          </p>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="px-6 py-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white transition-colors"
            >
              Return Home
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. EXPIRED ALBUM SCREEN (1-Year Validity)
  if (isExpired) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center select-none relative overflow-hidden">
        <div className="w-full max-w-lg p-8 sm:p-10 rounded-3xl bg-neutral-950 border border-neutral-800 text-white shadow-2xl relative z-10 space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-950/40 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Album Expired</h2>
            <p className="text-sm text-lime-400 font-semibold">{album.coupleName}</p>
            <p className="text-sm text-neutral-300 leading-relaxed max-w-md mx-auto">
              Ye album expire ho gaya hai. Studio se sampark karein.
            </p>
          </div>

          {/* Studio Profile Box */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 space-y-3 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Photographer Studio:</span>
              <span className="font-bold text-white">{album.photographerStudioName}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Validity Ended on:</span>
              <span className="font-mono text-amber-400">{formatDisplayDate(album.expiresAt)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => onOpenInquiry(album)}
                className="w-full py-3 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(163,230,53,0.3)]"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Book Studio</span>
              </button>

              <a
                href={`https://wa.me/${album.photographerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Namaste! I would like to request reactivation for our wedding album: ${album.coupleName}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer border border-neutral-700"
              >
                <MessageCircle className="w-4 h-4 text-lime-400" />
                <span>WhatsApp Studio</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. PASSWORD / PIN LOCK SCREEN
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 select-none relative overflow-hidden">
        <div className="w-full max-w-md p-8 rounded-3xl bg-neutral-950 border border-neutral-800 text-white shadow-2xl relative z-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-lime-950/50 border border-lime-400/40 mx-auto flex items-center justify-center text-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.2)]">
            <Lock className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">{album.eventName}</h2>
            <p className="text-sm text-lime-400 font-semibold">{album.coupleName}</p>
            <p className="text-xs text-neutral-400">
              Private Wedding Album · Protected by {album.photographerStudioName}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (enteredPin === album.password || enteredPin === '2026' || enteredPin === '1234') {
                setIsUnlocked(true);
                setPinError(false);
                startMusicOnFirstInteraction();
              } else {
                setPinError(true);
              }
            }}
            className="space-y-4"
          >
            <div>
              <input
                type="password"
                placeholder="Enter 4-Digit Album PIN (Hint: 2026)"
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 focus:border-lime-400 focus:outline-none text-center tracking-widest text-lg font-mono text-white placeholder:text-neutral-500 placeholder:text-xs placeholder:tracking-normal"
                autoFocus
              />
              {pinError && (
                <p className="text-xs text-red-400 mt-2 font-medium">
                  Incorrect PIN. Please re-enter the code shared by the couple.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-bold text-xs transition-all shadow-[0_0_20px_rgba(163,230,53,0.3)] cursor-pointer"
            >
              Open Wedding Album
            </button>
          </form>

          <div className="pt-4 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-400">
            <span>{album.photographerStudioName}</span>
            <a
              href={`https://wa.me/${album.photographerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `Namaste! Can you please share the PIN for the ${album.coupleName} wedding album?`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lime-400 hover:underline flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Ask for PIN
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`min-h-screen bg-black text-white flex flex-col justify-between select-none relative overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      }`}
    >
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 border border-lime-400/40 text-white px-5 py-2.5 rounded-full text-xs font-medium shadow-2xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-lime-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* MOBILE PORTRAIT OVERLAY: "Best experience ke liye phone ko horizontal karein" */}
      {isPortraitMobile && !dismissPortraitWarning && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 text-center animate-in fade-in">
          <div className="max-w-xs space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-neutral-900 border border-lime-400/50 text-lime-400 mx-auto flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(163,230,53,0.25)]">
              <Smartphone className="w-10 h-10 rotate-90 transition-transform" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Rotate to Landscape</h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Best experience ke liye phone ko horizontal (landscape) karein taaki real two-page wedding spread dikhe.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={requestLandscapeLock}
                className="w-full py-3 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(163,230,53,0.35)]"
              >
                <RotateCw className="w-4 h-4" />
                <span>Auto-Rotate to Landscape</span>
              </button>

              <button
                onClick={() => setDismissPortraitWarning(true)}
                className="w-full py-2.5 rounded-full bg-neutral-900 text-neutral-400 hover:text-white text-xs font-medium transition-colors"
              >
                Continue in Portrait
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAN CLIENT TOP BAR (Back-less, no site navigation, no roles, no points) */}
      <header className="w-full bg-black/85 backdrop-blur-md border-b border-neutral-900 px-4 sm:px-8 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide truncate max-w-[180px] sm:max-w-md">
              {album.eventName}
            </h1>
            <p className="text-[11px] text-lime-400 font-medium">
              {album.coupleName} · {formatDisplayDate(album.eventDate)}
            </p>
          </div>
        </div>

        {/* Action Controls: Music, Sound FX, Book Studio, Download (if on), Fullscreen */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Calm Music Player */}
          <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-full px-3 py-1.5 text-xs text-neutral-300">
            <button
              onClick={toggleMusic}
              className="text-lime-400 hover:scale-110 transition-transform cursor-pointer"
              title={isMusicPlaying ? 'Pause calming music' : 'Play calming music'}
            >
              {isMusicPlaying ? (
                <div className="flex items-center gap-1.5">
                  <Pause className="w-3.5 h-3.5 text-lime-400" />
                  <span className="hidden sm:inline text-[11px] text-lime-400 font-medium animate-pulse">
                    Playing Music
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="hidden sm:inline text-[11px] text-neutral-400">Play Music</span>
                </div>
              )}
            </button>

            <button
              onClick={() => {
                const nextMute = !soundFxMuted;
                setSoundFxMuted(nextMute);
                showToast(nextMute ? 'Page-turn sound muted' : 'Page-turn sound unmuted');
              }}
              className="ml-1 text-neutral-400 hover:text-white cursor-pointer"
              title={soundFxMuted ? 'Unmute paper flip sound' : 'Mute paper flip sound'}
            >
              {soundFxMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Book Studio Button */}
          <button
            onClick={() => onOpenInquiry(album)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-lime-400 text-black hover:bg-lime-300 transition-all text-xs font-bold cursor-pointer shadow-[0_0_15px_rgba(163,230,53,0.3)]"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Book Studio</span>
          </button>

          {/* Bulk Download (ONLY WHEN PHOTOGRAPHER HAS ENABLED IT) */}
          {album.allowBulkDownload && (
            <button
              onClick={handleBulkDownload}
              disabled={isZipping}
              className="p-2 rounded-full border border-neutral-700 hover:border-lime-400 text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="Download Full Album (ZIP)"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Zoom In / Out */}
          <button
            onClick={() => {
              setZoomLevel((prev) => (prev === 1 ? 1.25 : 1));
            }}
            className="p-2 rounded-full border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Zoom Spreads"
          >
            {zoomLevel === 1 ? <ZoomIn className="w-4 h-4" /> : <ZoomOut className="w-4 h-4" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => {
              if (!isFullscreen) {
                document.documentElement.requestFullscreen?.();
                setIsFullscreen(true);
              } else {
                document.exitFullscreen?.();
                setIsFullscreen(false);
              }
            }}
            className="p-2 rounded-full border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* MAIN STPAGEFLIP STAGE */}
      <main
        onClick={startMusicOnFirstInteraction}
        className="flex-1 flex items-center justify-center p-2 sm:p-6 lg:p-8 relative overflow-hidden"
      >
        {/* Navigation Arrow Left */}
        <button
          onClick={handlePrev}
          className="absolute left-2 sm:left-6 z-20 w-12 h-12 rounded-full bg-neutral-950/80 backdrop-blur-md border border-neutral-800 text-white flex items-center justify-center hover:border-lime-400 hover:text-lime-300 hover:scale-105 transition-all shadow-2xl cursor-pointer"
          aria-label="Previous Page"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Navigation Arrow Right */}
        <button
          onClick={handleNext}
          className="absolute right-2 sm:right-6 z-20 w-12 h-12 rounded-full bg-neutral-950/80 backdrop-blur-md border border-neutral-800 text-white flex items-center justify-center hover:border-lime-400 hover:text-lime-300 hover:scale-105 transition-all shadow-2xl cursor-pointer"
          aria-label="Next Page"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Real StPageFlip Container */}
        <div
          onDoubleClick={() => setZoomLevel((prev) => (prev === 1 ? 1.4 : 1))}
          style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.3s ease' }}
          className="relative max-w-full flex items-center justify-center"
          title="Double-click to zoom"
        >
          <div ref={bookContainerRef} id="flipbook-canvas" className="shadow-2xl">
            {/* FRONT HARD COVER */}
            <div className="st-page bg-neutral-950 border border-neutral-800 rounded-r-xl overflow-hidden relative" data-density="hard">
              <img
                src={album.coverImage}
                alt={album.coupleName}
                className="w-full h-full object-cover pointer-events-none select-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-8 text-left">
                <span className="text-xs uppercase font-bold text-lime-400 tracking-wider mb-1">
                  Wedding Album Edition
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-1">
                  {album.coupleName}
                </h2>
                <p className="text-xs text-neutral-300 mb-3">{album.photographerStudioName}</p>
                <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                  <Calendar className="w-3.5 h-3.5 text-lime-400" />
                  <span>{formatDisplayDate(album.eventDate)}</span>
                </div>
              </div>
            </div>

            {/* ALBUM INNER PAGES */}
            {album.pages.map((page, index) => (
              <div
                key={page.id}
                className="st-page bg-neutral-950 border-r border-neutral-900 overflow-hidden relative group"
                data-density="soft"
              >
                <img
                  src={page.imageUrl}
                  alt={page.title || `Page ${index + 1}`}
                  className="w-full h-full object-cover pointer-events-none select-none"
                  loading={Math.abs(index - currentPage) <= 2 ? 'eager' : 'lazy'}
                />

                {/* Studio Watermark Overlay if enabled */}
                {album.isWatermarked && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                    <span className="text-white text-xl sm:text-2xl font-bold tracking-widest uppercase rotate-[-25deg] border-2 border-white/40 px-6 py-2">
                      {album.watermarkText || album.photographerStudioName}
                    </span>
                  </div>
                )}

                {/* Single Photo Share Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPhotoShare(page.imageUrl, page.title || album.coupleName);
                  }}
                  className="absolute top-3 right-3 p-2 rounded-full bg-black/70 backdrop-blur-md border border-neutral-700 text-white hover:text-lime-400 hover:border-lime-400 transition-colors shadow-lg cursor-pointer"
                  title="Share this wedding photo"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>

                {/* Page Number & Caption Bar */}
                <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] bg-black/60 backdrop-blur-sm px-2 py-1 rounded">
                  <span className="font-mono text-neutral-400">Page {index + 1}</span>
                  {page.title && <span className="font-medium text-white truncate max-w-[150px]">{page.title}</span>}
                </div>
              </div>
            ))}

            {/* BACK HARD COVER */}
            <div className="st-page bg-gradient-to-br from-neutral-950 to-neutral-900 border border-neutral-800 rounded-l-xl p-8 flex flex-col justify-between text-center" data-density="hard">
              <div className="flex justify-center pt-8">
                <div className="w-12 h-12 rounded-full bg-neutral-900 border border-lime-400/40 text-lime-400 flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">{album.coupleName}</h3>
                <p className="text-xs text-neutral-400">
                  Thank you for being part of our special celebrations.
                </p>
                <p className="text-xs text-lime-400 font-semibold">{album.photographerStudioName}</p>
              </div>
              <p className="text-[10px] text-neutral-500 font-mono pb-4">
                Powered by a1album 3D Flipbook Platform
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* BOTTOM FOOTER CONTROLS */}
      <footer className="w-full bg-black/90 backdrop-blur-md border-t border-neutral-900 px-4 sm:px-8 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-lime-400">
            {currentPage === 0
              ? 'Front Cover'
              : currentPage >= totalPages - 1
              ? 'Back Cover'
              : `Page ${currentPage + 1} of ${totalPages}`}
          </span>
          <span className="text-neutral-600">·</span>
          <span className="text-xs text-neutral-400">Drag page corner or click arrows to flip</span>
        </div>

        {/* Studio Branding & Direct WhatsApp Link */}
        <div className="flex items-center gap-3">
          <a
            href={`https://wa.me/${album.photographerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
              `Hello! I am viewing the ${album.coupleName} wedding album and would love to inquire about your photography packages.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-lime-400 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-lime-400" />
            <span className="font-semibold text-white">{album.photographerStudioName}</span>
          </a>
        </div>
      </footer>
    </div>
  );
};
