// Plain <a> (not <Link>) with rel="nofollow": prefetchers and crawlers must not log enquiries.
export function ContactButtons({ slug, hasWhatsapp }: { slug: string; hasWhatsapp: boolean }) {
  const base =
    "flex min-h-12 flex-1 items-center justify-center rounded-lg px-5 text-lg font-semibold";
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a
        href={`/api/contact/${slug}?via=call`}
        rel="nofollow"
        className={`${base} bg-emerald-800 text-white hover:bg-emerald-900`}
      >
        Call
      </a>
      {hasWhatsapp && (
        <a
          href={`/api/contact/${slug}?via=whatsapp`}
          rel="nofollow"
          className={`${base} border-2 border-emerald-800 text-emerald-900 hover:bg-emerald-50`}
        >
          WhatsApp
        </a>
      )}
    </div>
  );
}
