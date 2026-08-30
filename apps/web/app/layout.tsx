import type { Metadata } from 'next';
import { IBM_Plex_Mono, STIX_Two_Text } from 'next/font/google';
import './globals.css';

const display = STIX_Two_Text({ subsets: ['latin'], variable: '--font-display' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Manimate',
  description: 'Describe an animation. Get a rendered Manim video.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
