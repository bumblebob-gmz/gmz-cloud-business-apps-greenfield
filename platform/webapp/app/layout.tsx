import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GMZ Cloud Business Apps',
  description: 'MVP control panel for tenant operations'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
