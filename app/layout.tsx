import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, JetBrains_Mono, Noto_Music } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const _spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
})
const _jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})
// Real engraved music-notation glyphs (clefs, rests, accidentals) from the
// Unicode Musical Symbols block — not hand-drawn approximations.
const _notoMusic = Noto_Music({
  weight: '400',
  subsets: ['music'],
  variable: '--font-music',
})

export const metadata: Metadata = {
  title: 'Contrapunctus — Chiptune Composition Studio',
  description:
    'A staff notation editor for composing contrapuntal classical music with real-time 8-bit synthesis playback.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0a0e1a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`dark ${_spaceGrotesk.variable} ${_jetbrainsMono.variable} ${_notoMusic.variable}`}
    >
      <body className="antialiased font-sans bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
