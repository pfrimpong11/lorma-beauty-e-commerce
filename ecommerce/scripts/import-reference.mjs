import { load } from 'cheerio';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// One-time migration: preserve the reference's artwork, typography and layout
// without shipping WordPress, its scripts, remote forms or tracking code.
const origin = 'https://jolie.vamtam.com';
const root = process.cwd();
await mkdir('public/assets', { recursive: true });
await mkdir('src/content', { recursive: true });
const downloads = new Map();
const errors = [];
let active = 0;
const queue = [];
async function limited(fn) {
  if (active >= 8) await new Promise(resolve => queue.push(resolve));
  active++;
  try { return await fn(); } finally { active--; queue.shift()?.(); }
}
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.text();
}
function asset(url, base = origin) {
  if (url?.startsWith('/assets/')) return Promise.resolve(url);
  if (!url || /^(data:|#|blob:)/.test(url)) return Promise.resolve(url);
  const absolute = new URL(url.replaceAll('&amp;', '&'), base).href;
  if (downloads.has(absolute)) return downloads.get(absolute);
  const task = (async () => {
    const parsed = new URL(absolute);
    const name = path.basename(parsed.pathname).replace(/[^a-zA-Z0-9._-]/g, '-');
    const filename = `${createHash('sha1').update(absolute.split('?')[0]).digest('hex').slice(0, 10)}-${name}`;
    const local = `/assets/${filename}`;
    try {
      try { await access(`public${local}`); return local; } catch {}
      const bytes = await limited(async () => {
        const response = await fetch(absolute, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`${response.status}: ${absolute}`);
        return Buffer.from(await response.arrayBuffer());
      });
      if (parsed.pathname.endsWith('.css')) {
        const css = await rewriteCss(bytes.toString(), absolute);
        await writeFile(`public${local}`, css);
      } else await writeFile(`public${local}`, bytes);
      return local;
    } catch (error) {
      errors.push(String(error));
      return absolute;
    }
  })();
  downloads.set(absolute, task);
  return task;
}
async function rewriteCss(css, base) {
  const matches = [...css.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)];
  for (const match of matches) {
    const local = await asset(match[1].trim(), base);
    css = css.replaceAll(match[0], `url("${local}")`);
  }
  return css;
}
const home = await readFile('reference.html', 'utf8');
const home$ = load(home);
const routes = new Set(['/']);
home$('a[href]').each((_, el) => {
  const href = home$(el).attr('href');
  if (!href?.startsWith(origin)) return;
  const url = new URL(href);
  if (url.search || /cdn-cgi|wp-|home-|classic|modern/.test(url.pathname)) return;
  if (/^\/(product\/|product-category\/|shop\/?$|our-|delivery|return|faq|gifts|retail-store|privacy-policy|2022\/)/.test(url.pathname)) routes.add(url.pathname);
});
const extend = process.argv.includes('--extend');
const pages = extend ? JSON.parse(await readFile('src/content/pages.json', 'utf8')) : {};
const catalog = new Map(extend ? JSON.parse(await readFile('src/content/products.json', 'utf8')).map(product => [product.id, product]) : []);
async function migrate(route) {
  try {
    const source = route === '/' ? home : await limited(() => fetchText(origin + route));
    const $ = load(source);
    const styles = [];
    for (const el of $('link[rel="stylesheet"]').toArray()) {
      styles.push({ href: await asset($(el).attr('href')), media: $(el).attr('media') || 'all' });
    }
    let inline = $('head style').map((_, el) => $(el).html()).get().join('\n');
    inline = await rewriteCss(inline, origin + route);
    const fragment = load(`<div id="migration-root">${$('header.elementor-location-header').toString()}${$('#page').toString()}${$('#scroll-to-top').toString()}</div>`, null, false);
    fragment('script, noscript, e-page-transition, iframe, link[rel="preload"]').remove();
    fragment('[data-cfemail]').each((_, el) => fragment(el).replaceWith('support@jolie.com'));
    fragment('[data-rocket-lazyload]').removeAttr('data-rocket-lazyload');
    for (const el of fragment('[data-bg]').toArray()) {
      const background = await asset(fragment(el).attr('data-bg'));
      fragment(el).attr('style', `${fragment(el).attr('style') || ''};background-image:url('${background}')`).removeAttr('data-bg');
    }
    fragment('img').each((_, el) => {
      const img = fragment(el);
      if (img.attr('data-lazy-src')) img.attr('src', img.attr('data-lazy-src'));
      if (img.attr('data-src') && !img.attr('src')?.startsWith('http')) img.attr('src', img.attr('data-src'));
      if (img.attr('data-lazy-srcset')) img.attr('srcset', img.attr('data-lazy-srcset'));
      img.removeAttr('data-lazy-src data-lazy-srcset data-lazy-sizes onload onerror');
      img.attr('loading', 'lazy');
    });
    fragment('header img').attr('loading', 'eager');
    const tasks = [];
    fragment('img, source, image').each((_, el) => {
      for (const attribute of ['src', 'srcset', 'href', 'xlink:href', 'data-src']) {
        const value = fragment(el).attr(attribute);
        if (!value || value.startsWith('data:')) continue;
        tasks.push((async () => {
          if (attribute === 'srcset') {
            const entries = await Promise.all(value.split(',').map(async entry => {
              const [url, size] = entry.trim().split(/\s+/);
              return `${await asset(url)}${size ? ' ' + size : ''}`;
            }));
            fragment(el).attr(attribute, entries.join(', '));
          } else fragment(el).attr(attribute, await asset(value));
        })());
      }
    });
    fragment('[style]').each((_, el) => tasks.push((async () => fragment(el).attr('style', await rewriteCss(fragment(el).attr('style'), origin + route)))()));
    await Promise.all(tasks);
    fragment('a[href]').each((_, el) => {
      const anchor = fragment(el);
      const href = anchor.attr('href');
      if (href.startsWith(origin)) anchor.attr('href', href.slice(origin.length) || '/');
    });
    // Include every product exposed by the category/shop pages, plus journal entries.
    fragment('#page a[href]').each((_, el) => {
      const href = fragment(el).attr('href');
      if (href && /^\/(product\/[^/?#]+\/?|20\d\d\/\d\d\/\d\d\/[^/?#]+\/?)$/.test(href) && !routes.has(href)) { routes.add(href); all.push(href); }
    });
    fragment('form').removeAttr('action').attr('data-local-form', 'true');
    fragment('li.product').each((_, el) => {
      const p = fragment(el);
      const button = p.find('[data-product_id]');
      const id = button.attr('data-product_id');
      if (!id || catalog.has(id)) return;
      catalog.set(id, { id, name: p.find('.woocommerce-loop-product__title').text().trim(), price: Number(p.find('.price bdi').first().text().replace(/[^\d.]/g, '')), image: p.find('img').first().attr('src'), href: p.find('a.woocommerce-LoopProduct-link').first().attr('href') || p.find('a').first().attr('href'), category: (p.attr('class')?.match(/product_cat-(face|body|hair)/)?.[1] || 'face') });
    });
    const slug = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replaceAll('/', '--');
    await writeFile(`src/content/${slug}.html`, fragment('#migration-root').html());
    await writeFile(`src/content/${slug}.css`, inline);
    pages[route.replace(/\/$/, '') || '/'] = { file: slug, title: $('title').text().replace(/\s*[–—|].*$/, ''), bodyClass: $('body').attr('class').replace('woocommerce-no-js', 'woocommerce-js'), styles };
    console.log(`Migrated ${route}`);
  } catch (error) { errors.push(`Page ${route}: ${error}`); }
}
// Bounded page concurrency keeps the reference server responsive.
const all = [...routes];
all.push('/home-classic-2/', '/home-modern-1/', '/home-modern-2/');
if (extend) {
  for (const page of Object.values(pages)) {
    const $ = load(await readFile(`src/content/${page.file}.html`, 'utf8'));
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (/^\/(shop\/page\/\d+\/?|product-category\/.+\/page\/\d+\/?|category\/[^/?#]+\/?|tag\/[^/?#]+\/?|20\d\d\/\d\d\/\d\d\/?|product-category\/gifts\/?)$/.test(href) && !routes.has(href)) {routes.add(href); all.push(href);}
    });
  }
  for (let i = all.length - 1; i >= 0; i--) if (pages[all[i].replace(/\/$/, '') || '/']) all.splice(i, 1);
}
for (let offset = 0; offset < all.length; offset += 4) await Promise.all(all.slice(offset, offset + 4).map(migrate));
await writeFile('src/content/pages.json', JSON.stringify(pages, null, 2));
await writeFile('src/content/products.json', JSON.stringify([...catalog.values()], null, 2));
await writeFile('src/content/asset-report.json', JSON.stringify({ assets: downloads.size, pages: Object.keys(pages).length, errors }, null, 2));
console.log(`Complete: ${Object.keys(pages).length} pages, ${downloads.size} assets, ${errors.length} failures`);
