import "./globals.css";
import { headers } from "next/headers";
export const metadata = {
  title: "Hua Companion · 华伴",
  description:
    "Your local companion in China. Shanghai-based service coordination.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale =
    (await headers()).get("x-hua-locale") === "zh-CN" ? "zh-CN" : "en";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
