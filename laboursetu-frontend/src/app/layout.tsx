import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'LabourSetu | Construction Workforce & Site Management SaaS',
  description:
    'Modern multi-tenant SaaS for Indian contractors to manage construction sites, workers, wage rates, and supervisors.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
