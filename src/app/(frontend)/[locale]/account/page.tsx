import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locales";
import CustomerPortal from "@/components/customer/CustomerPortal";
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <CustomerPortal locale={locale} />;
}
