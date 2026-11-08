import { PublicPage } from "@/components/content/PublicPage";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locales";
import { SupportChat } from "@/components/support/SupportChat";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <PublicPage locale={locale}>
      <SupportChat locale={locale} />
    </PublicPage>
  );
}
