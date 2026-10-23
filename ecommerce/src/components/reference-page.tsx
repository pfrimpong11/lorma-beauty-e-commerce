import { getContent } from '@/lib/content';
import { notFound } from 'next/navigation';
import Storefront from './storefront';

export default async function ReferencePage({route}: {route: string}) {
  const page = await getContent(route);
  if (!page) notFound();
  return <>
    {page.styles.map((style, index) => <link key={index} rel="stylesheet" href={style.href} media={style.media} precedence={`reference-${index}`} />)}
    <style dangerouslySetInnerHTML={{__html: page.css}} />
    <div id="main-content" className="jolie-reference" dangerouslySetInnerHTML={{__html: page.html}} />
    <Storefront bodyClass={page.bodyClass} />
  </>;
}
