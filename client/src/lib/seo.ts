import { useEffect } from 'react';

export interface PageSeoOptions {
  title: string;
  description: string;
  canonicalPath?: string;
  robots?: string;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

/**
 * Keeps document title, meta description, canonical URL, Open Graph, and robots
 * directives synchronized during client-side React Router navigation.
 */
export function usePageSeo({ title, description, canonicalPath, robots = 'index, follow' }: PageSeoOptions): void {
  useEffect(() => {
    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);

    if (typeof window !== 'undefined') {
      const cleanPath = canonicalPath || window.location.pathname;
      const canonicalUrl = `${window.location.origin}${cleanPath}`;
      upsertCanonical(canonicalUrl);
      upsertMeta('property', 'og:url', canonicalUrl);
    }
  }, [title, description, canonicalPath, robots]);
}
