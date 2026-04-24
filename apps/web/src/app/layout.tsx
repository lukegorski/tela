import type { Metadata } from 'next';
import { TRPCProvider } from '@/trpc/Provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'tela',
  description: 'Personal stylist that learns from your closet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
