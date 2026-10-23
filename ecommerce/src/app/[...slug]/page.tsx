import type { Metadata } from 'next';
import ReferencePage from '@/components/reference-page';
import { referencePages } from '@/lib/content';
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(referencePages).filter(route => route !== '/').map(route => ({slug: route.split('/').filter(Boolean)}));
}
export async function generateMetadata({params}: {params: Promise<{slug: string[]}>}): Promise<Metadata> {
  const {slug} = await params;
  return {title: referencePages['/' + slug.join('/')]?.title || 'Jolie'};
}
export default async function Page({params}: {params: Promise<{slug: string[]}>}) {
  const {slug} = await params;
  return <ReferencePage route={'/' + slug.join('/')} />;
}
