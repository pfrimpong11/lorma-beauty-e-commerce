import type { Metadata } from 'next';
import { PosScreen } from '@/features/pos/PosScreen';

export const metadata: Metadata = { title: 'Point of Sale' };

export default function PosPage() {
  return <PosScreen />;
}
