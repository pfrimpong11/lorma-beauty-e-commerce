import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';

const origin = 'https://jolie.vamtam.com';
const photos = ['623254672_17851451985664360_8918620865047000528', '621394569_17851451877664360_3024949931131320222', '621508323_17851451850664360_6835537026447619502', '622495585_17851451703664360_3067205235573757936', '622011456_17851451463664360_7600075987601799300'];
for (let i = 0; i < photos.length; i++) {
  const response = await fetch(`${origin}/wp-content/uploads/sb-instagram-feed-images/${photos[i]}_nfull.webp`);
  if (!response.ok) throw new Error(`Instagram image ${i}: ${response.status}`);
  await writeFile(`public/assets/jolie-instagram-${i + 1}.webp`, Buffer.from(await response.arrayBuffer()));
}
const pages = JSON.parse(await readFile('src/content/pages.json', 'utf8'));
for (const page of Object.values(pages)) {
  const file = `src/content/${page.file}.html`;
  const $ = load((await readFile(file, 'utf8')).replaceAll(`${origin}/assets/`, '/assets/'), null, false);
  $('#sbi_images .sbi_photo').each((index, el) => {
    $(el).removeAttr('data-full-res data-img-src-set').attr('style', 'aspect-ratio:1;display:block;');
    $(el).find('img').attr('src', `/assets/jolie-instagram-${index % 5 + 1}.webp`).attr('width', '640').attr('height', '640').attr('alt', 'Jolie beauty and skincare inspiration');
  });
  for (const el of $('a[href^="/wp-content/uploads/"]').toArray()) {
    const absolute = origin + $(el).attr('href');
    const name = `${createHash('sha1').update(absolute.split('?')[0]).digest('hex').slice(0, 10)}-${path.basename(new URL(absolute).pathname)}`;
    try { await access(`public/assets/${name}`); $(el).attr('href', `/assets/${name}`); } catch {}
  }
  $('img[src$="Star-orange.svg"]').attr('src', '/assets/jolie-star.svg');
  $('a[href*="/cdn-cgi/l/email-protection"]').attr('href', 'mailto:support@jolie.com');
  $('header a[href*="elementor-action"]').each((index, el) => $(el).attr('aria-label', index % 2 === 0 ? 'My account' : 'Search products'));
  $('header a').filter((_, el) => $(el).find('img').length > 0).attr('aria-label', 'Jolie home');
  $('.elementor-widget-heading .elementor-element-2346813').attr('role', 'heading').attr('aria-level', '1');
  $('.elementor-element-2346813 .elementor-heading-title').attr('role', 'heading').attr('aria-level', '1');
  await writeFile(file, $.html());
}
console.log(`Finalized ${Object.keys(pages).length} pages, gallery links and five original Instagram photographs.`);
