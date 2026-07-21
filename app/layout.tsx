import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.ACCESSCRASH_SITE_URL?.trim();
const metadataBase = siteUrl ? new URL(siteUrl) : undefined;

const productDescription =
  "Test whether an eligible student can actually reach the outcome before a service launches.";

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase } : {}),
  title: {
    default: "AccessCrash — Human regression testing",
    template: "%s · AccessCrash",
  },
  description: productDescription,
  applicationName: "AccessCrash",
  authors: [{ name: "EV1 Labs", url: "https://ev1labs.com/" }],
  creator: "EV1 Labs",
  publisher: "EV1 Labs",
  keywords: [
    "student services",
    "human regression testing",
    "process accessibility",
    "education",
  ],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "AccessCrash",
    title: "AccessCrash — Human regression testing",
    description: productDescription,
    images: [
      {
        url: "/accesscrash-social.jpg",
        width: 1200,
        height: 630,
        alt: "AccessCrash shows a hidden process barrier and a repaired route to the outcome.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessCrash — Human regression testing",
    description: productDescription,
    images: ["/accesscrash-social.jpg"],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07120f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
