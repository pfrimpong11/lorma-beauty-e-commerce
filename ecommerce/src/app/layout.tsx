import type { Metadata } from 'next';
import './globals.css';
import './fonts.css';
import './overrides.css';

export const metadata: Metadata = {
  title: { default: 'Jolie – Beauty Shop', template: '%s – Jolie' },
  description: 'Beauty for your skin, hair and body. Discover the Jolie collection of skincare and beauty favourites.',
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body className="home page page-id-18287 wp-theme-jolie theme-jolie woocommerce-js full responsive-layout vamtam-is-elementor elementor-active elementor-pro-active layout-full elementor-default elementor-kit-5 elementor-page elementor-page-18287"><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
