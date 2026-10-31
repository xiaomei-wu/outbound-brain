import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Outbound Brain',
  description: 'Wen du heute anrufst und warum.',
};

const NAV_LINKS = [
  { href: '/', label: 'Heute' },
  { href: '/setup', label: 'Setup' },
  { href: '/integrations', label: 'Integrationen' },
  { href: '/status', label: 'Status' },
  { href: '/runbook', label: 'Runbook' },
] as const;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          {/* Top nav */}
          <header className="h-[52px] shrink-0 border-b border-border bg-background flex items-center px-4 sm:px-6 gap-4 sm:gap-8">
            <Link
              href="/"
              className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-tight text-foreground hover:opacity-70 transition-opacity"
            >
              Outbound Brain
            </Link>

            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Hauptnavigation">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </header>

          {/* Page content */}
          {/* Scrolls for document pages (setup, status …); app pages fill h-full and scroll their own panes */}
          <main className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </main>

          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
