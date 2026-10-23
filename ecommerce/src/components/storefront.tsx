'use client';

import { useEffect, useRef, useState } from 'react';
import products from '@/content/products.json';

type Product = {id: string; name: string; price: number; image?: string; href?: string; category: string};
type Line = {product: Product; quantity: number};
type Panel = 'cart' | 'search' | 'account' | null;
const catalog = products as Product[];
const money = (value: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value);
function advanceCarousel(carousel: HTMLElement, delta: number) {
  const slides = [...carousel.querySelectorAll<HTMLElement>('.swiper-slide')];
  if (!slides.length) return;
  const index = (Number(carousel.dataset.slide || 0) + delta + slides.length) % slides.length;
  carousel.dataset.slide = String(index);
  const wrapper = carousel.querySelector<HTMLElement>('.swiper-wrapper');
  if (wrapper) wrapper.style.transform = `translateX(-${index * 100}%)`;
  slides.forEach((slide, i) => slide.setAttribute('aria-hidden', String(i !== index)));
}

export default function Storefront({bodyClass}: {bodyClass: string}) {
  const [cart, setCart] = useState<Line[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + line.quantity * line.product.price, 0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('jolie-cart') || '[]');
      if (Array.isArray(saved)) setCart(saved.filter(line => line.product?.id && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity < 100));
    } catch { /* An unavailable browser store should not prevent shopping. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('jolie-cart', JSON.stringify(cart)); } catch { /* Session-only cart fallback. */ }
    document.querySelectorAll('.elementor-button-icon-qty').forEach(el => {
      el.setAttribute('data-counter', String(count));
      el.textContent = String(count);
    });
    document.querySelectorAll('.elementor-menu-cart__toggle .woocommerce-Price-amount').forEach(el => el.textContent = money(total));
    document.querySelectorAll('.elementor-menu-cart__toggle_button').forEach(el => el.setAttribute('aria-label', `Shopping bag, ${count} items`));
  }, [cart, count, total, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('input, button')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanel(null);
      if (event.key === 'Tab') {
        const focusable = dialog.current?.querySelectorAll<HTMLElement>('button, a[href], input');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; previous?.focus(); document.removeEventListener('keydown', keyboard); };
  }, [panel]);

  useEffect(() => {
    document.body.className = bodyClass;
    const root = document.querySelector('.jolie-reference');
    if (!root) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target as HTMLElement;
      let settings: Record<string, string | number> = {};
      try { settings = JSON.parse(element.dataset.settings || '{}'); } catch {}
      const animation = String(settings._animation || settings.animation || 'fadeInUp');
      element.classList.remove('elementor-invisible');
      if (!reduced && animation !== 'none') {
        element.style.animationDelay = `${settings._animation_delay || settings.animation_delay || 0}ms`;
        element.classList.add('animated', animation);
      }
      observer.unobserve(element);
    }), {threshold: 0.08});
    root.querySelectorAll<HTMLElement>('.elementor-invisible').forEach(el => observer.observe(el));

    // Elementor's static tab markup retains its exact responsive layout.
    root.querySelectorAll<HTMLElement>('.elementor-tabs').forEach(tabs => {
      const active = tabs.querySelector<HTMLElement>('.elementor-tab-title.elementor-active');
      const current = active?.dataset.tab || '1';
      tabs.querySelectorAll<HTMLElement>('.elementor-tab-content').forEach(content => {
        const show = content.dataset.tab === current;
        content.style.display = show ? 'block' : 'none';
        content.setAttribute('aria-hidden', String(!show));
      });
    });
    root.querySelectorAll<HTMLElement>('.e-text-path').forEach((el, i) => {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 200 200');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', el.dataset.text || 'Your skin, hair and body');
      const path = document.createElementNS(ns, 'path');
      path.id = `jolie-circle-${i}`;
      path.setAttribute('d', 'M 100, 100 m -75, 0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0');
      path.setAttribute('fill', 'none');
      const text = document.createElementNS(ns, 'text');
      const textPath = document.createElementNS(ns, 'textPath');
      textPath.setAttribute('href', '#' + path.id);
      textPath.setAttribute('textLength', '470');
      textPath.textContent = el.dataset.text || '';
      text.append(textPath); svg.append(path, text); el.replaceChildren(svg);
    });
    const carousels = [...root.querySelectorAll<HTMLElement>('.swiper, .swiper-container')];
    carousels.forEach(el => {
      const wrapper = el.querySelector<HTMLElement>('.swiper-wrapper');
      if (!wrapper) return;
      wrapper.style.transition = 'transform 650ms ease';
      el.dataset.slide = '0';
      el.querySelectorAll<HTMLElement>('.swiper-slide').forEach(slide => { slide.style.width = '100%'; slide.style.flexShrink = '0'; });
    });
    const carouselTimers = reduced ? [] : carousels.map(el => setInterval(() => { if (!el.matches(':hover') && !el.contains(document.activeElement) && !document.hidden) advanceCarousel(el, 1); }, 5000));
    let touchStart = 0;
    function touchstart(event: TouchEvent) { touchStart = event.changedTouches[0].clientX; }
    function touchend(event: TouchEvent) {
      const carousel = (event.target as HTMLElement).closest<HTMLElement>('.swiper, .swiper-container');
      if (carousel && Math.abs(event.changedTouches[0].clientX - touchStart) > 50) advanceCarousel(carousel, event.changedTouches[0].clientX < touchStart ? 1 : -1);
    }
    root.addEventListener('touchstart', touchstart as EventListener, {passive: true});
    root.addEventListener('touchend', touchend as EventListener, {passive: true});
    root.querySelectorAll<HTMLElement>('.woocommerce-tabs').forEach(tabs => {
      tabs.querySelector('.wc-tabs li')?.classList.add('active');
      tabs.querySelectorAll<HTMLElement>('.woocommerce-Tabs-panel').forEach((el, index) => el.hidden = index !== 0);
    });
    let previousScroll = scrollY;
    function scrollEffects() {
      const header = root?.querySelector<HTMLElement>('header.elementor-location-header');
      if (header && Math.abs(scrollY - previousScroll) > 4) header.classList.toggle('jolie-header-hidden', scrollY > previousScroll && scrollY > 200);
      previousScroll = scrollY;
      if (reduced) return;
      root?.querySelectorAll<HTMLElement>('[data-settings*="motion_fx_rotateZ_effect"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) return;
        const target = el.querySelector<HTMLElement>('.e-text-path') || el.querySelector<HTMLElement>('.elementor-widget-container');
        if (target) target.style.transform = `rotate(${(innerHeight / 2 - rect.top) * 0.055}deg)`;
      });
      document.getElementById('scroll-to-top')?.classList.toggle('jolie-visible', scrollY > 500);
    }
    window.addEventListener('scroll', scrollEffects, {passive: true});
    scrollEffects();
    function addProduct(id: string, quantity = 1, variant?: Product) {
      if (!id) return;
      let product = variant || catalog.find(p => p.id === id);
      if (!product) {
        const container = root?.querySelector<HTMLElement>('div.product');
        if (container) product = {id, name: container.querySelector('.product_title')?.textContent?.trim() || 'Beauty favourite', price: Number(container.querySelector('.summary .price bdi')?.textContent?.replace(/[^\d.]/g, '') || '0'), image: container.querySelector<HTMLImageElement>('.woocommerce-product-gallery img')?.src, href: location.pathname, category: 'face'};
      }
      if (!product) return;
      const chosen = product;
      setCart(previous => {
        const existing = previous.find(line => line.product.id === id);
        return existing ? previous.map(line => line.product.id === id ? {...line, quantity: Math.min(99, line.quantity + quantity)} : line) : [...previous, {product: chosen, quantity}];
      });
      setNotice(`${product.name} added to your bag.`);
    }
    function click(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const add = target.closest<HTMLElement>('.add_to_cart_button, .single_add_to_cart_button');
      if (add && !add.classList.contains('product_type_variable')) {
        event.preventDefault();
        const form = add.closest('form');
        let id = add.dataset.product_id || (add as HTMLButtonElement).value || form?.querySelector<HTMLInputElement>('[name="product_id"], [name="add-to-cart"]')?.value || '';
        const quantity = Math.max(1, Math.min(99, Number(root?.querySelector<HTMLInputElement>('input.qty')?.value) || 1));
        let variant: Product | undefined;
        if (form?.classList.contains('variations_form')) {
          const selected = form.querySelector<HTMLSelectElement>('.variations select');
          if (!selected?.value) {setNotice('Please choose an amount first.'); selected?.focus(); return;}
          const base = catalog.find(p => p.id === id);
          if (base) {id = `${id}-${selected.value}`; variant = {...base, id, name: `${base.name} (${selected.value})`, price: Number(selected.value.replace(/[^\d.]/g, ''))};}
        }
        addProduct(id, add.classList.contains('single_add_to_cart_button') ? quantity : 1, variant);
        return;
      }
      if (target.closest('.elementor-menu-cart__toggle_button')) { event.preventDefault(); setPanel('cart'); return; }
      const popup = target.closest<HTMLAnchorElement>('a[href*="elementor-action"]');
      if (popup) {
        event.preventDefault();
        const href = decodeURIComponent(popup.getAttribute('href') || '');
        let id = '';
        try { id = JSON.parse(atob(href.split('settings=')[1])).id; } catch {}
        setPanel(id === '751' ? 'account' : 'search'); return;
      }
      const productTab = target.closest<HTMLAnchorElement>('.wc-tabs a');
      if (productTab) {
        event.preventDefault();
        const tabs = productTab.closest('.woocommerce-tabs');
        tabs?.querySelectorAll('.wc-tabs li').forEach(el => el.classList.toggle('active', el.contains(productTab)));
        tabs?.querySelectorAll<HTMLElement>('.woocommerce-Tabs-panel').forEach(el => el.hidden = '#' + el.id !== productTab.hash);
        return;
      }
      const tab = target.closest<HTMLElement>('.elementor-tabs .elementor-tab-title');
      if (tab) {
        event.preventDefault();
        const tabs = tab.closest('.elementor-tabs');
        tabs?.querySelectorAll<HTMLElement>('.elementor-tab-title').forEach(title => {
          const active = title.dataset.tab === tab.dataset.tab;
          title.classList.toggle('elementor-active', active); title.setAttribute('aria-selected', String(active)); title.tabIndex = active ? 0 : -1;
        });
        tabs?.querySelectorAll<HTMLElement>('.elementor-tab-content').forEach(content => {
          const active = content.dataset.tab === tab.dataset.tab;
          content.classList.toggle('elementor-active', active); content.style.display = active ? 'block' : 'none'; content.setAttribute('aria-hidden', String(!active));
        });
        return;
      }
      const toggle = target.closest<HTMLElement>('.elementor-menu-toggle');
      if (toggle) {
        event.preventDefault();
        const active = toggle.classList.toggle('elementor-active');
        toggle.setAttribute('aria-expanded', String(active));
        const widget = toggle.closest('.elementor-widget-nav-menu');
        widget?.classList.toggle('jolie-menu-open', active);
        const nav = widget?.querySelector<HTMLElement>('nav.elementor-nav-menu--dropdown');
        nav?.setAttribute('aria-hidden', String(!active));
        nav?.querySelectorAll('a').forEach(link => link.tabIndex = active ? 0 : -1);
        return;
      }
      const submenu = target.closest<HTMLAnchorElement>('.jolie-menu-open .menu-item-has-children > a');
      if (submenu && (submenu.getAttribute('href') === '#' || !submenu.hasAttribute('href') || target.closest('.sub-arrow'))) {
        event.preventDefault(); const expanded = submenu.parentElement?.classList.toggle('jolie-submenu-open'); submenu.setAttribute('aria-expanded', String(Boolean(expanded))); return;
      }
      const slideButton = target.closest<HTMLElement>('.elementor-swiper-button');
      if (slideButton) {
        const carousel = slideButton.closest('.elementor-widget-container')?.querySelector<HTMLElement>('.swiper, .swiper-container');
        if (carousel) {
          advanceCarousel(carousel, slideButton.classList.contains('elementor-swiper-button-next') ? 1 : -1);
        }
      }
      if (target.closest('#scroll-to-top')) { event.preventDefault(); window.scrollTo({top: 0, behavior: reduced ? 'instant' : 'smooth'}); }
      const accordion = target.closest<HTMLElement>('.elementor-tab-title[role="button"], .elementor-accordion .elementor-tab-title');
      if (accordion) { accordion.classList.toggle('elementor-active'); const content = accordion.nextElementSibling as HTMLElement; if (content) content.style.display = accordion.classList.contains('elementor-active') ? 'block' : 'none'; }
      const gallery = target.closest<HTMLAnchorElement>('.woocommerce-product-gallery__image a');
      if (gallery) { event.preventDefault(); const img = root?.querySelector<HTMLImageElement>('.woocommerce-product-gallery__wrapper > .woocommerce-product-gallery__image:first-child img'); if (img) { img.src = gallery.href; img.removeAttribute('srcset'); } }
    }
    function submit(event: Event) {
      const form = event.target as HTMLFormElement;
      if (!root?.contains(form)) return;
      event.preventDefault();
      if (form.classList.contains('cart')) return;
      if (form.classList.contains('woocommerce-ordering')) return;
      const email = form.querySelector<HTMLInputElement>('input[type="email"]');
      if (email?.checkValidity()) {
        try { localStorage.setItem('jolie-newsletter', email.value); } catch {}
        setNotice('Your email is saved on this device. Newsletter delivery will be available when the store is connected.');
        form.reset();
      } else setNotice('This form will be available when the store services are connected.');
    }
    function change(event: Event) {
      const select = event.target as HTMLSelectElement;
      if (!select.matches('select.orderby')) return;
      const list = root?.querySelector<HTMLElement>('ul.products:not(.product-categories)');
      if (!list) return;
      const items = [...list.children] as HTMLElement[];
      const price = (el: HTMLElement) => Number(el.querySelector('.price bdi')?.textContent?.replace(/[^\d.]/g, '') || 0);
      if (select.value === 'price') items.sort((a, b) => price(a) - price(b));
      else if (select.value === 'price-desc') items.sort((a, b) => price(b) - price(a));
      else items.sort((a, b) => (a.querySelector('h2')?.textContent || '').localeCompare(b.querySelector('h2')?.textContent || ''));
      list.append(...items);
    }
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches('.elementor-tab-title') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); target.click(); }
      if (target.matches('.elementor-tab-title') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); const tabs = [...(target.parentElement?.querySelectorAll<HTMLElement>('.elementor-tab-title') || [])]; const i = tabs.indexOf(target); const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next?.click(); next?.focus();
      }
    }
    root.addEventListener('click', click as EventListener);
    root.addEventListener('submit', submit);
    root.addEventListener('change', change);
    root.addEventListener('keydown', keydown as EventListener);
    return () => {observer.disconnect(); carouselTimers.forEach(clearInterval); root.removeEventListener('touchstart', touchstart as EventListener); root.removeEventListener('touchend', touchend as EventListener); window.removeEventListener('scroll', scrollEffects); root.removeEventListener('click', click as EventListener); root.removeEventListener('submit', submit); root.removeEventListener('change', change); root.removeEventListener('keydown', keydown as EventListener);};
  }, [bodyClass]);

  function quantity(id: string, delta: number) { setCart(previous => previous.map(line => line.product.id === id ? {...line, quantity: Math.min(99, line.quantity + delta)} : line).filter(line => line.quantity > 0)); }
  const results = query.trim() ? catalog.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12) : catalog.slice(0, 5);
  return <>
    {notice && <div role="status" className="jolie-toast">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {panel && <div className="jolie-overlay" onClick={() => setPanel(null)}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="panel-title" className={`jolie-panel jolie-panel-${panel}`} onClick={event => event.stopPropagation()}>
        <button className="panel-close" aria-label="Close dialog" onClick={() => setPanel(null)}>×</button>
        <h2 id="panel-title">{panel === 'cart' ? `Your bag (${count})` : panel === 'search' ? 'Find your favourites.' : 'Welcome to Jolie.'}</h2>
        {panel === 'cart' && <>
          {cart.length === 0 ? <div className="empty-bag"><p>Your bag is waiting for a little beauty.</p><a className="shop-button" href="/shop">Explore the shop →</a></div> : <>
            <p className="shipping-note">{total >= 50 ? 'Your order qualifies for free delivery.' : `You’re ${money(50 - total)} away from free delivery.`}</p>
            <div className="cart-lines">{cart.map(line => <article key={line.product.id} className="cart-line"><a href={line.product.href}><img src={line.product.image} alt={line.product.name} /></a><div><a href={line.product.href}>{line.product.name}</a><p>{money(line.product.price)}</p><div className="quantity-control"><button aria-label={`Decrease ${line.product.name} quantity`} onClick={() => quantity(line.product.id, -1)}>−</button><span>{line.quantity}</span><button aria-label={`Increase ${line.product.name} quantity`} onClick={() => quantity(line.product.id, 1)}>+</button></div></div><button className="remove-line" aria-label={`Remove ${line.product.name}`} onClick={() => setCart(previous => previous.filter(item => item.product.id !== line.product.id))}>×</button></article>)}</div>
            <div className="cart-total"><span>Subtotal</span><strong>{money(total)}</strong></div><p>Shipping and taxes calculated at checkout.</p><a className="shop-button" href="/checkout">Continue to checkout →</a><button className="continue-shopping" onClick={() => setPanel(null)}>Continue shopping</button>
          </>}
        </>}
        {panel === 'search' && <><label className="search-label">Search products<input autoFocus type="search" placeholder="What are you looking for?" value={query} onChange={event => setQuery(event.target.value)} /></label><p className="search-caption">{query ? `${results.length} matching favourites` : 'Discover our favourites'}</p><div className="search-results">{results.map(p => <a key={p.id} href={p.href}><img src={p.image} alt=""/><span>{p.name}<small>{money(p.price)}</small></span><span>↗</span></a>)}{!results.length && <p>No products found. Try “oil”, “cream” or “hair”.</p>}</div></>}
        {panel === 'account' && <><p>Your beauty routine, all in one place.</p><p className="account-note">Account sign-in will be available when the store’s customer service is connected.</p><a href="/shop" className="shop-button">Discover the collection →</a></>}
      </div>
    </div>}
  </>;
}
