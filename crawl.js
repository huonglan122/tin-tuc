#!/usr/bin/env node
/**
 * crawl.js - Thu thập tự động bài viết từ dantri.com.vn
 *
 * Cách chạy (cần Node.js 18 trở lên):
 *   npm install
 *   node crawl.js
 *
 * Kết quả:
 *   posts.json   - mảng bài viết đúng cấu trúc object của đề bài
 *   images/      - ảnh bìa của từng bài; dòng đầu của `content` có dạng "[img] images/<id>.jpg"
 *
 * Tùy chọn:
 *   --per=10            số bài mỗi chuyên mục (mặc định 10)
 *   --delay=800         thời gian nghỉ giữa 2 lần tải, tính bằng ms (mặc định 800)
 *   --max-chars=5000    giới hạn độ dài `content` để không đầy LocalStorage (mặc định 5000)
 *   --remote-images     không tải ảnh về, chỉ ghi URL ảnh gốc vào dòng "[img]"
 *   --only=Quân sự      chỉ chạy các chuyên mục có tên chứa chuỗi này (để thử nhanh)
 *
 * Script có thể chạy lại nhiều lần: các chuyên mục đã đủ bài sẽ được bỏ qua.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const BASE = "https://dantri.com.vn";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ------------------------------------------------------------------ *
 * Tham số dòng lệnh
 * ------------------------------------------------------------------ */
function argValue(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return "";
}
const PER_CATEGORY = Number(argValue("--per")) || 10;
const DELAY_MS = Number(argValue("--delay")) || 800;
const MAX_CONTENT_CHARS = Number(argValue("--max-chars")) || 5000;
const DOWNLOAD_IMAGES = !process.argv.includes("--remote-images");
const ONLY = argValue("--only");
const MAX_PAGES = 5; // số trang liệt kê tối đa cần duyệt cho mỗi chuyên mục

const OUT_JSON = path.join(__dirname, "posts.json");
const IMG_DIR = path.join(__dirname, "images");

/* ------------------------------------------------------------------ *
 * Danh sách chuyên mục: [tên cha, [[tên con, đường dẫn trên Dân trí], ...]]
 * Tên phải TRÙNG với tên trong data.js để bài hiển thị đúng chuyên mục.
 * ------------------------------------------------------------------ */
