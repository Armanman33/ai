import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Search,
  PlusCircle,
  ShieldAlert,
  Building2,
  Truck,
  KeyRound,
  MapPin,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { usePageSeo } from '../lib/seo';
import { SearchItem } from '../types';
import { ItemCard } from '../components/ItemCard';
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/StateViews';
import { toPersianDigits } from '../lib/persian';

export const CategoryPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { meta } = useAuth();

  const categoryMeta = meta?.categories.find((c) => c.slug === slug);

  usePageSeo({
    title: categoryMeta?.seoTitle || 'دسته‌بندی اشیای گمشده در تهران | چی‌کجا',
    description:
      categoryMeta?.seoDescription ||
      'مشاهده و جست‌وجوی اشیای گمشده و پیدا‌شده در شهر تهران در سامانه امن چی‌کجا.',
    canonicalPath: categoryMeta ? `/category/${categoryMeta.slug}` : undefined,
    robots: categoryMeta ? 'index, follow' : 'noindex, nofollow',
  });

  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    if (!categoryMeta) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ items: SearchItem[] }>(
        `/api/items/search?category=${encodeURIComponent(categoryMeta.id)}`
      );
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت آگهی‌های این دسته‌بندی');
    } finally {
      setLoading(false);
    }
  }, [categoryMeta]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  if (!meta) return <LoadingSkeleton rows={3} />;

  if (!categoryMeta) {
    return (
      <div className="bg-white rounded-3xl border border-neutral-200 p-8 text-center space-y-3">
        <h1 className="text-xl font-black text-[#0A0A0A]">دسته‌بندی موردنظر یافت نشد</h1>
        <p className="text-sm text-neutral-600">این دسته‌بندی در سامانه چی‌کجا تهران وجود ندارد.</p>
        <Link
          to="/"
          className="inline-block bg-[#FACC15] text-[#0A0A0A] font-extrabold text-sm px-5 py-2.5 rounded-xl"
        >
          بازگشت به صفحه اصلی
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${categoryMeta.label} در تهران`}
        subtitle="جست‌وجو و ثبت اشیای پیدا‌شده با حفظ حریم خصوصی در چی‌کجا"
        backTo="/"
      />

      {/* Useful Persian Context & Privacy Rules for this Category */}
      <section className="bg-[#0A0A0A] text-white rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="inline-flex items-center gap-1.5 bg-white/10 text-[#FACC15] text-xs font-bold px-3 py-1 rounded-full">
          <MapPin className="w-3.5 h-3.5" />
          <span>محدوده شهر تهران</span>
        </div>

        <p className="text-sm text-neutral-200 leading-7">
          {categoryMeta.seoIntro ||
            `در این بخش می‌توانید اشیای پیدا‌شده دسته «${categoryMeta.label}» در سطح شهر تهران را بررسی کنید.`}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="bg-white/10 rounded-xl p-3 flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
            <span>احراز مالکیت با پاسخ صحیح به ۳ پرسش محرمانه (حداکثر ۳ فرصت).</span>
          </div>
          <div className="bg-white/10 rounded-xl p-3 flex items-start gap-2">
            {categoryMeta.safePointOnly ? (
              <>
                <Building2 className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                <span>تحویل این دسته صرفاً از طریق نقاط امن معتبر تهران و با رسید دیجیتال انجام می‌شود.</span>
              </>
            ) : (
              <>
                <Truck className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                <span>تحویل امن از طریق ارسال با پیک (نشانی محرمانه) یا تحویل در نقطه امن.</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <Link
            to={`/lost?category=${encodeURIComponent(categoryMeta.id)}`}
            className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-2 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>جست‌وجوی دقیق روی نقشه تهران</span>
          </Link>
          <Link
            to="/found"
            className="bg-white hover:bg-neutral-100 text-[#0A0A0A] font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl inline-flex items-center gap-2 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ثبت {categoryMeta.label} پیدا شده</span>
          </Link>
        </div>
      </section>

      {categoryMeta.sensitive && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs sm:text-sm text-amber-950">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-6">
            برای حفاظت از اطلاعات شخصی شهروندان، آگهی‌های <strong>{categoryMeta.label}</strong> در موتورهای جست‌وجو ایندکس نمی‌شوند، تصاویر آن‌ها کاملاً پوشانده می‌شوند و تحویل منحصراً از طریق نقاط امن انجام می‌گیرد.
          </p>
        </div>
      )}

      {/* Active Items in this Category */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#0A0A0A]">
            آگهی‌های فعال «{categoryMeta.label}» ({toPersianDigits(items.length)})
          </h2>
          <Link to="/lost" className="text-xs font-bold text-[#0A0A0A] underline">
            فیلتر مکانی و ثبت هشدار ۵ روزه
          </Link>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={loadItems} />
        ) : loading ? (
          <LoadingSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Search className="w-7 h-7" />}
            title={`هنوز مورد فعالی در دسته «${categoryMeta.label}» ثبت نشده است`}
            description="می‌توانید روی نقشه تهران محدوده خود را انتخاب کرده و هشدار ۵ روزه ثبت کنید تا به محض ثبت شیء مشابه مطلع شوید."
            action={
              <Link
                to="/lost"
                className="bg-[#FACC15] hover:bg-[#EAB308] text-[#0A0A0A] font-extrabold text-sm px-5 py-2.5 rounded-xl"
              >
                ثبت هشدار گم‌شدن در تهران
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Internal links to sibling Tehran categories */}
      <section className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-2.5">
        <h2 className="text-sm font-extrabold text-[#0A0A0A]">سایر دسته‌بندی‌های چی‌کجا در تهران</h2>
        <div className="flex flex-wrap gap-2">
          {meta.categories
            .filter((c) => c.id !== categoryMeta.id)
            .map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                className="text-xs font-semibold bg-neutral-100 hover:bg-[#FEF9C3] text-[#0A0A0A] px-3 py-1.5 rounded-xl transition-colors"
              >
                {c.label}
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
};
