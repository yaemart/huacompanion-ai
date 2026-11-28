/** @param {string} raw */
export function routeCheckOrigin(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Route checks require a loopback HTTP origin with an explicit port");
  return url.origin;
}

/** @param {string} raw @param {string} origin @param {readonly string[]} activeLocales */
export function sitemapCheckURL(raw, origin, activeLocales) {
  const url = new URL(raw);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash)
    throw Error("Unexpected sitemap origin or URL attributes");
  if (url.pathname !== "/llms.txt" && !activeLocales.includes(url.pathname.split("/")[1]))
    throw Error(`Inactive locale or unknown neutral path in sitemap: ${url.pathname}`);
  return url;
}

/**
 * @param {string | URL} raw
 * @param {string} origin
 * @param {readonly string[]} activeLocales
 * @param {boolean} followRedirects
 */
export async function fetchRouteDocument(raw, origin, activeLocales, followRedirects = true) {
  let url = new URL(raw);
  for (let hop = 0; hop < 6; hop++) {
    if (url.origin !== origin || url.username || url.password || url.search || url.hash)
      throw Error("Unexpected route origin or URL attributes");
    const response = await fetch(url, {
      redirect: "manual",
      signal: globalThis.AbortSignal.timeout(15000),
    });
    if (!followRedirects || ![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw Error("Redirect location missing");
    url = sitemapCheckURL(new URL(location, url).toString(), origin, activeLocales);
  }
  throw Error("Too many route redirects");
}