const CATEGORIES = [
  ["Thế giới", [
    ["Quân sự", "/the-gioi/quan-su.htm"],
    ["Phân tích - Bình luận", "/the-gioi/phan-tich-binh-luan.htm"],
    ["Thế giới đó đây", "/the-gioi/the-gioi-do-day.htm"],
    ["Kiều bào", "/the-gioi/kieu-bao.htm"],
  ]],
  ["Thời sự", [
    ["Chính trị", "/thoi-su/chinh-tri.htm"],
    ["Đưa nghị quyết của Đảng vào cuộc sống", "/thoi-su/dua-nghi-quyet-cua-dang-vao-cuoc-song.htm"],
    ["Bầu cử đại biểu Quốc hội", "/thoi-su/bau-cu-dai-bieu-quoc-hoi.htm"],
    ["Học tập Bác", "/thoi-su/hoc-tap-bac.htm"],
    ["Môi trường", "/thoi-su/moi-truong.htm"],
    ["Giao thông", "/thoi-su/giao-thong.htm"],
    ["Nóng trên mạng", "/thoi-su/nong-tren-mang.htm"],
  ]],
  ["Pháp luật", [
    ["Hồ sơ vụ án", "/phap-luat/ho-so-vu-an.htm"],
    ["Pháp đình", "/phap-luat/phap-dinh.htm"],
  ]],
  ["Sức khỏe", [
    ["Ung thư", "/suc-khoe/ung-thu.htm"],
    ["Sống khỏe", "/suc-khoe/song-khoe.htm"],
    ["Thận & bệnh mạn tính", "/suc-khoe/than-benh-man-tinh.htm"],
    ["Tầm soát - Chẩn đoán", "/suc-khoe/tam-soat-chan-doan.htm"],
    ["Sinh sản - Hiếm muộn", "/suc-khoe/sinh-san-hiem-muon.htm"],
    ["Ngoại thần kinh - Cột sống", "/suc-khoe/ngoai-than-kinh-cot-song.htm"],
    ["Chấm dứt cơn đau", "/suc-khoe/cham-dut-con-dau.htm"],
    ["Tư vấn y khoa", "/suc-khoe/tu-van-y-khoa.htm"],
    ["Thuốc và giải pháp hỗ trợ", "/suc-khoe/thuoc-va-giai-phap-ho-tro.htm"],
  ]],
  ["Đời sống", [
    ["Cộng đồng", "/doi-song/cong-dong.htm"],
    ["Thượng lưu", "/doi-song/thuong-luu.htm"],
    ["Nhà đẹp", "/doi-song/nha-dep.htm"],
    ["Giới trẻ", "/doi-song/gioi-tre.htm"],
    ["Chợ online", "/doi-song/cho-online.htm"],
    ["Xổ số", "/xo-so.htm"],
    ["Cuộc thi ảnh Việt Nam trong tôi", "/doi-song/cuoc-thi-anh-viet-nam-trong-toi.htm"],
  ]],
  ["Du lịch", [
    ["Tin tức", "/du-lich/tin-tuc.htm"],
    ["Khám phá", "/du-lich/kham-pha.htm"],
    ["Món ngon - Điểm đẹp", "/du-lich/mon-ngon-diem-dep.htm"],
    ["Tour hay - Khuyến mại", "/du-lich/tour-hay-khuyen-mai.htm"],
    ["Video - Ảnh", "/du-lich/video-anh.htm"],
  ]],
  ["Kinh doanh", [
    ["Tài chính", "/kinh-doanh/tai-chinh.htm"],
    ["Chứng khoán", "/kinh-doanh/chung-khoan.htm"],
    ["Doanh nghiệp", "/kinh-doanh/doanh-nghiep.htm"],
    ["Khởi nghiệp", "/kinh-doanh/khoi-nghiep.htm"],
    ["Tiêu dùng", "/kinh-doanh/tieu-dung.htm"],
    ["ESG Việt Nam", "/kinh-doanh/esg-viet-nam.htm"],
    ["Tin Bước cùng Việt Nam", "/kinh-doanh/tin-buoc-cung-viet-nam.htm"],
    ["Toàn cảnh kinh tế tư nhân", "/kinh-doanh/toan-canh-kinh-te-tu-nhan.htm"],
  ]],
  ["Bất động sản", [
    ["Dự án", "/bat-dong-san/du-an.htm"],
    ["Thị trường", "/bat-dong-san/thi-truong.htm"],
    ["Nhà đất", "/bat-dong-san/nha-dat.htm"],
    ["Nhịp sống đô thị", "/bat-dong-san/nhip-song-do-thi.htm"],
    ["Sống xanh", "/bat-dong-san/song-xanh.htm"],
    ["Nội thất", "/bat-dong-san/noi-that.htm"],
  ]],
  ["Thể thao", [
    ["Bóng đá", "/the-thao/bong-da.htm"],
    ["Pickleball", "/the-thao/pickleball.htm"],
    ["Tennis", "/the-thao/tennis.htm"],
    ["Golf", "/the-thao/golf.htm"],
    ["Võ thuật - Các môn khác", "/the-thao/vo-thuat-cac-mon-khac.htm"],
    ["Hậu trường", "/the-thao/hau-truong.htm"],
    ["Thể thao sức bền", "/the-thao/the-thao-suc-ben.htm"], // nếu lỗi, sửa đường dẫn này
    ["Lịch thi đấu", "/the-thao/lich-thi-dau.htm"],
  ]],
  ["Giải trí", [
    ["Hậu trường", "/giai-tri/hau-truong.htm"],
    ["Sách hay", "/giai-tri/sach-hay.htm"],
    ["Điện ảnh", "/giai-tri/dien-anh.htm"],
    ["Âm nhạc", "/giai-tri/am-nhac.htm"],
    ["Thời trang", "/giai-tri/thoi-trang.htm"],
    ["Mỹ thuật - Sân khấu", "/giai-tri/my-thuat-san-khau.htm"],
    ["Tết 2026", "/tet.htm"],
  ]],
  ["Giáo dục", [
    ["Góc phụ huynh", "/giao-duc/goc-phu-huynh.htm"],
    ["Khuyến học", "/giao-duc/khuyen-hoc.htm"],
    ["Gương sáng", "/giao-duc/guong-sang.htm"],
    ["Giáo dục - Nghề nghiệp", "/giao-duc/giao-duc-nghe-nghiep.htm"],
    ["Du học", "/giao-duc/du-hoc.htm"],
    ["Tuyển sinh", "/giao-duc/tuyen-sinh.htm"],
    ["Cuộc thi 50 năm Thành phố trong tôi", "/giao-duc/cuoc-thi-50-nam-thanh-pho-trong-toi.htm"],
  ]],
  ["Xe ++", [
    ["Thị trường xe", "/o-to-xe-may/thi-truong-xe.htm"],
    ["Chọn xe", "/o-to-xe-may/chon-xe.htm"],
    ["Xe điện", "/o-to-xe-may/xe-dien.htm"],
    ["Chăm xe", "/o-to-xe-may/cham-xe.htm"],
    ["Diễn đàn xe", "/o-to-xe-may/dien-dan-xe.htm"],
    ["Thi lý thuyết bằng lái xe", "/o-to-xe-may/thi-ly-thuyet-bang-lai-xe.htm"],
  ]],
  ["Nội vụ", [
    ["Chính sách", "/noi-vu/chinh-sach.htm"],
    ["Tổ chức bộ máy", "/noi-vu/to-chuc-bo-may.htm"],
    ["Tiền lương", "/noi-vu/tien-luong.htm"],
    ["Công sở", "/noi-vu/cong-so.htm"],
    ["An ninh", "/noi-vu/an-sinh.htm"], // trên trang mẫu mục này có thể tên là "An sinh"
    ["Sắp xếp các đơn vị hành chính", "/noi-vu/sap-xep-cac-don-vi-hanh-chinh.htm"],
    ["Đại hội thi đua yêu nước XI", "/collection/dai-hoi-thi-dua-yeu-nuoc-toan-quoc-lan-thu-xi-7836.htm"],
  ]],
  ["Nhân ái", [
    ["Hoàn cảnh", "/tam-long-nhan-ai/hoan-canh.htm"],
    ["Dự án cộng đồng", "/tam-long-nhan-ai/du-an-cong-dong.htm"],
    ["Nhịp cầu nhân ái", "/tam-long-nhan-ai/nhip-cau-nhan-ai.htm"],
    ["Vượt lên số phận", "/tam-long-nhan-ai/vuot-len-so-phan.htm"],
  ]],
];

