import React from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  ShieldAlert,
  Lock,
  CheckCircle2,
  Truck,
  Building2,
  EyeOff,
} from 'lucide-react';
import { SearchItem } from '../types';
import { formatDistance, formatJalaliDateTime, formatRemainingTime } from '../lib/persian';

export const ItemCard: React.FC<{ item: SearchItem }> = ({ item }) => {
  const remaining = formatRemainingTime(item.expiresAt);

  return (
    <Link
      to={item.verifiedClaimId ? `/claims/${item.verifiedClaimId}` : `/items/${item.id}`}
      className={`block bg-white rounded-2xl border transition-all overflow-hidden group ${
        item.permanentlyBlocked
          ? 'border-red-200 opacity-75'
          : 'border-neutral-200/90 hover:border-[#0A0A0A] hover:shadow-md'
      }`}
    >
      <div className="flex gap-3.5 p-3.5">
        {/* Protected/Blurred Thumbnail */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-neutral-100 shrink-0 border border-neutral-200">
          <img
            src={item.imageUrl}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {item.imageIsBlurred && (
            <div className="absolute inset-x-0 bottom-0 bg-[#0A0A0A]/80 text-[#FACC15] text-[10px] font-semibold px-1.5 py-1 flex items-center justify-center gap-1">
              <EyeOff className="w-3 h-3 shrink-0" />
              <span>محو تا تأیید</span>
            </div>
          )}
          {item.isSensitive && (
            <span className="absolute top-1.5 right-1.5 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              حساس
            </span>
          )}
        </div>

        {/* Item Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#0A0A0A] group-hover:text-neutral-700 line-clamp-2 leading-6">
                {item.title}
              </h3>
              {item.isDemo && (
                <span className="text-[10px] font-semibold bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full shrink-0">
                  نمونه
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-neutral-600">
              <span className="inline-flex items-center gap-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#CA8A04]" />
                {item.areaName}
                {item.distanceMeters !== null && (
                  <span className="text-neutral-400">({formatDistance(item.distanceMeters)})</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                {formatJalaliDateTime(item.foundAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2 border-t border-neutral-100">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold bg-neutral-100 text-neutral-800 px-2.5 py-0.5 rounded-lg">
                {item.categoryLabel}
              </span>
              <span className="text-[11px] font-medium bg-[#FEFCE8] text-[#0A0A0A] border border-[#FDE047] px-2 py-0.5 rounded-lg inline-flex items-center gap-1">
                {item.deliveryMethod === 'safe_point' ? (
                  <>
                    <Building2 className="w-3 h-3" />
                    نقطه امن
                  </>
                ) : (
                  <>
                    <Truck className="w-3 h-3" />
                    ارسال با پیک
                  </>
                )}
              </span>
            </div>

            {item.permanentlyBlocked ? (
              <span className="text-[11px] font-bold text-red-600 inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                مسدود شده
              </span>
            ) : item.verifiedClaimId ? (
              <span className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                مالکیت تأییدشده
              </span>
            ) : item.isMine ? (
              <span className="text-[11px] font-bold text-[#0A0A0A] bg-[#FACC15] px-2 py-0.5 rounded-md">
                آگهی شما
              </span>
            ) : (
              <span
                className={`text-[11px] font-medium ${
                  remaining.nearExpiry ? 'text-amber-700' : 'text-neutral-500'
                }`}
              >
                {remaining.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {item.isSensitive && !item.verifiedClaimId && (
        <div className="bg-amber-50 border-t border-amber-200/80 px-3.5 py-1.5 text-[11px] text-amber-900 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>حفاظت اطلاعات حساس: تحویل فقط از طریق نقطه امن انجام می‌شود.</span>
        </div>
      )}
    </Link>
  );
};
