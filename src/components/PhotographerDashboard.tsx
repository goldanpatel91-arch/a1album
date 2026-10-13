import React, { useState } from 'react';
import {
  Coins,
  AlertTriangle,
  Plus,
  Share2,
  Eye,
  Music,
  Download,
  Lock,
  QrCode,
  ExternalLink,
  Trash2,
  Upload,
  Sparkles,
  CheckCircle2,
  MessageCircle,
  Copy,
  Calendar,
  Layers,
  ArrowRight,
  Shield,
  Split,
  FileCheck,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { Photographer, Album, BookingInquiry, AlbumPage, PointSettings } from '../types';
import {
  LOW_BALANCE_THRESHOLD,
  getDaysRemaining,
  formatDisplayDate,
  generateUnguessableId,
} from '../data/mockData';
import {
  compressMultipleFilesParallel,
  splitPanoramicSpread,
  CompressionProgress,
} from '../utils/imageCompression';
import { audioEngine } from '../utils/audio';

interface PhotographerDashboardProps {
  photographer: Photographer;
  albums: Album[];
  inquiries: BookingInquiry[];
  pointSettings: PointSettings;
  onOpenRecharge: () => void;
  onCreateAlbum: (albumData: Omit<Album, 'id' | 'viewsCount' | 'createdAt'>) => boolean;
  onRenewAlbum: (albumId: string) => boolean;
  onDeleteAlbum: (albumId: string) => void;
  onViewAlbum: (album: Album) => void;
  onOpenInquiryReply: (phone: string, coupleName?: string) => void;
}

export const PhotographerDashboard: React.FC<PhotographerDashboardProps> = ({
  photographer,
  albums,
  inquiries,
  pointSettings,
  onOpenRecharge,
  onCreateAlbum,
  onRenewAlbum,
  onDeleteAlbum,
  onViewAlbum,
  onOpenInquiryReply,
}) => {
  const [activeTab, setActiveTab] = useState<'albums' | 'create' | 'inquiries'>('albums');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [qrModalAlbum, setQrModalAlbum] = useState<Album | null>(null);

  // CREATE ALBUM WIZARD STATE
  const [eventName, setEventName] = useState('');
  const [coupleName, setCoupleName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [musicTrack, setMusicTrack] = useState('velvet-piano');
  const [customMusicUrl, setCustomMusicUrl] = useState('');
  const [allowBulkDownload, setAllowBulkDownload] = useState(false); // DEFAULT OFF
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('2026');
  const [isWatermarked, setIsWatermarked] = useState(true);
  const [watermarkText, setWatermarkText] = useState(photographer.studioName);
  const [description, setDescription] = useState('');

  // Upload & Parallel Compression State
  const [uploadedPages, setUploadedPages] = useState<AlbumPage[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState<CompressionProgress | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const studioAlbums = albums.filter((a) => a.photographerId === photographer.id);
  const studioInquiries = inquiries.filter((inq) => inq.photographerId === photographer.id);

  // File Upload with Fast Parallel Canvas Compression
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files);

    try {
      setIsCompressing(true);
      setErrorNotice(null);

      const results = await compressMultipleFilesParallel(fileList, (progress) => {
        setCompressionProgress(progress);
      });

      const newPages: AlbumPage[] = results.map((res, index) => ({
        id: 'pg_' + Math.random().toString(36).substring(2, 9),
        pageNumber: uploadedPages.length + index + 1,
        imageUrl: res.dataUrl,
        title: `Wedding Moment ${uploadedPages.length + index + 1}`,
        spreadType: index === 0 && uploadedPages.length === 0 ? 'single' : index % 2 === 1 ? 'left' : 'right',
        originalSizeKb: res.originalSizeKb,
        compressedSizeKb: res.compressedSizeKb,
      }));

      setUploadedPages((prev) => [...prev, ...newPages]);
      setIsCompressing(false);
    } catch {
      setIsCompressing(false);
      setErrorNotice('Error optimizing and compressing images. Please retry.');
    }
  };

  // Split panoramic spread
  const handleSplitPage = async (pageIndex: number) => {
    const targetPage = uploadedPages[pageIndex];
    if (!targetPage) return;

    try {
      setIsCompressing(true);
      const { leftDataUrl, rightDataUrl } = await splitPanoramicSpread(targetPage.imageUrl);

      const leftPage: AlbumPage = {
        id: 'pg_' + Math.random().toString(36).substring(2, 9),
        pageNumber: targetPage.pageNumber,
        imageUrl: leftDataUrl,
        title: `${targetPage.title || 'Page'} (Left Leaf)`,
        spreadType: 'left',
      };

      const rightPage: AlbumPage = {
        id: 'pg_' + Math.random().toString(36).substring(2, 9),
        pageNumber: targetPage.pageNumber + 1,
        imageUrl: rightDataUrl,
        title: `${targetPage.title || 'Page'} (Right Leaf)`,
        spreadType: 'right',
      };

      const updated = [...uploadedPages];
      updated.splice(pageIndex, 1, leftPage, rightPage);

      const reindexed = updated.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
      setUploadedPages(reindexed);
      setIsCompressing(false);
    } catch {
      setIsCompressing(false);
      setErrorNotice('Failed to split spread.');
    }
  };

  const handleRemovePage = (index: number) => {
    const updated = uploadedPages.filter((_, i) => i !== index);
    const reindexed = updated.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    setUploadedPages(reindexed);
  };

  const handlePublishAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);

    if (photographer.points < pointSettings.pointsPerAlbum) {
      setErrorNotice(
        `Insufficient points! Creating an album requires ${pointSettings.pointsPerAlbum} points. You have ${photographer.points} points. Please recharge your wallet.`
      );
      return;
    }

    if (uploadedPages.length === 0) {
      setErrorNotice('Please upload at least 2 album pages to build the flipbook.');
      return;
    }

    // 1-Year Live Validity Calculation (365 days)
    const now = new Date();
    const expiresDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const graceDate = new Date(expiresDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const shareCode = generateUnguessableId();

    const success = onCreateAlbum({
      shareCode,
      photographerId: photographer.id,
      photographerStudioName: photographer.studioName,
      photographerPhone: photographer.phone,
      eventName,
      coupleName,
      clientPhone,
      clientEmail,
      eventDate: eventDate || new Date().toISOString().split('T')[0],
      coverImage: uploadedPages[0].imageUrl,
      pages: uploadedPages,
      musicTrack,
      customMusicUrl: customMusicUrl || undefined,
      allowBulkDownload,
      isPasswordProtected,
      password: isPasswordProtected ? password : undefined,
      expiresAt: expiresDate.toISOString(),
      gracePeriodEndsAt: graceDate.toISOString(),
      isWatermarked,
      watermarkText,
      description,
    });

    if (success) {
      setEventName('');
      setCoupleName('');
      setClientPhone('');
      setUploadedPages([]);
      setActiveTab('albums');
    }
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/#album-${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Low Point Balance Warning Alert (<20 points) */}
        {photographer.points < LOW_BALANCE_THRESHOLD && (
          <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-300">
                  Low Point Balance Alert ({photographer.points} Points Remaining)
                </h4>
                <p className="text-xs text-neutral-300">
                  You need at least {pointSettings.pointsPerAlbum} points to publish a new wedding album. Recharge now to avoid client delivery interruption.
                </p>
              </div>
            </div>
            <button
              onClick={onOpenRecharge}
              className="px-5 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)] shrink-0 cursor-pointer"
            >
              Recharge Points Now
            </button>
          </div>
        )}

        {/* Studio Top Profile & Wallet Stat Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Studio Profile Card */}
          <div className="lg:col-span-2 bg-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between shadow-lg">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-neutral-900 border border-lime-400/40 flex items-center justify-center text-lime-400 font-bold text-lg shadow-[0_0_15px_rgba(163,230,53,0.2)]">
                  {photographer.studioName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{photographer.studioName}</h2>
                  <p className="text-xs text-lime-400 font-medium">Owner: {photographer.name}</p>
                  <p className="text-[11px] text-neutral-400">{photographer.phone} · {photographer.email}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-400">
              <span>{photographer.address || 'India'}</span>
              <span className="text-lime-400">{photographer.totalAlbumsCreated} Total Published Albums</span>
            </div>
          </div>

          {/* Wallet Balance Card */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">Studio Points Wallet</span>
              <Coins className="w-4 h-4 text-lime-400" />
            </div>

            <div className="my-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-white font-mono">{photographer.points}</span>
                <span className="text-xs text-neutral-400">Points Available</span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                1 Album = {pointSettings.pointsPerAlbum} Points · 1 Renewal = {pointSettings.renewalPointsPerAlbum} Point
              </p>
            </div>

            <button
              onClick={onOpenRecharge}
              className="w-full py-2.5 rounded-full bg-lime-400 hover:bg-lime-300 text-black text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(163,230,53,0.25)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Recharge Points (Min 1 Pt)</span>
            </button>
          </div>

          {/* Quick Stats Card */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-400">Engagement & Leads</span>
              <Eye className="w-4 h-4 text-lime-400" />
            </div>

            <div className="grid grid-cols-2 gap-2 my-2">
              <div>
                <p className="text-2xl font-bold text-white font-mono">
                  {studioAlbums.reduce((sum, a) => sum + a.viewsCount, 0)}
                </p>
                <p className="text-[10px] text-neutral-400">Client Book Views</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-lime-400 font-mono">{studioInquiries.length}</p>
                <p className="text-[10px] text-neutral-400">Booking Inquiries</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('inquiries')}
              className="w-full py-2 rounded-full bg-neutral-900 border border-neutral-700 hover:border-lime-400/50 text-neutral-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              View Inquiries Inbox
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
          <button
            onClick={() => setActiveTab('albums')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'albums'
                ? 'bg-lime-400 text-black shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            My Wedding Albums ({studioAlbums.length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'bg-lime-400 text-black shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Album (-{pointSettings.pointsPerAlbum} Pts)</span>
          </button>
          <button
            onClick={() => setActiveTab('inquiries')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'inquiries'
                ? 'bg-lime-400 text-black shadow-md'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Client Leads ({studioInquiries.length})</span>
          </button>
        </div>

        {/* TAB 1: ALBUM LIST VIEW */}
        {activeTab === 'albums' && (
          <div className="space-y-4">
            {studioAlbums.length === 0 ? (
              <div className="text-center py-16 bg-neutral-950 border border-neutral-800 rounded-2xl p-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-neutral-900 border border-lime-400/30 text-lime-400 mx-auto flex items-center justify-center">
                  <Layers className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white">No Wedding Albums Yet</h3>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Transform static photos into luxury 3D digital flipbooks with 1-year live validity and client WhatsApp sharing.
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-6 py-2.5 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-semibold text-xs transition-all shadow-[0_0_20px_rgba(163,230,53,0.3)] cursor-pointer"
                >
                  Create First Wedding Album
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {studioAlbums.map((album) => {
                  const daysLeft = getDaysRemaining(album.expiresAt);
                  const isExpired = daysLeft <= 0;
                  const isExpiringSoon = daysLeft > 0 && daysLeft <= 30;

                  return (
                    <div
                      key={album.id}
                      className="bg-neutral-950 border border-neutral-800 hover:border-lime-400/40 rounded-2xl overflow-hidden shadow-lg transition-all group flex flex-col justify-between"
                    >
                      <div>
                        {/* Album Cover with Badges */}
                        <div className="w-full h-48 relative overflow-hidden bg-neutral-900">
                          <img
                            src={album.coverImage}
                            alt={album.coupleName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                          {/* Top Badges */}
                          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                            <span className="bg-black/80 backdrop-blur-md border border-neutral-700 text-lime-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              {album.pages.length} {album.pages.length === 1 ? 'Page' : 'Pages'}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {album.isPasswordProtected && (
                                <span
                                  className="bg-neutral-900/90 text-amber-300 p-1 rounded-full border border-neutral-700"
                                  title="Password Protected"
                                >
                                  <Lock className="w-3 h-3" />
                                </span>
                              )}
                              {album.allowBulkDownload && (
                                <span
                                  className="bg-neutral-900/90 text-emerald-300 p-1 rounded-full border border-neutral-700"
                                  title="Bulk Download Enabled"
                                >
                                  <Download className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bottom Overlay Title */}
                          <div className="absolute bottom-3 left-3 right-3">
                            <p className="text-[10px] uppercase font-semibold tracking-wider text-lime-400">
                              {album.eventName}
                            </p>
                            <h4 className="text-base font-bold text-white truncate">{album.coupleName}</h4>
                          </div>
                        </div>

                        {/* Validity & Metrics Box */}
                        <div className="p-4 space-y-3">
                          {/* Expiry Pill */}
                          <div
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
                              isExpired
                                ? 'bg-red-950/40 border-red-500/40 text-red-300'
                                : isExpiringSoon
                                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                                : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Expires on: {formatDisplayDate(album.expiresAt)}</span>
                            </div>
                            <span className="font-bold">
                              {isExpired ? 'EXPIRED' : `${daysLeft} days left`}
                            </span>
                          </div>

                          {/* 30-Day Expiry Renewal Warning & Couple Reminder */}
                          {(isExpiringSoon || isExpired) && (
                            <div className="space-y-2 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-amber-300 font-medium">
                                  {isExpired ? 'Album Expired' : `Expiring in ${daysLeft} days`}
                                </span>
                                <button
                                  onClick={() => onRenewAlbum(album.id)}
                                  className="px-2.5 py-1 rounded bg-lime-400 hover:bg-lime-300 text-black font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Renew (+1 Yr for {pointSettings.renewalPointsPerAlbum} Pt)</span>
                                </button>
                              </div>

                              <a
                                href={`https://wa.me/${album.clientPhone ? album.clientPhone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(
                                  `Namaste ${album.coupleName}! Aapka wedding album ${daysLeft <= 0 ? 'expire ho chuka hai' : `agle ${daysLeft} dino mein expire hone wala hai`}. Kripya renewal ya query ke liye humare studio (${photographer.studioName}) se sampark karein.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-emerald-300 text-[10px] flex items-center justify-center gap-1 transition-colors"
                              >
                                <MessageCircle className="w-3 h-3 text-emerald-400" />
                                <span>Send WhatsApp Reminder to Couple</span>
                              </a>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-neutral-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                              <span>{formatDisplayDate(album.eventDate)}</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-lime-400">
                              <Eye className="w-3.5 h-3.5" />
                              <span>{album.viewsCount} Views</span>
                            </div>
                          </div>

                          {/* Unguessable Client Link Widget */}
                          <div className="p-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800/80 flex items-center justify-between text-xs">
                            <div className="truncate mr-2">
                              <p className="text-[10px] text-neutral-500">Unguessable Client Link</p>
                              <span className="font-mono text-neutral-300">{album.shareCode}</span>
                            </div>
                            <button
                              onClick={() => handleCopyLink(album.shareCode)}
                              className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-lime-400 hover:text-black text-neutral-300 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedCode === album.shareCode ? 'Copied!' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons: Open 3D Book, QR, WhatsApp Share */}
                      <div className="p-4 pt-0 grid grid-cols-4 gap-2">
                        <button
                          onClick={() => onViewAlbum(album)}
                          className="col-span-2 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-black text-xs font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-[0_0_12px_rgba(163,230,53,0.2)]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open 3D Book</span>
                        </button>

                        <button
                          onClick={() => setQrModalAlbum(album)}
                          className="py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-lime-400/50 text-neutral-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title="Show Wedding QR Code"
                        >
                          <QrCode className="w-3.5 h-3.5 text-lime-400" />
                          <span>QR</span>
                        </button>

                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `✨ View ${album.coupleName}'s 3D Wedding Album: ${window.location.origin}/#album-${album.shareCode}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-emerald-400 text-emerald-400 text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          title="Share Album Link on WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE ALBUM WIZARD */}
        {activeTab === 'create' && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Create New Digital Wedding Album</h3>
                <p className="text-xs text-neutral-400">
                  Will use <span className="text-lime-400 font-bold">{pointSettings.pointsPerAlbum} Points</span> from your studio wallet (Valid for 365 Days)
                </p>
              </div>
              <span className="text-xs font-mono bg-lime-950/40 border border-lime-500/40 text-lime-400 px-3 py-1 rounded-full">
                Wallet: {photographer.points} Pts Available
              </span>
            </div>

            {errorNotice && (
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center justify-between">
                <span>{errorNotice}</span>
                <button onClick={() => setErrorNotice(null)} className="text-red-400 hover:text-white">
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handlePublishAlbum} className="space-y-6">
              {/* Event & Client Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                  01. Event & Couple Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-neutral-400 mb-1 block">Event Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Royal Palace Wedding"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 mb-1 block">Couple Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Aarav & Meera"
                      value={coupleName}
                      onChange={(e) => setCoupleName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 mb-1 block">Client Mobile / WhatsApp *</label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400 mb-1 block">Event Date *</label>
                    <input
                      type="date"
                      required
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-xs text-neutral-200 focus:border-lime-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Parallel Canvas Compression Upload Section */}
              <div className="space-y-4 pt-4 border-t border-neutral-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                      02. Upload Album Pages (Fast Parallel Compression)
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      High-resolution quality preserved at 2560px luxury print resolution while saving up to 75% file storage.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-neutral-400">
                    {uploadedPages.length} {uploadedPages.length === 1 ? 'Page' : 'Pages'} Ready
                  </span>
                </div>

                <div className="border-2 border-dashed border-neutral-700 hover:border-lime-400/60 rounded-2xl p-6 text-center transition-colors bg-neutral-900/40 relative">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    disabled={isCompressing}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                    <div className="w-12 h-12 rounded-full bg-lime-950/40 border border-lime-400/40 text-lime-400 flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-white">
                      Click or drag and drop wedding album photos here
                    </p>
                    <p className="text-xs text-neutral-500">
                      Supports JPG, PNG, WEBP · Auto-compressed in parallel
                    </p>
                  </div>
                </div>

                {isCompressing && compressionProgress && (
                  <div className="p-4 rounded-xl bg-neutral-900 border border-lime-400/30 space-y-2 animate-pulse">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-lime-300 font-medium">
                        Optimizing {compressionProgress.completed} of {compressionProgress.total} photos...
                      </span>
                      <span className="font-mono text-lime-400">
                        {compressionProgress.percentageSaved}% Saved (
                        {Math.round(
                          (compressionProgress.originalTotalKb - compressionProgress.compressedTotalKb) / 1024
                        )}{' '}
                        MB saved)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-lime transition-all duration-300"
                        style={{
                          width: `${(compressionProgress.completed / compressionProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {uploadedPages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-neutral-400 font-medium">
                      Pages Preview & Panoramic Spread Splitter:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {uploadedPages.map((page, idx) => (
                        <div
                          key={page.id}
                          className="group relative rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 aspect-[3/4]"
                        >
                          <img src={page.imageUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">
                            {idx + 1}
                          </div>

                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                            <button
                              type="button"
                              onClick={() => handleSplitPage(idx)}
                              className="px-2 py-1 rounded bg-lime-400 text-black text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              title="Split panoramic double spread into 2 single pages"
                            >
                              <Split className="w-3 h-3" />
                              <span>Split 2x</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemovePage(idx)}
                              className="p-1 rounded bg-red-600 text-white text-[10px] cursor-pointer"
                              title="Remove page"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Music Selection */}
              <div className="space-y-3 pt-4 border-t border-neutral-900">
                <h4 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                  03. Background Calm Music (First-Tap Autoplay)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {audioEngine.tracks.map((t) => (
                    <label
                      key={t.id}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${
                        musicTrack === t.id
                          ? 'bg-neutral-900 border-lime-400 text-white'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="music"
                        checked={musicTrack === t.id}
                        onChange={() => setMusicTrack(t.id)}
                        className="accent-lime-400"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">{t.title}</p>
                        <p className="text-[10px] text-neutral-500">{t.genre}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] text-neutral-400 mb-1 block">
                    Custom MP3 / Audio Stream URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/romantic-track.mp3"
                    value={customMusicUrl}
                    onChange={(e) => setCustomMusicUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-xs text-white placeholder:text-neutral-500 focus:border-lime-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Security, Watermark & Bulk Download Controls */}
              <div className="space-y-4 pt-4 border-t border-neutral-900">
                <h4 className="text-xs font-bold text-lime-400 uppercase tracking-wider">
                  04. Privacy, Watermark & Client Download Controls
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Bulk Download (DEFAULT OFF) */}
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Client Bulk ZIP Download</span>
                      <input
                        type="checkbox"
                        checked={allowBulkDownload}
                        onChange={(e) => setAllowBulkDownload(e.target.checked)}
                        className="accent-lime-400 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    <p className="text-[10px] text-neutral-400">
                      Default is <strong>OFF</strong> to protect studio deliverables until final payment.
                    </p>
                  </div>

                  {/* Password Protection */}
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Password PIN Barrier</span>
                      <input
                        type="checkbox"
                        checked={isPasswordProtected}
                        onChange={(e) => setIsPasswordProtected(e.target.checked)}
                        className="accent-lime-400 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    {isPasswordProtected && (
                      <input
                        type="text"
                        placeholder="PIN Code (e.g. 2026)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs text-white focus:outline-none"
                      />
                    )}
                  </div>

                  {/* Watermark Overlay */}
                  <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Studio Watermark Overlay</span>
                      <input
                        type="checkbox"
                        checked={isWatermarked}
                        onChange={(e) => setIsWatermarked(e.target.checked)}
                        className="accent-lime-400 w-4 h-4 cursor-pointer"
                      />
                    </div>
                    {isWatermarked && (
                      <input
                        type="text"
                        placeholder="Watermark Text"
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-xs text-white focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isCompressing}
                  className="w-full py-4 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-extrabold text-sm transition-all shadow-[0_0_25px_rgba(163,230,53,0.35)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Deduct {pointSettings.pointsPerAlbum} Points & Publish 1-Year Valid Wedding Album</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: CLIENT INQUIRIES INBOX */}
        {activeTab === 'inquiries' && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">Client Booking Inquiries</h3>
                <p className="text-xs text-neutral-400">
                  Leads generated directly from clients and wedding guests viewing your 3D digital albums.
                </p>
              </div>
              <span className="text-xs font-mono text-lime-400">{studioInquiries.length} Active Leads</span>
            </div>

            {studioInquiries.length === 0 ? (
              <p className="text-xs text-neutral-500 py-8 text-center">No inquiries received yet.</p>
            ) : (
              <div className="divide-y divide-neutral-900">
                {studioInquiries.map((inq) => (
                  <div key={inq.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{inq.clientName}</span>
                        <span className="text-[10px] text-lime-400 border border-lime-500/30 px-2 py-0.5 rounded-full">
                          {inq.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 font-mono">
                        Phone: {inq.clientPhone} · {inq.clientEmail || 'No email'} · {inq.createdAt}
                      </p>
                      <p className="text-xs text-neutral-300 italic">"{inq.message}"</p>
                    </div>

                    <div className="shrink-0">
                      <a
                        href={`https://wa.me/${inq.clientPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `Hello ${inq.clientName}! Thank you for inquiring about ${photographer.studioName}. I would love to share our wedding packages and date availability with you.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Reply on WhatsApp</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QR Code Modal */}
        {qrModalAlbum && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Wedding Album QR Code</span>
                <button onClick={() => setQrModalAlbum(null)} className="text-neutral-400 hover:text-white">
                  ✕
                </button>
              </div>

              <div className="w-48 h-48 bg-white p-3 rounded-2xl mx-auto flex items-center justify-center border-4 border-lime-400">
                <QrCode className="w-40 h-40 text-black" />
              </div>

              <div>
                <h4 className="text-sm font-bold text-white">{qrModalAlbum.coupleName}</h4>
                <p className="text-xs text-neutral-400">
                  Print this QR code on wedding dinner table cards and thank-you notes for instant guests access.
                </p>
              </div>

              <button
                onClick={() => setQrModalAlbum(null)}
                className="w-full py-2 rounded-full bg-lime-400 text-black font-semibold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
