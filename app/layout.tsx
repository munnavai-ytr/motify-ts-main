import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import {
  Noto_Sans_Bengali,
  Plus_Jakarta_Sans,
} from 'next/font/google';
import { APP_NAME, THEME_STORAGE } from '@/lib/constants';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bengali',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: './fonts/JetBrainsMono-latin.woff2',
  weight: '400 700',
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${APP_NAME} — Browser AI Motion Graphics`,
  description:
    'Chat-based AI motion-graphics video workspace that runs entirely in your browser with your own Gemini API key.',
  openGraph: {
    title: `${APP_NAME} — Browser AI Motion Graphics`,
    description:
      'Chat-based AI motion-graphics video workspace that runs entirely in your browser with your own Gemini API key.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — Browser AI Motion Graphics`,
    description:
      'Chat-based AI motion-graphics video workspace that runs entirely in your browser with your own Gemini API key.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var pref = localStorage.getItem('${THEME_STORAGE}');
    var isDark = pref === 'light'
      ? false
      : pref === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${notoSansBengali.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-dvh bg-bg text-text font-sans antialiased selection:bg-accent/25 selection:text-text"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
