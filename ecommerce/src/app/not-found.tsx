import Link from 'next/link';
export default function NotFound() {
  return <main className="standalone"><Link className="wordmark" href="/">JOLIE.</Link><h1>A little beauty detour.</h1><p>We couldn’t find that page.</p><Link className="shop-button" href="/shop">Explore the shop →</Link></main>;
}
