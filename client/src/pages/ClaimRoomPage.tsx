import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Send,
  ShieldCheck,
  MessageSquare,
  Truck,
  Ban,
  MapPin,
  Lock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ChatMessage, ClaimRoomData } from '../types';
import { ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import { DeliveryPanel } from '../components/DeliveryPanel';
import { formatTimeOnly } from '../lib/persian';

export const ClaimRoomPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, meta, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ClaimRoomData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'delivery'>('chat');

  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const loadClaim = useCallback(async () => {
    if (!id || !user) return;
    try {
      const data = await apiFetch<{ claim: ClaimRoomData }>(`/api/claims/${id}`);
      setClaim(data.claim);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری پرونده');
    }
  }, [id, user]);

  const loadMessages = useCallback(async () => {
    if (!id || !user) return;
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/claims/${id}/messages`);
      setMessages(data.messages);
    } catch {
      // handled by loadClaim error if unauthorized
    }
  }, [id, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { state: { from: `/claims/${id}` }, replace: true });
      return;
    }
    if (user && id) {
      setLoading(true);
      Promise.all([loadClaim(), loadMessages()]).finally(() => setLoading(false));
    }
  }, [authLoading, user, id, navigate, loadClaim, loadMessages]);

  // Live poll chat messages & delivery status every 4 seconds
  useEffect(() => {
    if (!user || !id || error) return;
    const t = setInterval(() => {
      void loadMessages();
      void loadClaim();
    }, 4500);
    return () => clearInterval(t);
  }, [user, id, error, loadMessages, loadClaim]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !msgText.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch<{ message: ChatMessage }>(`/api/claims/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: msgText.trim() }),
      });
      setMessages((prev) => [...prev, res.message]);
      setMsgText('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در ارسال پیام', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleBlockPeer = async () => {
    if (!claim) return;
    if (!window.confirm('آیا از مسدودسازی طرف مقابل اطمینان دارید؟ پس از مسدودسازی امکان ارسال پیام متوقف می‌شود.')) {
      return;
    }
    try {
      const res = await apiFetch<{ message: string }>('/api/safety/block', {
        method: 'POST',
        body: JSON.stringify({ claimId: claim.id, reason: 'مسدودسازی از صفحه گفت‌وگو' }),
      });
      showToast(res.message, 'success');
      await loadClaim();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'خطا در مسدودسازی', 'error');
    }
  };

  if (authLoading || loading) return <LoadingSkeleton rows={3} />;
  if (error || !claim) {
    return (
      <div className="space-y-4">
        <PageHeader title="پرونده تحویل" backTo="/requests" />
        <ErrorState message={error || 'پرونده یافت نشد.'} onRetry={loadClaim} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ارتباط امن و تحویل"
        subtitle={`${claim.item.title} · ${claim.myRole === 'finder' ? 'نقش شما: یابنده' : 'نقش شما: مالک تأییدشده'}`}
        backTo="/requests"
        action={
          !claim.isBlocked ? (
            <button
              type="button"
              onClick={handleBlockPeer}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-white border border-neutral-200 hover:border-red-500 text-neutral-600 hover:text-red-600 px-3 py-2 rounded-xl"
            >
              <Ban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مسدودسازی کاربر</span>
            </button>
          ) : undefined
        }
      />

      {/* Verified Item Banner (Now with FULL unblurred photo!) */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-3.5 flex items-center gap-3.5 shadow-sm">
        <img
          src={claim.item.imageUrl}
          alt={claim.item.title}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-neutral-200 shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5" />
              مالکیت تأییدشده
            </span>
            <span className="text-[11px] text-neutral-500">{claim.item.categoryLabel}</span>
          </div>
          <h2 className="text-sm sm:text-base font-extrabold text-[#0A0A0A] truncate">
            {claim.item.title}
          </h2>
          <div className="text-xs text-neutral-600 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#CA8A04]" />
              {claim.item.areaName}
            </span>
            <span>
              طرف مقابل: <strong>{claim.peerName}</strong> (شماره موبایل مخفی است)
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="grid grid-cols-2 gap-2 bg-white p-1.5 rounded-2xl border border-neutral-200 lg:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
            activeTab === 'chat' ? 'bg-[#0A0A0A] text-[#FACC15]' : 'text-neutral-600'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          گفت‌وگوی داخلی
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('delivery')}
          className={`py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
            activeTab === 'delivery' ? 'bg-[#0A0A0A] text-[#FACC15]' : 'text-neutral-600'
          }`}
        >
          <Truck className="w-4 h-4" />
          تحویل و رسید دیجیتال
        </button>
      </div>

      {/* Split Layout on Desktop / Tabbed on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Internal Chat Column */}
        <div
          className={`lg:col-span-6 bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm flex flex-col h-[560px] ${
            activeTab === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="bg-[#0A0A0A] text-white px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#FACC15]" />
              <span className="text-sm font-bold">گفت‌وگوی داخلی امن با {claim.peerName}</span>
            </div>
            <span className="text-[11px] text-neutral-300 inline-flex items-center gap-1">
              <Lock className="w-3 h-3 text-[#FACC15]" />
              بدون شماره تلفن
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F7F7F5]">
            {messages.map((m) =>
              m.isSystem ? (
                <div
                  key={m.id}
                  className="bg-[#FEFCE8] border border-[#FDE047] text-neutral-800 text-xs rounded-2xl px-4 py-2.5 text-center leading-6"
                >
                  {m.body}
                </div>
              ) : (
                <div
                  key={m.id}
                  className={`flex ${m.isMine ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-xs ${
                      m.isMine
                        ? 'bg-[#0A0A0A] text-white rounded-tr-sm'
                        : 'bg-white border border-neutral-200 text-[#0A0A0A] rounded-tl-sm'
                    }`}
                  >
                    {!m.isMine && (
                      <div className="text-[11px] font-bold text-[#CA8A04] mb-0.5">
                        {m.senderName}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div
                      className={`text-[10px] mt-1 ${
                        m.isMine ? 'text-neutral-400' : 'text-neutral-400'
                      }`}
                    >
                      {formatTimeOnly(m.createdAt)}
                    </div>
                  </div>
                </div>
              )
            )}
            <div ref={chatEndRef} />
          </div>

          {claim.isBlocked ? (
            <div className="p-4 bg-red-50 border-t border-red-200 text-xs font-bold text-red-800 text-center">
              به دلیل مسدودسازی، امکان ارسال پیام در این گفت‌وگو بسته شده است.
            </div>
          ) : (
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-neutral-200 flex gap-2">
              <input
                type="text"
                maxLength={1000}
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder="پیام خود را بنویسید (بدون شماره تلفن یا نشانی)..."
                className="flex-1 bg-neutral-50 border border-neutral-300 focus:border-[#0A0A0A] focus:bg-white rounded-xl px-3.5 py-2.5 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={sending || !msgText.trim()}
                className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold px-4 py-2.5 rounded-xl shrink-0 disabled:opacity-50 inline-flex items-center gap-1.5"
                aria-label="ارسال پیام"
              >
                <Send className="w-4 h-4" />
                <span className="text-xs sm:text-sm">ارسال</span>
              </button>
            </form>
          )}
        </div>

        {/* Delivery Coordination + Digital Receipt Column */}
        <div
          className={`lg:col-span-6 ${
            activeTab === 'delivery' ? 'block' : 'hidden lg:block'
          }`}
        >
          <DeliveryPanel
            claim={claim}
            safePoints={meta?.safePoints || []}
            advisoryText={meta?.rules.deliverySecurityAdvisory || ''}
            onUpdated={async () => {
              await Promise.all([loadClaim(), loadMessages()]);
            }}
          />
        </div>
      </div>
    </div>
  );
};
