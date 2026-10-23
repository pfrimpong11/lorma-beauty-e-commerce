'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
type Line = {product: {id: string; name: string; price: number}; quantity: number};
export default function Checkout() {
  const [cart, setCart] = useState<Line[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {try {setCart(JSON.parse(localStorage.getItem('jolie-cart') || '[]'));} catch {}}, []);
  const money = (n: number) => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(n);
  return <main className="standalone"><Link href="/" className="wordmark">JOLIE.</Link><h1>Checkout.</h1>{!cart.length ? <><p>Your shopping bag is empty.</p><Link className="shop-button" href="/shop">Explore the shop →</Link></> : <div className="checkout-grid"><form onSubmit={event => {event.preventDefault(); setSaved(true);}}><h2>Contact & delivery</h2><label>Email address<input type="email" name="email" autoComplete="email" required /></label><label>Full name<input name="name" autoComplete="name" required /></label><label>Street address<input name="address" autoComplete="street-address" required /></label><label>City<input name="city" autoComplete="address-level2" required /></label><label>Country<input name="country" autoComplete="country-name" required /></label><p className="checkout-note">This storefront is a local preview. Payment and order processing are not connected yet.</p><button type="submit" className="shop-button">Review details →</button>{saved && <p role="status">Your details are ready for review. No order has been placed and no payment has been taken.</p>}</form><aside><h2>Your bag</h2>{cart.map(line => <div key={line.product.id}><span>{line.product.name} × {line.quantity}</span><span>{money(line.product.price * line.quantity)}</span></div>)}<div><strong>Subtotal</strong><strong>{money(cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0))}</strong></div><p>Shipping and taxes will be calculated when checkout is connected.</p><Link href="/shop">Continue shopping</Link></aside></div>}</main>;
}
