import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-5 py-16">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
