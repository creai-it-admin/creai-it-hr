import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Shell } from "./_components/shell";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// SUIT(SIL OFL 1.1)는 Google Fonts에 없어 공식 배포본 CDN을 쓴다. 운영 전 자체 호스팅으로 옮긴다.
const SUIT =
  "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css";

export const metadata: Metadata = {
  title: { default: "CREAI+IT HR", template: "%s · CREAI+IT HR" },
  description:
    "내 조건에서 시작하는 채용·인턴 탐색. 왜 검토할 만한지와 확인할 점을 함께 보고, 준비 프롬프트까지 무료로.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={geistMono.variable}>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" href={SUIT} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
