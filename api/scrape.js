import * as cheerio from 'cheerio';

const NAVER_BASE_URL = "https://m.place.naver.com";

function removeImageParams(imageUrl) {
  if (!imageUrl || imageUrl === "이미지 없음") return imageUrl;

  try {
    const parsedUrl = new URL(imageUrl);
    const searchParams = parsedUrl.searchParams;

    searchParams.delete("type");
    searchParams.delete("quality");

    return parsedUrl.toString();
  } catch {
    return imageUrl;
  }
}

function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function toAbsoluteUrl(href) {
  if (!href) return "링크 없음";
  try {
    return new URL(href, NAVER_BASE_URL).toString();
  } catch {
    return href;
  }
}

function extractLink($, element) {
  const href =
    $(element).find("a.COOCz").attr("href") ||
    $(element).find("a[href*='/place/']").first().attr("href") ||
    $(element).find("a[href]").first().attr("href");

  return toAbsoluteUrl(href);
}

function extractDescription($, element) {
  const candidates = [
    $(element).find(".zpUI7").first().text(),
    $(element).find("[class*='desc']").first().text(),
    $(element).find("[class*='summary']").first().text(),
    $(element).find("[aria-label]").first().attr("aria-label"),
    $(element).find("[title]").first().attr("title"),
  ];

  const description = candidates
    .map(normalizeText)
    .find((value) => value && value.length > 0);

  return description || "설명 없음";
}

async function scrapeNaverPlace() {
  const url = "https://m.place.naver.com/place/1850832311/ticket";
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: "https://m.place.naver.com/",
    Connection: "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
  };

  try {
    const response = await fetch(url, {
      headers,
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];

    $(".p6_z6").each((index, element) => {
      const title = normalizeText($(element).find(".lsthu").text()) || "제목 없음";

      let imgUrl = $(element).find("img.K0PDV").attr("src") || "이미지 없음";
      imgUrl = removeImageParams(imgUrl);

      const link = extractLink($, element);
      const description = extractDescription($, element);

      const priceTag = $(element).find(".CTesk");
      let discount = "할인 없음";
      let price = "가격 정보 없음";

      if (priceTag.length) {
        discount = normalizeText(priceTag.find(".DPGPI").text()) || "할인 없음";
        price = normalizeText(priceTag.find("em").first().text()) || "가격 정보 없음";
      }

      results.push({
        title,
        imgUrl,
        link,
        price,
        discount,
        description: truncateText(description, 100),
      });
    });

    return results;
  } catch (error) {
    console.error(`요청 실패: ${error.message}`);
    throw new Error("Scraping failed");
  }
}

async function translateResults(results) {
  const translatedResults = await Promise.all(
    results.map(async (item) => ({
      ...item,
      title: await translateToEnglish(item.title),
      description: await translateToEnglish(item.description),
      price: await translateToEnglish(item.price),
      discount: await translateToEnglish(item.discount),
    }))
  );
  return translatedResults;
}

export default async function handler(req, res) {
  const allowedOrigins = [
    "https://trivium3113.co.kr",
    "http://trivium3113.cafe24.com",
    "https://trivium3113.cafe24.com",
    "https://en.trivium3113.co.kr",
  ];
  const origin = req.headers.origin;
  const lang = req.query?.lang || 'ko';

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const data = await scrapeNaverPlace();
    const finalData = lang === 'en' ? await translateResults(data) : data;
    res.status(200).json(finalData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function translateToEnglish(text) {
  const apiKey = process.env.SANITY_STUDIO_GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) {
    throw new Error("Google Translate API key is not configured");
  }

  if (typeof text !== "string") return text;

  try {
    const encodedText = text.replace(/['"]/g, (char) =>
      char === "'" ? "&apos;" : "&quot;"
    );

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: encodedText,
          source: "ko",
          target: "en",
        }),
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const translatedText = data.data.translations[0].translatedText
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"');

    return translatedText;
  } catch (error) {
    console.error("Translation API error:", error);
    throw error;
  }
}
