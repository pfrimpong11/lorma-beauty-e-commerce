import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pages from '@/content/pages.json';
export type ReferencePage = {file: string; title: string; bodyClass: string; styles: {href: string; media: string}[]};
export const referencePages = pages as Record<string, ReferencePage>;
export async function getContent(route: string) {
  const page = referencePages[route];
  if (!page) return null;
  const base = path.join(process.cwd(), 'src', 'content', page.file);
  const [html, css] = await Promise.all([readFile(base + '.html', 'utf8'), readFile(base + '.css', 'utf8')]);
  return {...page, html, css};
}
