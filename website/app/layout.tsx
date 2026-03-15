import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: "openvlt — open source, self-hosted notes",
  description:
    "A beautiful, open-source notes app that stores your thoughts as plain markdown files on your own server. End-to-end encrypted. Works offline.",
  openGraph: {
    title: "openvlt — open source, self-hosted notes",
    description:
      "Your notes as plain markdown files on your server. E2E encrypted. Works offline. Free and open source.",
    url: "https://openvlt.com",
    siteName: "openvlt",
    type: "website",
    images: [
      {
        url: "https://openvlt.com/og.webp",
        width: 1200,
        height: 630,
        alt: "openvlt — open source, self-hosted, encrypted markdown notes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "openvlt — open source, self-hosted notes",
    description:
      "Your notes as plain markdown files on your server. E2E encrypted. Works offline.",
    images: ["https://openvlt.com/og.webp"],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#0a0a0a" />
      </head>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
