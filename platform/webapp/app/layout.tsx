import type { Metadata } from 'next';
import './globals.css';
import { DevRoleProvider } from '@/components/dev-role-provider';

export const metadata: Metadata = {
  title: 'GMZ Cloud Business Apps',
  description: 'MVP control panel for tenant operations'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DevRoleProvider />
        {children}
      </body>
    </html>
  );
}
