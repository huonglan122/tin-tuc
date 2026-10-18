/**
 * data.js - Lớp dữ liệu (LocalStorage) cho dự án báo tin tức mô phỏng Dân trí
 * Môn: Xây dựng ứng dụng Web - Đại học Phenikaa
 *
 * Cách dùng: nhúng <script src="data.js"></script> TRƯỚC các script khác.
 * Sau khi nạp, đối tượng toàn cục `DataStore` sẵn sàng sử dụng.
 *
 * Phiên bản dữ liệu 2: menu đúng 14 chuyên mục + chuyên mục con theo trang mẫu.
 * Khi nâng phiên bản, menu và bài giả lập được tạo lại; các bài do Crawler
 * thu thập (không phải bài giả lập) vẫn được giữ nguyên.
 */
(function (global) {
  "use strict";

  const DATA_VERSION = "4";

  const STORAGE_KEYS = {
    MENU: "dtri_menu",
    POSTS: "dtri_posts",
    VERSION: "dtri_data_version",
    SEED_FP: "dtri_seed_fingerprint",
  };

  /** File dữ liệu thật do crawl.js tạo ra (cùng thư mục với trang web) */
  const SEED_URL = "posts.json";

  /** Một số chuyên mục cha có đường dẫn gốc trên báo khác với slug dùng cho route */
  const PARENT_PATHS = { xe: "o-to-xe-may", "nhan-ai": "tam-long-nhan-ai" };

  const DEFAULT_SOURCE = "dantri.com.vn";
  const BASE_URL = "https://dantri.com.vn";

  /* ------------------------------------------------------------------ *
   * 1. TIỆN ÍCH
   * ------------------------------------------------------------------ */

  /** Chuyển tiếng Việt có dấu -> slug không dấu, phân tách bằng dấu gạch ngang */
  function slugify(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // bỏ dấu tổ hợp
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ") // bỏ ký tự đặc biệt
      .trim()
      .replace(/[\s-]+/g, "-") // gộp khoảng trắng / gạch ngang liên tiếp
      .replace(/^-+|-+$/g, "");
  }

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  /** Date -> "YYYY-MM-DD HH:mm" */
  function formatDateTime(d) {
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  /** Date -> "YYYYMMDDHHmmssSSS" (dùng tạo id) */
  function compactTimestamp(d) {
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`
    );
  }

  function safeParse(json, fallback) {
    try {
      const v = JSON.parse(json);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  /* ------------------------------------------------------------------ *
   * 2. MENU PHÂN CẤP (đúng các chuyên mục của trang mẫu)
   *    Cú pháp: [tiêu đề, slug, [tiêu đề các chuyên mục con]]
   *    (Hiển thị IN HOA được xử lý bằng CSS text-transform ở giao diện)
   * ------------------------------------------------------------------ */

  const CATEGORY_DEFS = [
    ["Thế giới", "the-gioi", [
      "Quân sự", "Phân tích - Bình luận", "Thế giới đó đây", "Kiều bào",
    ]],
    ["Thời sự", "thoi-su", [
      "Chính trị", "Đưa nghị quyết của Đảng vào cuộc sống", "Bầu cử đại biểu Quốc hội",
      "Học tập Bác", "Môi trường", "Giao thông", "Nóng trên mạng",
    ]],
    ["Pháp luật", "phap-luat", [
      "Hồ sơ vụ án", "Pháp đình",
    ]],
    ["Sức khỏe", "suc-khoe", [
      "Ung thư", "Sống khỏe", "Thận & bệnh mạn tính", "Tầm soát - Chẩn đoán",
      "Sinh sản - Hiếm muộn", "Ngoại thần kinh - Cột sống", "Chấm dứt cơn đau",
      "Tư vấn y khoa", "Thuốc và giải pháp hỗ trợ",
    ]],
    ["Đời sống", "doi-song", [
      "Cộng đồng", "Thượng lưu", "Nhà đẹp", "Giới trẻ", "Chợ online", "Xổ số",
      "Cuộc thi ảnh Việt Nam trong tôi",
    ]],
    ["Du lịch", "du-lich", [
      "Tin tức", "Khám phá", "Món ngon - Điểm đẹp", "Tour hay - Khuyến mại", "Video - Ảnh",
    ]],
    ["Kinh doanh", "kinh-doanh", [
      "Tài chính", "Chứng khoán", "Doanh nghiệp", "Khởi nghiệp", "Tiêu dùng",
      "ESG Việt Nam", "Tin Bước cùng Việt Nam", "Toàn cảnh kinh tế tư nhân",
    ]],
    ["Bất động sản", "bat-dong-san", [
      "Dự án", "Thị trường", "Nhà đất", "Nhịp sống đô thị", "Sống xanh", "Nội thất",
    ]],
    ["Thể thao", "the-thao", [
      "Bóng đá", "Pickleball", "Tennis", "Golf", "Võ thuật - Các môn khác",
      "Hậu trường", "Thể thao sức bền", "Lịch thi đấu",
    ]],
    ["Giải trí", "giai-tri", [
      "Hậu trường", "Sách hay", "Điện ảnh", "Âm nhạc", "Thời trang",
      "Mỹ thuật - Sân khấu", "Tết 2026",
    ]],
    ["Giáo dục", "giao-duc", [
      "Góc phụ huynh", "Khuyến học", "Gương sáng", "Giáo dục - Nghề nghiệp",
      "Du học", "Tuyển sinh", "Cuộc thi 50 năm Thành phố trong tôi",
    ]],
    ["Xe ++", "xe", [
      "Thị trường xe", "Chọn xe", "Xe điện", "Chăm xe", "Diễn đàn xe",
      "Thi lý thuyết bằng lái xe",
    ]],
    ["Nội vụ", "noi-vu", [
      "Chính sách", "Tổ chức bộ máy", "Tiền lương", "Công sở", "An ninh",
      "Sắp xếp các đơn vị hành chính", "Đại hội thi đua yêu nước XI",
    ]],
    ["Nhân ái", "nhan-ai", [
      "Hoàn cảnh", "Dự án cộng đồng", "Nhịp cầu nhân ái", "Vượt lên số phận",
    ]],
  ];

  /**
   * Dựng menu. Mỗi nút gồm: id, title, url, type (+ slug, children nếu có).
   * `slug` là định danh dùng cho route; luôn duy nhất toàn menu
   * (ví dụ "Hậu trường" xuất hiện ở Thể thao và Giải trí -> thêm hậu tố cha).
   */
  function buildDefaultMenu() {
    // Đếm số lần xuất hiện của tiêu đề con để phát hiện trùng tên
    const counts = {};
    CATEGORY_DEFS.forEach((def) =>
      def[2].forEach((t) => {
        const s = slugify(t);
        counts[s] = (counts[s] || 0) + 1;
      })
    );

    const menu = [{ id: "home", title: "Trang chủ", url: `${BASE_URL}/`, type: "home", slug: "" }];

    CATEGORY_DEFS.forEach((def) => {
      const [title, slug, childTitles] = def;
      const node = {
        id: slug,
        title: title,
        url: `${BASE_URL}/${PARENT_PATHS[slug] || slug}.htm`,
        type: childTitles.length ? "parent" : "category",
        slug: slug,
      };
      if (childTitles.length) {
        node.children = childTitles.map((ct, i) => {
          const base = slugify(ct);
          const childSlug = counts[base] > 1 ? `${base}-${slug}` : base;
          return {
            id: `${slug}-${i + 1}`,
            title: ct,
            url: `${BASE_URL}/${PARENT_PATHS[slug] || slug}/${base}.htm`,
            type: "child",
            slug: childSlug,
          };
        });
      }
      menu.push(node);
    });
    return menu;
  }

  /* ------------------------------------------------------------------ *
   * 3. BÀI VIẾT GIẢ LẬP: 10 BÀI CHO MỖI CHUYÊN MỤC (CHA VÀ CON)
   * ------------------------------------------------------------------ */

  const AUTHORS = [
    "Minh Anh", "Hoàng Nam", "Thu Hà", "Quốc Bảo", "Lan Phương",
    "Đức Thịnh", "Ngọc Mai", "Văn Toàn", "Khánh Linh", "Hải Đăng",
  ];

  const TITLE_TEMPLATES = [
    "{c}: Những điều cần biết về diễn biến mới nhất trong tuần",
    "Toàn cảnh {c} - điểm nhấn nổi bật khiến dư luận quan tâm",
    "Chuyên gia nói gì về xu hướng mới của mảng {c}?",
    "Cập nhật nóng: {c} ghi nhận thay đổi đáng chú ý",
    "Phía sau câu chuyện {c} gây chú ý trong những ngày qua",
    "{c} năm 2026: Cơ hội và thách thức đặt ra cho người dân",
    "Nhìn lại một năm biến động của {c} qua những con số",
    "Người trẻ nghĩ gì về vấn đề đang nóng của {c}?",
    "Giải pháp nào cho bài toán khó trong lĩnh vực {c}?",
    "Hỏi - đáp nhanh: Quy định mới liên quan đến {c} từ tháng này",
  ];

  const EXCERPT_POOL = [
    "Thông tin mới nhất về mảng {c} đang thu hút sự chú ý của đông đảo bạn đọc và dư luận trong những ngày qua.",
    "Nhiều ý kiến chuyên gia cùng phản hồi từ người dân xoay quanh mảng {c} đã được ghi nhận, mở ra những góc nhìn đa chiều.",
    "Diễn biến mới của mảng {c} cho thấy nhiều thay đổi đáng chú ý, đặt ra yêu cầu về giải pháp phù hợp trong thời gian tới.",
    "Từ thực tế tại nhiều địa phương, câu chuyện của mảng {c} tiếp tục được cơ quan chức năng và người dân theo dõi sát sao.",
  ];

  const PARAGRAPH_POOL = [
    "Theo ghi nhận của phóng viên, vấn đề này đang nhận được sự quan tâm lớn từ đông đảo bạn đọc và các cơ quan chức năng.",
    "Đại diện đơn vị liên quan cho biết sẽ tiếp tục theo dõi sát sao và có những điều chỉnh phù hợp trong thời gian tới.",
    "Các chuyên gia nhận định, để giải quyết căn cơ cần có sự phối hợp đồng bộ giữa nhiều bên và lộ trình thực hiện rõ ràng.",
    "Nhiều người dân bày tỏ mong muốn thông tin được công khai, minh bạch để cùng giám sát và đóng góp ý kiến.",
    "Số liệu thống kê cho thấy xu hướng này đã tăng đều trong những quý gần đây, tạo ra không ít áp lực cho cơ quan quản lý.",
    "Bên cạnh những mặt tích cực, vẫn còn không ít khó khăn, vướng mắc cần được tháo gỡ kịp thời để đảm bảo hiệu quả.",
    "Phóng viên Dân trí sẽ tiếp tục cập nhật diễn biến của sự việc trong những bài viết tiếp theo.",
  ];

  /** Bài giả lập có đặc điểm: tác giả nằm trong AUTHORS và đoạn đầu nằm trong PARAGRAPH_POOL */
  function isMockPost(p) {
    return (
      p &&
      AUTHORS.includes(p.author) &&
      PARAGRAPH_POOL.includes(String(p.content || "").split("\n")[0])
    );
  }

  function buildMockPosts(menu) {
    const posts = [];
    const usedSlugs = new Set();
    const base = new Date(2026, 8, 28, 12, 22, 46, 655); // 28/09/2026 12:22:46.655
    let counter = 0;

    /** Tạo 10 bài cho một chuyên mục; categoryArr là mảng tên chuyên mục của bài */
    function makeTen(label, categoryArr, parentSlug) {
      for (let i = 0; i < 10; i++) {
        counter++;
        const d = new Date(base.getTime() - counter * 37 * 60 * 1000); // lùi 37 phút/bài
        const title = TITLE_TEMPLATES[i].replace("{c}", label);

        // slug duy nhất (đề phòng trùng tiêu đề giữa các chuyên mục cùng tên)
        let slug = slugify(title);
        if (usedSlugs.has(slug)) slug = `${slug}-${counter}`;
        usedSlugs.add(slug);

        const paragraphs = [];
        for (let p = 0; p < 4; p++) {
          paragraphs.push(PARAGRAPH_POOL[(i + p) % PARAGRAPH_POOL.length]);
        }
        const stamp = compactTimestamp(d);

        posts.push({
          id: `dtri-${stamp}`,
          title: title,
          slug: slug,
          excerpt: EXCERPT_POOL[(i + counter) % EXCERPT_POOL.length].replace("{c}", label),
          content: paragraphs.join("\n"),
          author: AUTHORS[(counter - 1) % AUTHORS.length],
          category: categoryArr.slice(),
          publishedAt: formatDateTime(d),
          source: DEFAULT_SOURCE,
          url: `${BASE_URL}/${parentSlug}/${slug}-${stamp}.htm`,
        });
      }
    }

    menu
      .filter((m) => m.type !== "home")
      .forEach((cat) => {
        makeTen(cat.title, [cat.title], cat.slug); // 10 bài riêng của chuyên mục cha
        (cat.children || []).forEach((child) =>
          makeTen(child.title, [cat.title, child.title], cat.slug) // 10 bài cho mỗi chuyên mục con
        );
      });

    return posts;
  }

  /* ------------------------------------------------------------------ *
   * 4. KHỞI TẠO & CRUD LOCALSTORAGE
   * ------------------------------------------------------------------ */

  /** Ghi danh sách bài; nếu LocalStorage đầy thì rút gọn nội dung rồi ghi lại */
  function storePosts(posts) {
    try {
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
      return true;
    } catch (e) {
      const trimmed = posts.map((p) => {
        const lines = String(p.content || "").split("\n");
        const keep = [];
        let len = 0;
        for (const line of lines) {
          if (keep.length >= 2 && len + line.length > 2500) break;
          keep.push(line);
          len += line.length;
        }
        return Object.assign({}, p, { content: keep.join("\n") });
      });
      try {
        localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(trimmed));
        return true;
      } catch (e2) {
        console.error("[DataStore] LocalStorage đầy, không thể lưu bài viết:", e2);
        return false;
      }
    }
  }

  /**
   * Khởi tạo dữ liệu (bất đồng bộ):
   *  1. Menu: dựng mới khi đổi phiên bản.
   *  2. Bài viết: ưu tiên nạp posts.json (dữ liệu thật). Bài do Crawler thêm tay được giữ lại.
   *  3. Không có posts.json: dùng bài giả lập như trước.
   * Trả về Promise; các trang chờ `DataStore.ready` trước khi đọc dữ liệu.
   */
  async function init() {
    let menu, posts, upgraded;
    try {
      const currentVersion = localStorage.getItem(STORAGE_KEYS.VERSION);
      menu = safeParse(localStorage.getItem(STORAGE_KEYS.MENU), null);
      posts = safeParse(localStorage.getItem(STORAGE_KEYS.POSTS), null);
      upgraded =
        currentVersion !== DATA_VERSION ||
        !Array.isArray(menu) || menu.length === 0 ||
        !Array.isArray(posts);
      if (upgraded) {
        menu = buildDefaultMenu();
        localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
      }
    } catch (e) {
      console.error("[DataStore] Không thể khởi tạo LocalStorage:", e);
      return;
    }

    // 1) Dữ liệu thật từ posts.json
    let seeded = false;
    try {
      const res = await fetch(SEED_URL, { cache: "no-store" });
      if (res.ok) {
        const seed = await res.json();
        if (Array.isArray(seed) && seed.length > 0) {
          seeded = true;
          const fp = `${seed.length}:${seed[0].id}:${seed[seed.length - 1].id}`;
          if (localStorage.getItem(STORAGE_KEYS.SEED_FP) !== fp) {
            const seedIds = new Set(seed.map((p) => p.id));
            const own = (Array.isArray(posts) ? posts : []).filter(
              (p) => !isMockPost(p) && !seedIds.has(p.id)
            );
            posts = seed.concat(own);
            storePosts(posts);
            localStorage.setItem(STORAGE_KEYS.SEED_FP, fp);
          }
        }
      }
    } catch (e) {
      // không có posts.json (hoặc mở trực tiếp bằng file://) -> dùng dữ liệu đang có
    }

    // 2) Dự phòng: bài giả lập
    try {
      if (!seeded && upgraded) {
        const crawled = Array.isArray(posts) ? posts.filter((p) => !isMockPost(p)) : [];
        const crawledIds = new Set(crawled.map((p) => p.id));
        const mock = buildMockPosts(menu).filter((p) => !crawledIds.has(p.id));
        storePosts(crawled.concat(mock));
      }
      localStorage.setItem(STORAGE_KEYS.VERSION, DATA_VERSION);
    } catch (e) {
      console.error("[DataStore] Không thể ghi dữ liệu:", e);
    }
  }

  function getMenu() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.MENU), []);
  }

  function getPosts() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.POSTS), []);
  }

  function getPostById(id) {
    return getPosts().find((p) => p.id === id) || null;
  }

  function getPostBySlug(slug) {
    return getPosts().find((p) => p.slug === slug) || null;
  }

  /** Lấy bài theo tên chuyên mục (khớp bất kỳ phần tử trong mảng category) */
  function getPostsByCategory(name) {
    return getPosts().filter((p) => Array.isArray(p.category) && p.category.includes(name));
  }

  /**
   * Lưu 1 bài viết. Kiểm tra trùng id: nếu trùng thì KHÔNG ghi đè.
   * @returns {{ok:boolean, duplicated:boolean, message:string}}
   */
  function savePost(post) {
    const posts = getPosts();
    if (posts.some((p) => p.id === post.id)) {
      return { ok: false, duplicated: true, message: `Bài viết id "${post.id}" đã tồn tại, không ghi đè.` };
    }
    posts.unshift(post); // bài mới lên đầu
    try {
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    } catch (e) {
      return { ok: false, duplicated: false, message: "Lỗi ghi LocalStorage (có thể đã đầy): " + e.message };
    }
    return { ok: true, duplicated: false, message: "Đã lưu bài viết vào LocalStorage." };
  }

  /** Xóa toàn bộ dữ liệu và khởi tạo lại dữ liệu mẫu (tiện khi test) */
  function reset() {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    return init();
  }

  // Tự khởi tạo khi nạp file; các trang dùng DataStore.ready.then(...) để chờ xong
  const ready = init();

  global.DataStore = {
    KEYS: STORAGE_KEYS,
    DEFAULT_SOURCE: DEFAULT_SOURCE,
    slugify: slugify,
    formatDateTime: formatDateTime,
    init: init,
    ready: ready,
    reset: reset,
    getMenu: getMenu,
    getPosts: getPosts,
    getPostById: getPostById,
    getPostBySlug: getPostBySlug,
    getPostsByCategory: getPostsByCategory,
    savePost: savePost,
  };
})(window);
