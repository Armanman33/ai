import fs from 'node:fs';
import path from 'node:path';
import { Request, Response, Router } from 'express';
import {
  CATEGORIES,
  CATEGORY_BY_SLUG,
  CATEGORY_MAP,
  CLIENT_DIST_DIR,
  CONFIG,
  ItemCategory,
  SAFE_POINT_ONLY_CATEGORIES,
} from '../config.js';
import { getDb, nowIso } from '../db/database.js';
import { runLifecycleSweep } from '../services/lifecycleService.js';

export const HOME_FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'چی‌کجا در چه شهرهایی فعال است؟',
    answer:
      'سامانه چی‌کجا به‌صورت تخصصی و مکان‌محور برای محدوده شهر تهران طراحی شده است و محله‌ها، میادین و ایستگاه‌های متروی تهران را پوشش می‌دهد.',
  },
  {
    question: 'چگونه از تحویل شیء به مالک واقعی اطمینان حاصل می‌شود؟',
    answer:
      'یابنده هنگام ثبت شیء دقیقاً ۳ پرسش محرمانه با پاسخ مخفی تعریف می‌کند. تصاویر پیش از تأیید به‌صورت تار نمایش داده می‌شوند و هر کاربر حداکثر ۳ فرصت پاسخ‌گویی روی هر آگهی دارد.',
  },
  {
    question: 'آیا شماره تماس یا نشانی منزل من به کاربر مقابل نمایش داده می‌شود؟',
    answer:
      'خیر. شماره موبایل فقط برای ورود و اطلاع‌رسانی استفاده می‌شود و هرگز برای کاربر مقابل نمایش داده نمی‌شود. هماهنگی فقط در گفت‌وگوی داخلی انجام می‌شود و ارسال شماره تماس در چت مسدود است.',
  },
  {
    question: 'روش‌های تحویل امن در چی‌کجا چیست؟',
    answer:
      'فقط دو روش «ارسال با پیک» (با هزینه گم‌کننده و نشانی محرمانه صرفاً برای پیک مجاز) و «تحویل به نقطه امن» پشتیبانی می‌شود. تحویل مدارک شناسایی و کارت بانکی منحصراً در نقاط امن انجام می‌گیرد و قرار حضوری وجود ندارد.',
  },
  {
    question: 'مدت اعتبار آگهی‌ها و هشدارهای گم‌شدن چقدر است؟',
    answer:
      'آگهی اشیای پیدا‌شده ۳ روز و هشدار اشیای گمشده ۵ روز اعتبار دارد. پیش از انقضا اعلان ارسال می‌شود و پس از انقضا نیز امکان ثبت مجدد وجود دارد.',
  },
];

