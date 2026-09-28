import { TillShell } from '@/components/shell/TillShell';

export default function TillLayout({ children }: { children: React.ReactNode }) {
  return <TillShell>{children}</TillShell>;
}
