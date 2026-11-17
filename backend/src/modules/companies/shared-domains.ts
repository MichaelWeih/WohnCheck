/**
 * Domain data for `registrableDomain()` (normalization.ts). Pure data, no I/O.
 *
 * A website domain is used as an identity signal ("same domain => same company", see matching.ts).
 * That only holds for domains a single company controls, so every domain that many unrelated
 * companies share must never be stored as `Landlord.websiteDomain`.
 */

/**
 * Registrable domains that are shared by many unrelated parties: social networks, link shorteners,
 * search / map services, real-estate portals, business directories, site builders and web hosters
 * that hand out sub-domains or paths, and e-mail providers. `registrableDomain()` returns null for them.
 *
 * Entries are registrable domains in lower case; every host below an entry is blocked as well
 * (e.g. "de-de.facebook.com", "sites.google.com", "musterfirma.jimdofree.com").
 */
export const SHARED_DOMAINS: ReadonlySet<string> = new Set([
  // Social networks and messengers
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "linkedin.com",
  "xing.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "t.co",
  "tiktok.com",
  "pinterest.com",
  "pinterest.de",
  "whatsapp.com",
  "wa.me",
  "t.me",
  "telegram.me",
  "tumblr.com",
  "medium.com",

  // Link collections and shorteners
  "linktr.ee",
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "g.co",
  "g.page",

  // Search, maps and knowledge bases (includes sites.google.com, maps.app.goo.gl)
  "google.com",
  "google.de",
  "business.site",
  "bing.com",
  "wikipedia.org",
  "wikidata.org",
  "openstreetmap.org",

  // Real-estate portals and classifieds
  "immobilienscout24.de",
  "immoscout24.de",
  "immowelt.de",
  "immonet.de",
  "kleinanzeigen.de",
  "ebay-kleinanzeigen.de",
  "ebay.de",
  "wg-gesucht.de",
  "wohnungsboerse.net",

  // Business directories and review platforms
  "gelbeseiten.de",
  "dasoertliche.de",
  "11880.com",
  "meinestadt.de",
  "golocal.de",
  "yelp.de",
  "yelp.com",
  "trustpilot.com",
  "provenexpert.com",
  "kununu.com",
  "northdata.de",
  "northdata.com",

  // Site builders and hosters that hand out sub-domains
  "jimdo.com",
  "jimdofree.com",
  "jimdosite.com",
  "wix.com",
  "wixsite.com",
  "wordpress.com",
  "blogspot.com",
  "blogspot.de",
  "webnode.com",
  "webnode.page",
  "weebly.com",
  "squarespace.com",
  "webflow.io",
  "godaddysites.com",
  "mystrikingly.com",
  "site123.me",
  "webador.de",
  "hpage.com",
  "beepworld.de",
  "de.tl",
  "chayns.net",
  "github.io",
  "netlify.app",
  "vercel.app",
  "herokuapp.com",
  "web.app",
  "firebaseapp.com",
  "appspot.com",
  "azurewebsites.net",
  "strato.de",
  "ionos.de",
  "ionos.com",
  "1und1.de",

  // Internet and e-mail providers (customer home pages, addresses mistaken for websites)
  "t-online.de",
  "web.de",
  "gmx.de",
  "gmx.net",
  "gmx.at",
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.de",
  "hotmail.com",
  "hotmail.de",
  "yahoo.com",
  "yahoo.de",
  "aol.com",
  "icloud.com",
  "freenet.de",
  "arcor.de",
  "posteo.de",
  "mailbox.org",
]);

/**
 * Public suffixes that consist of two labels, where the registrable domain therefore has three
 * ("example.co.uk"). Deliberately a small built-in list (no external dependency): the directory is
 * Germany-only, so the common second-level registries of neighbouring / frequently seen countries suffice.
 * Every other host is treated as "<name>.<tld>".
 */
export const MULTI_LABEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  // Austria
  "co.at",
  "or.at",
  "ac.at",
  "gv.at",
  // United Kingdom
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "ac.uk",
  "gov.uk",
  // Australia / New Zealand
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "org.nz",
  // Others that appear on company websites
  "co.jp",
  "co.za",
  "co.in",
  "co.il",
  "com.br",
  "com.tr",
  "com.pl",
  "com.cn",
  "com.mx",
  "com.ar",
  "com.sg",
  "com.hk",
]);

/** True when `domain` (a registrable domain, any case) is on the shared-domain blocklist. */
export function isSharedDomain(domain: string): boolean {
  return SHARED_DOMAINS.has(domain.trim().toLowerCase());
}
