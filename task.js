const axios = require('axios');
const { JSDOM } = require('jsdom');

/**
 * @param {string} content
 * @param {Array<string>} spamLinkDomains
 * @param {number} redirectionDepth
 * @returns {Promise<boolean>}
 */
export async function isSpam(content, spamLinkDomains, redirectionDepth) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const links = content.match(urlRegex) || [];
  const visitedLinkList = new Set();

  const results = await Promise.all(
    links.map(async (link) => {
      const finalUrl = await traceRedirect(link, redirectionDepth, visitedLinkList);
      const domain = new URL(finalUrl).hostname;

      if (spamLinkDomains.includes(domain)) return true;

      const pageLinks = await findLinksInHtml(finalUrl);
      for (const pageLink of pageLinks) {
        const finalLink = await traceRedirect(pageLink, redirectionDepth - 1, visitedLinkList); // 중첩 링크의 리디렉션 확인
        const pageDomain = new URL(finalLink).hostname;

        if (spamLinkDomains.includes(pageDomain)) return true;
      }
    })
  );
  return results.includes(true);
}

// URL의 모든 redirection 확인 후 마지막 URL 반환
async function traceRedirect(url, depth, visitedLinkList) {
  if (depth === 0 || visitedLinkList.has(url)) return url;
  visitedLinkList.add(url);

  try {
    const response = await axios.head(url, { maxRedirects: 0, validateStatus: null });
    const location = response.headers.location;

    if ((response.status == 301 || response.status == 302) && location) {
      const nextUrl = new URL(location, url).toString();
      return traceRedirect(nextUrl, depth - 1, visitedLinkList);
    } else return url;
  } catch (error) {
    return url;
  }
}

// URL의 HTML에서 링크 추출
async function findLinksInHtml(url) {
  try {
    const response = await axios.get(url);
    const dom = new JSDOM(response.data);
    const links = Array.from(dom.window.document.querySelectorAll('a'))
      .map((a) => a.href)
      .filter((link) => {
        try {
          new URL(link);
          return true;
        } catch (error) {
          return false;
        }
      });
    return links;
  } catch (error) {
    return [];
  }
}
