import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "openvlt: open source, self-hosted, encrypted notes app",
  description:
    "A beautiful notes app that stores your thoughts as plain markdown files on your own server. End-to-end encrypted, works offline, and completely free and open source.",
  openGraph: {
    title: "openvlt: open source, self-hosted, encrypted notes app",
    description:
      "A beautiful notes app that stores your thoughts as plain markdown files on your own server. End-to-end encrypted, works offline, and completely free and open source.",
    url: "https://openvlt.com",
    siteName: "openvlt",
    type: "website",
    images: [
      {
        url: "https://openvlt.com/og.png",
        width: 1200,
        height: 630,
        alt: "openvlt: open source, self-hosted, encrypted markdown notes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "openvlt: open source, self-hosted, encrypted notes app",
    description:
      "A beautiful notes app that stores your thoughts as plain markdown files on your own server. End-to-end encrypted, works offline, and completely free and open source.",
    images: ["https://openvlt.com/og.png"],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#fafaf9" media="(prefers-color-scheme: light)" />
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("openvlt-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}` }} />
      </head>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