const PRIVATE_ROUTE_TITLES: Record<string, string> = {
  '/auth': 'ورود و ثبت‌نام با شماره موبایل | چی‌کجا',
  '/my-ads': 'آگهی‌های ثبت‌شده من | چی‌کجا',
  '/my-alerts': 'هشدارهای گم‌شدن من | چی‌کجا',
  '/requests': 'درخواست‌های دریافتی و ارسالی | چی‌کجا',
  '/notifications': 'اعلان‌های حساب کاربری | چی‌کجا',
  '/profile': 'پروفایل و تنظیمات امنیتی | چی‌کجا',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function resolveSiteUrl(req: Request): string {
  if (process.env.PUBLIC_SITE_URL && process.env.PUBLIC_SITE_URL.trim()) {
    return CONFIG.PUBLIC_SITE_URL;
  }
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
  const host = req.get('host');
  if (host) {
    return `${proto}://${host}`;
  }
  return CONFIG.PUBLIC_SITE_URL;
}

function getIndexableFoundItems(): Array<{ id: string; updated_at: string; title: string; area_name: string }> {
  runLifecycleSweep();
  const db = getDb();
  const nowStr = nowIso();
  // PRIVACY RULE: Only active, non-expired, non-demo, non-sensitive found items are eligible for sitemap/indexing
  return db
    .prepare(`
      SELECT fi.id, fi.updated_at, fi.title, fi.area_name
      FROM found_items fi
      JOIN users u ON u.id = fi.finder_id
      WHERE fi.status = 'active'
        AND fi.expires_at > ?
        AND fi.is_demo = 0
        AND fi.category NOT IN ('id_documents', 'bank_cards')
        AND u.is_suspended = 0
      ORDER BY fi.created_at DESC
      LIMIT 500
    `)
    .all(nowStr) as Array<{ id: string; updated_at: string; title: string; area_name: string }>;
}

function buildStaticUrls(siteUrl: string): Array<{ loc: string; changefreq: string; priority: string }> {
  const urls = [
    { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${siteUrl}/lost`, changefreq: 'hourly', priority: '0.9' },
    { loc: `${siteUrl}/found`, changefreq: 'weekly', priority: '0.8' },
  ];
  for (const cat of CATEGORIES) {
    urls.push({
      loc: `${siteUrl}/category/${cat.slug}`,
      changefreq: 'daily',
      priority: '0.8',
    });
  }
  return urls;
}

function renderUrlSetXml(
  entries: Array<{ loc: string; lastmod?: string; changefreq?: string; priority?: string }>
): string {
  const body = entries
    .map((u) => {
      const parts = [`    <loc>${escapeXml(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${escapeXml(u.lastmod)}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${escapeXml(u.changefreq)}</changefreq>`);
      if (u.priority) parts.push(`    <priority>${escapeXml(u.priority)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const seoRouter = Router();

/**
 * Dynamic robots.txt — allows public discovery pages and explicitly blocks private & API paths
 */
seoRouter.get('/robots.txt', (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const lines = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /auth',
    'Disallow: /my-ads',
    'Disallow: /my-alerts',
    'Disallow: /requests',
    'Disallow: /claims/',
    'Disallow: /notifications',
    'Disallow: /profile',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(lines.join('\n'));
});

/**
 * Primary XML Sitemap (public static + category pages + active non-demo non-sensitive found items)
 */
seoRouter.get('/sitemap.xml', (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const today = new Date().toISOString().slice(0, 10);
  const staticEntries = buildStaticUrls(siteUrl).map((u) => ({ ...u, lastmod: today }));
  const itemEntries = getIndexableFoundItems().map((it) => ({
    loc: `${siteUrl}/items/${encodeURIComponent(it.id)}`,
    lastmod: it.updated_at.slice(0, 10),
    changefreq: 'daily',
    priority: '0.6',
  }));

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(renderUrlSetXml([...staticEntries, ...itemEntries]));
});

/**
 * Future-ready Sitemap Index splitting static pages vs dynamic item pages
 */
seoRouter.get('/sitemap-index.xml', (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${escapeXml(`${siteUrl}/sitemap-static.xml`)}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${escapeXml(`${siteUrl}/sitemap-items.xml`)}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>
`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(xml);
});

seoRouter.get('/sitemap-static.xml', (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(renderUrlSetXml(buildStaticUrls(siteUrl).map((u) => ({ ...u, lastmod: today }))));
});

seoRouter.get('/sitemap-items.xml', (req, res) => {
  const siteUrl = resolveSiteUrl(req);
  const itemEntries = getIndexableFoundItems().map((it) => ({
    loc: `${siteUrl}/items/${encodeURIComponent(it.id)}`,
    lastmod: it.updated_at.slice(0, 10),
    changefreq: 'daily',
    priority: '0.6',
  }));
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(renderUrlSetXml(itemEntries));
});

/**
 * Optional Google Search Console HTML file verification (only active when GOOGLE_SITE_VERIFICATION_FILE is configured)
 */
seoRouter.get('/google:token.html', (req, res, next) => {
  const expectedFile = (process.env.GOOGLE_SITE_VERIFICATION_FILE || '').trim();
  const requestedFile = `google${String(req.params.token || '')}.html`;
  if (!expectedFile || requestedFile !== expectedFile) {
    next();
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`google-site-verification: ${escapeHtml(expectedFile)}`);
});

interface PageSeoDescriptor {
  status: number;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogType: 'website' | 'article';
  jsonLd: unknown[];
  isPrivate: boolean;
  fallbackHtml: string;
}

function buildFallbackShell(heading: string, lead: string, extraHtml = ''): string {
  const catLinks = CATEGORIES.map(
    (c) => `<li><a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.label)} در تهران</a></li>`
  ).join('');

  return `<div dir="rtl" lang="fa-IR" style="font-family:Vazirmatn,Tahoma,sans-serif;max-width:860px;margin:0 auto;padding:24px;color:#111;background:#F7F7F5;">
    <header style="background:#0A0A0A;color:#fff;padding:14px 18px;border-radius:14px;margin-bottom:20px;">
      <a href="/" style="color:#FACC15;font-weight:900;text-decoration:none;font-size:18px;">چی‌کجا — سامانه اشیای گمشده شهر تهران</a>
      <nav aria-label="منوی اصلی" style="margin-top:8px;">
        <a href="/lost" style="color:#fff;margin-left:16px;">گم کرده‌ام (جست‌وجو در تهران)</a>
        <a href="/found" style="color:#fff;margin-left:16px;">پیدا کرده‌ام (ثبت شیء)</a>
      </nav>
    </header>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(lead)}</p>
      ${extraHtml}
    </main>
    <footer style="margin-top:32px;border-top:1px solid #ddd;padding-top:16px;">
      <h2>دسته‌بندی اشیای گمشده در تهران</h2>
      <ul>${catLinks}</ul>
    </footer>
  </div>`;
}

function resolvePageSeo(req: Request, siteUrl: string): PageSeoDescriptor {
  const pathname = req.path;

  // 1. Home page
  if (pathname === '/') {
    const title = 'چی‌کجا | سامانه اشیای گمشده و پیدا‌شده شهر تهران';
    const description =
      'چی‌کجا سامانه مکان‌محور و امن یافتن اشیای گمشده و ثبت وسایل پیدا‌شده در تهران است؛ بدون افشای شماره تماس، با احراز مالکیت ۳ پرسشی و تحویل امن با پیک یا نقطه امن.';

    const faqHtml = `<section><h2>پرسش‌های متداول درباره چی‌کجا</h2>${HOME_FAQS.map(
      (f) => `<article><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></article>`
    ).join('')}</section>`;

    return {
      status: 200,
      title,
      description,
      canonical: `${siteUrl}/`,
      robots: 'index, follow',
      ogType: 'website',
      isPrivate: false,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'چی‌کجا',
          alternateName: 'ChikojA',
          url: `${siteUrl}/`,
          inLanguage: 'fa-IR',
          description,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${siteUrl}/lost?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'چی‌کجا',
          url: `${siteUrl}/`,
          logo: `${siteUrl}/favicon.svg`,
          areaServed: {
            '@type': 'City',
            name: 'تهران',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: HOME_FAQS.map((f) => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: f.answer,
            },
          })),
        },
      ],
      fallbackHtml: buildFallbackShell('اشیای گمشده خود را در تهران، سریع و امن پیدا کنید', description, faqHtml),
    };
  }

  // 2. Lost search page
  if (pathname === '/lost') {
    const title = 'گم کرده‌ام | جست‌وجوی اشیای گمشده در تهران — چی‌کجا';
    const description =
      'اشیای پیدا‌شده در محله‌ها و ایستگاه‌های متروی تهران را روی نقشه جست‌وجو کنید یا هشدار ۵ روزه ثبت نمایید. احراز مالکیت با ۳ پرسش محرمانه در چی‌کجا.';
    return {
      status: 200,
      title,
      description,
      canonical: `${siteUrl}/lost`,
      robots: 'index, follow',
      ogType: 'website',
      isPrivate: false,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'چی‌کجا', item: `${siteUrl}/` },
            { '@type': 'ListItem', position: 2, name: 'گم کرده‌ام', item: `${siteUrl}/lost` },
          ],
        },
      ],
      fallbackHtml: buildFallbackShell('جست‌وجوی اشیای گمشده در شهر تهران', description),
    };
  }

  // 3. Found registration page
  if (pathname === '/found') {
    const title = 'پیدا کرده‌ام | ثبت سریع شیء پیدا شده در تهران — چی‌کجا';
    const description =
      'وسیله‌ای در تهران پیدا کرده‌اید؟ در کمتر از یک دقیقه بدون نمایش شماره تماس و با ۳ پرسش محرمانه آن را در چی‌کجا ثبت کنید و امن با پیک یا نقطه امن تحویل دهید.';
    return {
      status: 200,
      title,
      description,
      canonical: `${siteUrl}/found`,
      robots: 'index, follow',
      ogType: 'website',
      isPrivate: false,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'چی‌کجا', item: `${siteUrl}/` },
            { '@type': 'ListItem', position: 2, name: 'پیدا کرده‌ام', item: `${siteUrl}/found` },
          ],
        },
      ],
      fallbackHtml: buildFallbackShell('ثبت شیء پیدا شده در تهران', description),
    };
  }

  // 4. Category landing pages (/category/:slug)
  const catMatch = pathname.match(/^\/category\/([a-z0-9-]+)$/);
  if (catMatch) {
    const cat = CATEGORY_BY_SLUG.get(catMatch[1]);
    if (!cat) {
      return buildNotFoundSeo(siteUrl, pathname);
    }
    const db = getDb();
    const activeCount = (
      db
        .prepare(`
          SELECT COUNT(*) AS cnt FROM found_items
          WHERE category = ? AND status = 'active' AND expires_at > ? AND is_demo = 0
        `)
        .get(cat.id, nowIso()) as { cnt: number }
    ).cnt;

    const canonical = `${siteUrl}/category/${cat.slug}`;
    const deliveryRuleNote = cat.safePointOnly
      ? 'برای حفظ امنیت، تحویل این دسته منحصراً از طریق نقاط امن معتبر تهران انجام می‌شود.'
      : 'تحویل پس از تأیید مالکیت از طریق ارسال با پیک یا نقاط امن تهران و با کد یک‌بارمصرف انجام می‌شود.';

    return {
      status: 200,
      title: cat.seoTitle,
      description: cat.seoDescription,
      canonical,
      robots: 'index, follow',
      ogType: 'website',
      isPrivate: false,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `${cat.label} گمشده و پیدا‌شده در تهران`,
          description: cat.seoDescription,
          url: canonical,
          inLanguage: 'fa-IR',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'چی‌کجا', item: `${siteUrl}/` },
            { '@type': 'ListItem', position: 2, name: cat.label, item: canonical },
          ],
        },
      ],
      fallbackHtml: buildFallbackShell(
        `${cat.label} گمشده و پیدا‌شده در تهران`,
        `${cat.seoIntro} ${deliveryRuleNote}`,
        `<p>تعداد آگهی‌های فعال فعلی در تهران: ${activeCount}</p><p><a href="/lost">جست‌وجو روی نقشه تهران</a> | <a href="/found">ثبت شیء پیدا شده</a></p>`
      ),
    };
  }

  // 5. Individual item page (/items/:id) with STRICT PRIVACY CONTROLS
  const itemMatch = pathname.match(/^\/items\/([^/]+)$/);
  if (itemMatch) {
    const itemId = decodeURIComponent(itemMatch[1]);
    const db = getDb();
    const item = db
      .prepare(`
        SELECT fi.id, fi.title, fi.category, fi.area_name, fi.found_at, fi.status, fi.expires_at, fi.is_demo
        FROM found_items fi
        WHERE fi.id = ? AND fi.status != 'removed'
      `)
      .get(itemId) as
      | {
          id: string;
          title: string;
          category: ItemCategory;
          area_name: string;
          found_at: string;
          status: string;
          expires_at: string;
          is_demo: number;
        }
      | undefined;

    if (!item) {
      return buildNotFoundSeo(siteUrl, pathname);
    }

    const isSensitive = SAFE_POINT_ONLY_CATEGORIES.has(item.category);
    const isActivePublic =
      item.status === 'active' &&
      item.expires_at > nowIso() &&
      item.is_demo === 0 &&
      !isSensitive;

    const canonical = `${siteUrl}/items/${encodeURIComponent(item.id)}`;

    if (!isActivePublic) {
      // STRICT PRIVACY: Sensitive items (ID docs, bank cards), demo items, and non-active items are NEVER indexed
      return {
        status: 200,
        title: 'بررسی و اثبات مالکیت آگهی | چی‌کجا',
        description:
          'بررسی و اثبات مالکیت شیء پیدا‌شده در تهران با ۳ پرسش محرمانه در سامانه امن چی‌کجا.',
        canonical,
        robots: 'noindex, nofollow, noarchive',
        ogType: 'website',
        isPrivate: true,
        jsonLd: [],
        fallbackHtml: buildFallbackShell(
          'بررسی و اثبات مالکیت در چی‌کجا',
          'برای حفاظت از حریم خصوصی، اطلاعات این آگهی فقط درون سامانه و پس از احراز مالکیت قابل مشاهده است.'
        ),
      };
    }

    const catMeta = CATEGORY_MAP.get(item.category);
    const title = `${item.title} — محدوده ${item.area_name} تهران | چی‌کجا`;
    const description = `شیء پیدا‌شده در دسته «${catMeta?.label || item.category}» در محدوده ${item.area_name} تهران. اگر مالک این شیء هستید، از طریق ۳ پرسش محرمانه در چی‌کجا مالکیت خود را تأیید کنید.`;

    return {
      status: 200,
      title,
      description,
      canonical,
      robots: 'index, follow',
      ogType: 'article',
      isPrivate: false,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'چی‌کجا', item: `${siteUrl}/` },
            ...(catMeta
              ? [
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: catMeta.label,
                    item: `${siteUrl}/category/${catMeta.slug}`,
                  },
                  { '@type': 'ListItem', position: 3, name: item.title, item: canonical },
                ]
              : [{ '@type': 'ListItem', position: 2, name: item.title, item: canonical }]),
          ],
        },
      ],
      fallbackHtml: buildFallbackShell(
        item.title,
        description,
        `<p>محدوده تقریبی: ${escapeHtml(item.area_name)}، تهران — تصویر کامل و جزئیات صرفاً پس از تأیید مالکیت قابل مشاهده است.</p>`
      ),
    };
  }

  // 6. Private / Authenticated routes (STRICT noindex, nofollow, noarchive)
  if (PRIVATE_ROUTE_TITLES[pathname] || pathname.startsWith('/claims/')) {
    const title = PRIVATE_ROUTE_TITLES[pathname] || 'گفت‌وگوی داخلی و هماهنگی تحویل | چی‌کجا';
    return {
      status: 200,
      title,
      description: 'بخش کاربری اختصاصی در سامانه چی‌کجا تهران.',
      canonical: `${siteUrl}${pathname}`,
      robots: 'noindex, nofollow, noarchive',
      ogType: 'website',
      isPrivate: true,
      jsonLd: [],
      fallbackHtml: buildFallbackShell('بخش کاربری چی‌کجا', 'برای دسترسی به این صفحه لطفاً وارد حساب کاربری خود شوید.'),
    };
  }

  // 7. Real HTTP 404 for unknown routes (prevents Soft-404 indexing problems!)
  return buildNotFoundSeo(siteUrl, pathname);
}

function buildNotFoundSeo(siteUrl: string, pathname: string): PageSeoDescriptor {
  return {
    status: 404,
    title: 'صفحه موردنظر یافت نشد (۴۰۴) | چی‌کجا',
    description: 'مسیر واردشده در سامانه اشیای گمشده تهران (چی‌کجا) یافت نشد.',
    canonical: `${siteUrl}${pathname}`,
    robots: 'noindex, nofollow',
    ogType: 'website',
    isPrivate: true,
    jsonLd: [],
    fallbackHtml: buildFallbackShell(
      'صفحه موردنظر یافت نشد',
      'مسیر واردشده در چی‌کجا وجود ندارد. می‌توانید به صفحه اصلی بازگردید یا در تهران جست‌وجو کنید.'
    ),
  };
}

let cachedTemplate: string | null = null;

function readHtmlTemplate(): string | null {
  const indexPath = path.join(CLIENT_DIST_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  if (CONFIG.IS_PRODUCTION && cachedTemplate) return cachedTemplate;
  const content = fs.readFileSync(indexPath, 'utf8');
  if (CONFIG.IS_PRODUCTION) cachedTemplate = content;
  return content;
}

/**
 * Serves the SPA index.html enriched with dynamic per-route SEO meta tags,
 * canonical URLs, Open Graph/Twitter cards, JSON-LD structured data,
 * semantic crawlable fallback markup, and accurate HTTP status codes (200 / 404).
 */
export function serveSeoAwareSpa(req: Request, res: Response): void {
  // Canonical trailing-slash normalization (301 permanent redirect, no redirect chains)
  if (req.path.length > 1 && req.path.endsWith('/')) {
    const normalizedPath = req.path.replace(/\/+$/, '') || '/';
    const queryIdx = req.originalUrl.indexOf('?');
    const qs = queryIdx >= 0 ? req.originalUrl.slice(queryIdx) : '';
    res.redirect(301, `${normalizedPath}${qs}`);
    return;
  }

  const template = readHtmlTemplate();
  if (!template) {
    res.status(503).send('ساخت نسخه فرانت‌اند هنوز انجام نشده است.');
    return;
  }

  const siteUrl = resolveSiteUrl(req);
  const seo = resolvePageSeo(req, siteUrl);
  const ogImageUrl = `${siteUrl}/og-chikoja.png`;

  const headTags: string[] = [
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="robots" content="${escapeHtml(seo.robots)}" />`,
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />`,
    `<meta property="og:locale" content="fa_IR" />`,
    `<meta property="og:site_name" content="چی‌کجا" />`,
    `<meta property="og:type" content="${seo.ogType}" />`,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(seo.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
  ];

  if (CONFIG.GOOGLE_SITE_VERIFICATION) {
    headTags.push(
      `<meta name="google-site-verification" content="${escapeHtml(CONFIG.GOOGLE_SITE_VERIFICATION)}" />`
    );
  }

  for (const schema of seo.jsonLd) {
    headTags.push(`<script type="application/ld+json">${safeJsonLd(schema)}</script>`);
  }

  let html = template
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '');

  if (html.includes('<!--SEO_HEAD-->')) {
    html = html.replace('<!--SEO_HEAD-->', headTags.join('\n    '));
  } else {
    html = html.replace('</head>', `    ${headTags.join('\n    ')}\n  </head>`);
  }

  // Inject lightweight semantic crawlable content inside #root (replaced immediately upon React mount)
  html = html.replace('<div id="root"></div>', `<div id="root">${seo.fallbackHtml}</div>`);

  if (seo.isPrivate) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  }

  res.status(seo.status).type('html').send(html);
}
