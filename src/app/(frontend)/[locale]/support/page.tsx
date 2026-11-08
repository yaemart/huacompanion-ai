import { PublicPage } from "@/components/content/PublicPage";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/lib/locales";
import { getPublicFeatures, isSiteLocale } from "@/server/site-config";
import { SupportChat } from "@/components/support/SupportChat";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || !isSiteLocale(locale)) notFound();
  if (!(await getPublicFeatures()).textChat) redirect(`/${locale}/contact`);
  return (
    <PublicPage locale={locale}>
      <SupportChat locale={locale} />
    </PublicPage>
  );
}