/* ------------------------------------------------------------------ *
 * Tiện ích
 * ------------------------------------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Date -> "YYYY-MM-DD HH:mm" theo giờ Việt Nam (UTC+7) */
function formatVN(date) {
  const t = new Date(date.getTime() + 7 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** Chuẩn hóa nhiều dạng ngày giờ về "YYYY-MM-DD HH:mm" */
function normalizeDate(raw) {
  const s = clean(raw);
  if (!s) return "";
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[^\d]*(\d{1,2}):(\d{2})/); // 28/09/2026, 12:22
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])} ${pad(m[4])}:${m[5]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/); // ISO
  if (m) {
    if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
      const d = new Date(s);
      if (!isNaN(d)) return formatVN(d);
    }
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  }
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])} 00:00`;
  const d = new Date(s);
  return isNaN(d) ? "" : formatVN(d);
}

function extractIdFromUrl(url) {
  const m = String(url || "").match(/-(\d{10,20})\.htm/i);
  return m ? "dtri-" + m[1] : "";
}

function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return "dtri-" + Math.abs(h);
}

function abs(url, base) {
  try {
    return new URL(url, base || BASE).href;
  } catch (e) {
    return "";
  }
}

/* ------------------------------------------------------------------ *
 * Tải dữ liệu
 * ------------------------------------------------------------------ */
async function request(url, asBuffer, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.5",
          Accept: asBuffer ? "image/*,*/*;q=0.8" : "text/html,application/xhtml+xml",
          Referer: BASE + "/",
        },
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      if (asBuffer) {
        return { buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "" };
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e.status === 404) break; // không cần thử lại
      await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ *
 * Lấy danh sách link bài viết từ trang chuyên mục
 * ------------------------------------------------------------------ */
function extractLinks(html) {
  const re = /href=["']((?:https?:\/\/dantri\.com\.vn)?\/[^"'#?\s]+?-\d{12,20}\.htm)["']/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const link = abs(m[1]);
    if (link && !seen.has(link)) {
      seen.add(link);
      out.push(link);
    }
  }
  return out;
}

function pageUrl(catPath, n) {
  const first = BASE + catPath;
  return n === 1 ? first : first.replace(/\.htm$/, `/trang-${n}.htm`);
}

/* ------------------------------------------------------------------ *
 * Bóc tách một bài viết
 * ------------------------------------------------------------------ */
function readJsonLd($) {
  const found = {};
  const flatten = (d) => {
    if (Array.isArray(d)) return d.flatMap(flatten);
    if (d && typeof d === "object") return d["@graph"] ? flatten(d["@graph"]) : [d];
    return [];
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).contents().text());
    } catch (e) {
      return;
    }
    flatten(data).forEach((o) => {
      const types = [].concat(o["@type"] || []);
      if (types.some((t) => /Article|NewsArticle|BlogPosting/i.test(String(t)))) Object.assign(found, o);
    });
  });
  return found;
}

function ldImage(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return ldImage(v[0]);
  return v.url || v.contentUrl || "";
}

function ldAuthor(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(ldAuthor).filter(Boolean).join(", ");
  return v.name || "";
}

function meta($, key) {
  return clean($(`meta[property="${key}"]`).attr("content") || $(`meta[name="${key}"]`).attr("content"));
}

/**
 * @returns {{post: object, imageUrl: string}} post chưa có dòng [img]
 */
function parseArticle(html, url) {
  const $ = cheerio.load(html);
  const ld = readJsonLd($);

  const title =
    clean($("h1.title-page.detail").first().text()) ||
    clean($("h1.title-page").first().text()) ||
    clean(ld.headline) ||
    clean($("article h1").first().text()) ||
    clean($("h1").first().text()) ||
    meta($, "og:title");
  if (!title) throw new Error("không có tiêu đề");

  const excerpt =
    clean($("h2.singular-sapo").first().text()) ||
    clean($(".singular-sapo").first().text()) ||
    clean(ld.description) ||
    meta($, "og:description") ||
    meta($, "description");

  // ----- nội dung -----
  let root = $(".singular-content").first();
  if (!root.length) root = $(".detail-content").first();
  if (!root.length) root = $("article").first();
  const paragraphs = [];
  root.find("p").each((_, p) => {
    const $p = $(p);
    if ($p.closest("figure, figcaption, table, .article-related, .ads, .dt-ads").length) return;
    const t = clean($p.text());
    if (t) paragraphs.push(t);
  });
  if (paragraphs.length === 0) throw new Error("không có nội dung");

  // giới hạn độ dài (cắt ở ranh giới đoạn) để không đầy LocalStorage
  const kept = [];
  let total = 0;
  for (const p of paragraphs) {
    if (kept.length >= 2 && total + p.length > MAX_CONTENT_CHARS) break;
    kept.push(p);
    total += p.length;
  }

  // ----- tác giả -----
  const author =
    clean($(".author-name a").first().text()) ||
    clean($(".author-name").first().text()) ||
    clean($("[itemprop='author']").first().text()) ||
    clean(ldAuthor(ld.author)) ||
    meta($, "author") ||
    "Dân trí";

  // ----- chuyên mục từ breadcrumb (chỉ để tham khảo; chuyên mục thật do script gán) -----
  // ----- ngày giờ -----
  const timeEl = $("time[datetime], time.author-time, .author-time").first();
  const publishedAt =
    normalizeDate(timeEl.attr("datetime")) ||
    normalizeDate(ld.datePublished) ||
    normalizeDate(meta($, "article:published_time")) ||
    normalizeDate(timeEl.text());

  const canonical = $('link[rel="canonical"]').attr("href") || "";
  const finalUrl = abs(url);
  const id = extractIdFromUrl(finalUrl) || extractIdFromUrl(canonical) || hashId(finalUrl);

  // ----- ảnh bìa -----
  let imageUrl = ldImage(ld.image) || meta($, "og:image");
  if (!imageUrl) {
    const img = root.find("img").first();
    imageUrl = img.attr("data-src") || img.attr("data-original") || img.attr("src") || "";
  }
  imageUrl = imageUrl ? abs(imageUrl, finalUrl) : "";

  return {
    post: {
      id: id,
      title: title,
      slug: slugify(title),
      excerpt: excerpt,
      content: kept.join("\n"),
      author: author,
      category: [], // được gán bởi vòng lặp chính
      publishedAt: publishedAt || formatVN(new Date()),
      source: "dantri.com.vn",
      url: finalUrl,
    },
    imageUrl: imageUrl,
  };
}

/* ------------------------------------------------------------------ *
 * Ảnh bìa: tải về thư mục images/ và ghi dòng "[img] ..." vào đầu content
 * ------------------------------------------------------------------ */
async function attachImage(post, imageUrl) {
  if (!imageUrl) return;
  if (!DOWNLOAD_IMAGES) {
    post.content = `[img] ${imageUrl}\n${post.content}`;
    return;
  }
  try {
    const { buffer, type } = await request(imageUrl, true, 1);
    if (!buffer.length) throw new Error("ảnh rỗng");
    let ext = ".jpg";
    if (/png/i.test(type)) ext = ".png";
    else if (/webp/i.test(type)) ext = ".webp";
    else if (/gif/i.test(type)) ext = ".gif";
    const file = `${post.id}${ext}`;
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, file), buffer);
    post.content = `[img] images/${file}\n${post.content}`;
  } catch (e) {
    // không tải được -> dùng URL gốc để giao diện vẫn có ảnh
    post.content = `[img] ${imageUrl}\n${post.content}`;
  }
}

/* ------------------------------------------------------------------ *
 * Chương trình chính
 * ------------------------------------------------------------------ */
function loadExisting() {
  try {
    const data = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function save(posts) {
  fs.writeFileSync(OUT_JSON + ".tmp", JSON.stringify(posts));
  fs.renameSync(OUT_JSON + ".tmp", OUT_JSON);
}

async function main() {
  const posts = loadExisting();
  const usedIds = new Set(posts.map((p) => p.id));
  const warnings = [];
  let done = 0;
  const total = CATEGORIES.reduce((n, c) => n + c[1].length, 0);

  console.log(`Bắt đầu: ${PER_CATEGORY} bài/chuyên mục, nghỉ ${DELAY_MS}ms giữa các lần tải.`);
  if (posts.length) console.log(`Đã có sẵn ${posts.length} bài trong posts.json, sẽ bỏ qua các mục đã đủ.`);

  for (const [parent, children] of CATEGORIES) {
    for (const [child, catPath] of children) {
      done++;
      if (ONLY && !(parent + " " + child).toLowerCase().includes(ONLY.toLowerCase())) continue;

      const have = posts.filter((p) => p.category[0] === parent && p.category[1] === child).length;
      const need = PER_CATEGORY - have;
      const tag = `[${done}/${total}] ${parent} / ${child}`;
      if (need <= 0) {
        console.log(`${tag}: đã đủ ${have} bài, bỏ qua.`);
        continue;
      }

      // 1) Thu thập link ứng viên từ các trang liệt kê
      const parentPrefix = "/" + catPath.split("/")[1] + "/";
      const preferred = [];
      const others = [];
      const seenLinks = new Set();
      for (let page = 1; page <= MAX_PAGES; page++) {
        let html;
        try {
          html = await request(pageUrl(catPath, page));
        } catch (e) {
          if (page === 1) console.log(`${tag}: KHÔNG tải được trang chuyên mục (${e.message}).`);
          break;
        }
        for (const link of extractLinks(html)) {
          if (seenLinks.has(link) || usedIds.has(extractIdFromUrl(link))) continue;
          seenLinks.add(link);
          (new URL(link).pathname.startsWith(parentPrefix) ? preferred : others).push(link);
        }
        await sleep(DELAY_MS);
        if (preferred.length >= need + 5) break;
      }
      const candidates = preferred.concat(others);

      // 2) Tải từng bài cho đến khi đủ
      let got = 0;
      for (const link of candidates) {
        if (got >= need) break;
        const idGuess = extractIdFromUrl(link);
        if (idGuess && usedIds.has(idGuess)) continue;
        try {
          const html = await request(link);
          const { post, imageUrl } = parseArticle(html, link);
          if (usedIds.has(post.id)) continue;
          await attachImage(post, imageUrl);
          post.category = [parent, child];
          posts.push(post);
          usedIds.add(post.id);
          got++;
        } catch (e) {
          console.log(`   bỏ qua ${link} (${e.message})`);
        }
        await sleep(DELAY_MS);
      }

      save(posts);
      const sum = have + got;
      console.log(`${tag}: +${got} bài (tổng ${sum}/${PER_CATEGORY}).`);
      if (sum < PER_CATEGORY) warnings.push(`${parent} / ${child}: chỉ có ${sum}/${PER_CATEGORY} bài (kiểm tra đường dẫn ${catPath})`);
    }
  }

  save(posts);
  console.log(`\nHoàn tất. Tổng cộng ${posts.length} bài, đã ghi vào posts.json.`);
  if (warnings.length) {
    console.log("\nCác chuyên mục chưa đủ bài:");
    warnings.forEach((w) => console.log(" - " + w));
    console.log("Sửa đường dẫn trong CATEGORIES (đầu file crawl.js) rồi chạy lại `node crawl.js`.");
  }
}

module.exports = { parseArticle, extractLinks, normalizeDate, CATEGORIES };

if (require.main === module) {
  main().catch((e) => {
    console.error("Lỗi:", e);
    process.exit(1);
  });
}
