/**
 * 示範網站預載藏書資料庫
 * 涵蓋竹林七賢七大維度：哲學經典、散文隨筆、創意腦洞、藝術美學、考據註釋、教育導讀、實戰管理
 */

export const DEMO_BOOKS = [
  {
    id: 'demo-1',
    isbn: '9789861371955',
    title: '被討厭的勇氣：自我啟發之父「阿德勒」的教導',
    authors: '岸見一郎，古賀史健',
    translator: '葉小燕',
    publisher: '究竟',
    published: '2014-10-30',
    published_year: 2014,
    series: '心靈成長',
    edition: '初版',
    cover_url: 'https://books.google.com/books/content?id=9a02AwAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    description: '阿德勒心理學以對話形式展開，探討人際關係的煩惱、課題分離與自由的本質。',
    location_kind: 'physical',
    location: '客廳主書架 A1',
    start_date: '2026-01-10',
    finish_date: '2026-01-18',
    status: 'done',
    lend_to: '',
    lend_date: '',
    reading_reason: '理解個體心理學在人際界線與班級經營中的實踐方式。',
    key_question: '如何不被他人的評價所束縛，活出真正的自由？',
    last_reviewed_at: '2026-06-01',
    topics: ['哲學', '心理', '思辨', '班級經營', '成長'],
    audience: '國中生、家長、教師、想要重構人際界線的讀者',
    review: '非常具啟發性的對話錄。阿德勒並非否定過去，而是強調「人是主動賦予過去意義的存在」。課題分離的概念對親師溝通與自我減壓極有幫助。',
    review_log: [
      { date: '2026-01-18', text: '初讀完畢，深刻體會到「課題分離」是所有人際關係清爽的起點。' },
      { date: '2026-06-01', text: '在班級經營中應用課題分離：區分學生的學習責任與老師的輔導責任。' }
    ],
    actions: [
      { date: '2026-01-20', text: '設計一堂「人際界線與課題分離」的班會引導教案。' }
    ],
    highlights: [
      {
        text: '基本上，一切煩惱都是人際關係的煩惱。要消除所有的煩惱，宇宙中就必須只剩下自己一個人。',
        page: '72',
        tags: '人際關係, 心理, 核心概念',
        my_take: '直指問題本質，所有焦慮都來自於我們太在乎他人眼光。',
        kind: 'exact'
      },
      {
        text: '我們並不是因為受過創傷而痛苦，而是為了達到某個目的，自己選擇了拿創傷當藉口。',
        page: '45',
        tags: '目的論, 自由',
        my_take: '決定論讓人無力，目的論則重新賦予我們改變的掌控權。',
        kind: 'exact'
      },
      {
        text: '阿德勒認為「課題分離」是人際關係的入口：區分「這是誰的課題」，絕不去干涉別人的課題，也不讓別人干涉自己的課題。',
        page: '138',
        tags: '課題分離, 班級經營',
        my_take: '適合在親職講座中引用的金句。',
        kind: 'gist'
      }
    ],
    related: ['demo-2', 'demo-6']
  },
  {
    id: 'demo-2',
    isbn: '9789863984573',
    title: '原子習慣：細微改變帶來巨大成就的實踐指南',
    authors: '詹姆斯・克利爾 (James Clear)',
    translator: '蔡世偉',
    publisher: '方智',
    published: '2019-06-01',
    published_year: 2019,
    series: '自我成長',
    edition: '初版',
    cover_url: 'https://books.google.com/books/content?id=0sCqDwAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    description: '行為改變四法則：讓提示顯而易見、讓習慣有吸引力、讓行動輕而易舉、讓獎賞令人滿足。',
    location_kind: 'physical',
    location: '辦公室桌面常用書',
    start_date: '2026-02-01',
    finish_date: '2026-02-08',
    status: 'reference',
    lend_to: '',
    lend_date: '',
    reading_reason: '建立系統化班級常規與個人每日寫作工作流。',
    key_question: '如何靠環境設計與微小習慣，達成長期的指數型成長？',
    last_reviewed_at: '2026-07-15',
    topics: ['習慣', '生產力', '工具', '管理', '成長'],
    audience: '所有想改善生活作息、提高工作效率與建立持續產出系統的人',
    review: '實用性極高。核心在於「身分認同的改變」加上「系統比目標更重要」。每天進步 1%，一年後會進步 37 倍。',
    review_log: [
      { date: '2026-02-08', text: '讀畢，將寫作習慣綁定在晨間喝咖啡後的第一個 25 分鐘番茄鐘。' }
    ],
    actions: [
      { date: '2026-02-15', text: '落實兩分鐘法則：每天開電腦先寫 100 字教學筆記。' }
    ],
    highlights: [
      {
        text: '目標決定了你想要達到的方向，而系統則決定了你的進步過程。你不會上升到目標的高度，而是會降落到系統的水準。',
        page: '38',
        tags: '系統思維, 生產力',
        my_take: '經典觀念：專注打造好系統，好結果是自然湧現的副產品。',
        kind: 'exact'
      },
      {
        text: '建立習慣最有效的方法，就是把重點放在你想成為什麼樣的人，而非你想達成什麼成果。每一次行動都是對你想成為的那種人投下一票。',
        page: '52',
        tags: '身分認同, 行為設計',
        my_take: '從「我想看書」轉變成「我是個熱愛閱讀的人」。',
        kind: 'exact'
      }
    ],
    related: ['demo-1', 'demo-7']
  },
  {
    id: 'demo-3',
    isbn: '9789571383569',
    title: '莊子現代讀本',
    authors: '張遠山',
    translator: '',
    publisher: '時報出版',
    published: '2020-09-15',
    published_year: 2020,
    series: '國學經典',
    edition: '平裝版',
    cover_url: '',
    description: '全景式註解《莊子》內七篇，剖析道家齊物平等、逍遙自在的精神境界。',
    location_kind: 'physical',
    location: '書房古籍經典架 B3',
    start_date: '2025-11-01',
    finish_date: '2025-12-20',
    status: 'done',
    lend_to: '',
    lend_date: '',
    reading_reason: '精讀莊子內篇，體會魏晉玄學與竹林七賢思想淵源。',
    key_question: '在複雜多變的世俗現實中，如何保全真性情與精神自由？',
    last_reviewed_at: '2026-05-10',
    topics: ['經典', '哲學', '文學', '考據', '人文'],
    audience: '國文教師、古典文學愛好者、尋求心靈安頓的現代人',
    review: '向秀註莊、郭象續成，莊子思想是中國文人失意時最大的精神庇護所。逍遙遊的大鵬展翅與齊物論的萬物一體，讀來令人胸襟開闊。',
    review_log: [
      { date: '2025-12-20', text: '讀畢內篇七篇，深感《養生主》的庖丁解牛乃是實踐技藝與精神自由的極致融合。' }
    ],
    actions: [
      { date: '2026-03-01', text: '融入中學國文課文《莊子選》補充講義設計。' }
    ],
    highlights: [
      {
        text: '鷦鷯巢於深林，不過一枝；偃鼠飲河，不過滿腹。',
        page: '14',
        tags: '逍遙遊, 知足, 哲理',
        my_take: '慾望有限，心靈方能海闊天空。',
        kind: 'exact'
      },
      {
        text: '彼亦一是非，此亦一是非。物無非彼，物無非是。',
        page: '58',
        tags: '齊物論, 視角, 思想',
        my_take: '跳脫二元對立，學會從更高維度理解不同立場。',
        kind: 'exact'
      }
    ],
    related: ['demo-1', 'demo-4']
  },
  {
    id: 'demo-4',
    isbn: '9789863448402',
    title: '台北人',
    authors: '白先勇',
    translator: '',
    publisher: '爾雅',
    published: '2021-01-01',
    published_year: 2021,
    series: '當代文學經典',
    edition: '典藏版',
    cover_url: '',
    description: '十四篇短篇小說，以細膩筆觸書寫現代社會中昔日繁華與今朝滄桑的流轉。',
    location_kind: 'physical',
    location: '客廳側架 文學散文區',
    start_date: '2025-08-01',
    finish_date: '2025-08-10',
    status: 'done',
    lend_to: '',
    lend_date: '',
    reading_reason: '現代華文小說之頂峰，研究短篇小說人物刻劃與今昔對比結構。',
    key_question: '如何用白描與隱喻，在極短篇幅中凝縮一個時代的命運？',
    last_reviewed_at: '2026-04-12',
    topics: ['文學', '散文', '小說', '藝術', '人文'],
    audience: '文學創作者、國文教師、中學生寫作觀摩',
    review: '《永遠的尹雪艷》、《遊園驚夢》、《金大班的最後一夜》，每一篇都是結構嚴謹的經典。語言兼具古典雅致與現代凝鍊。',
    review_log: [
      { date: '2025-08-10', text: '重讀多次依然震撼，文字音樂感與色彩感極強。' }
    ],
    actions: [],
    highlights: [
      {
        text: '尹雪艷總也不老。十幾年前那一班在上海百樂門跟著她混的舞客，回頭想想，都已兩鬢添霜，唯有尹雪艷，依然是那樣一身素白。',
        page: '1',
        tags: '人物描寫, 經典開頭, 文學',
        my_take: '極具象徵意義的經典小說開篇，以靜制動。',
        kind: 'exact'
      }
    ],
    related: ['demo-3']
  },
  {
    id: 'demo-5',
    isbn: '9789865511845',
    title: '致富心態：關於財富、貪婪與幸福的20堂理財心理課',
    authors: '摩根・豪瑟 (Morgan Housel)',
    translator: '周玉文',
    publisher: '天下文化',
    published: '2021-01-27',
    published_year: 2021,
    series: '商業財經',
    edition: '初版',
    cover_url: 'https://books.google.com/books/content?id=M8IaEAAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
    description: '探討人們如何思考金錢、看待風險，以及為什麼理財成功靠的不是智慧，而是行為。',
    location_kind: 'physical',
    location: '書房財經管理區 C2',
    start_date: '2026-03-01',
    finish_date: '2026-03-08',
    status: 'done',
    lend_to: '',
    lend_date: '',
    reading_reason: '建立長期的資產配置心理韌性與安全邊際意識。',
    key_question: '理財成功的關鍵究竟是高超技巧，還是對人性的深刻洞察？',
    last_reviewed_at: '2026-07-20',
    topics: ['商業', '理財', '管理', '工具', '心理'],
    audience: '投資人、職場工作者、想要建立健全金錢觀念的所有讀者',
    review: '王戎式的理性與通透。真正的富有是擁有時間的自由與內心的平靜，而非向他人炫耀帳戶數字。',
    review_log: [
      { date: '2026-03-08', text: '深刻理解「最高形式的富有，是每天早晨醒來時能說：今天我可以做任何我想做的事」。' }
    ],
    actions: [
      { date: '2026-03-10', text: '定期定額持續投資，不隨短期市場波動起舞。' }
    ],
    highlights: [
      {
        text: '最高形式的財富，是每天早晨醒來時能夠對自己說：「今天我可以做我想做的任何事。」',
        page: '112',
        tags: '財富定義, 自由, 幸福',
        my_take: '金錢最大的內在價值，是買回自己時間的自主權。',
        kind: 'exact'
      },
      {
        text: '花錢炫耀自己的財富，是減少財富最快的方法。真正的財富是你看不到的資產——是那些沒有買下來的昂貴汽車或手錶。',
        page: '135',
        tags: '低調, 資產累積',
        my_take: '區分「Rich（高收入/高消費）」與「Wealthy（累積資產）」。',
        kind: 'exact'
      }
    ],
    related: ['demo-2']
  },
  {
    id: 'demo-6',
    isbn: '9789573289005',
    title: '設計的心理學：人性化的產品設計如何改變世界',
    authors: '唐・諾曼 (Don Norman)',
    translator: '陳宜秀',
    publisher: '遠流',
    published: '2014-08-01',
    published_year: 2014,
    series: '設計思維',
    edition: '增訂版',
    cover_url: '',
    description: '從門把、茶壺到手機介面，解析可視性、回饋、示能（Affordance）與意符（Signifier）的設計核心原則。',
    location_kind: 'physical',
    location: '辦公室設計參考架',
    start_date: '2025-09-10',
    finish_date: '2025-09-25',
    status: 'reference',
    lend_to: '',
    lend_date: '',
    reading_reason: '研究數位教材與網頁介面的易用性與人體工學設計。',
    key_question: '如何設計出符合使用者直覺、零挫折感的產品與教學流程？',
    last_reviewed_at: '2026-05-18',
    topics: ['設計', '藝術', '美學', '工具', '教育'],
    audience: 'UI/UX 設計師、產品經理、教材設計者、前端工程師',
    review: '阮咸與向秀的結合體——既有美學通感，又有嚴謹的人因工程分析。當使用者操作出錯時，錯的永遠不是使用者，而是設計者。',
    review_log: [
      { date: '2025-09-25', text: '將「示能與意符」觀念融入班級指引看板與投影片版面設計。' }
    ],
    actions: [],
    highlights: [
      {
        text: '好的設計不需要附帶說明書；如果一件物品需要文字標籤來解釋如何使用，那通常意味著這件物品的設計是不及格的。',
        page: '42',
        tags: '介面設計, 直覺, 示能',
        my_take: '極致的簡約與直覺，是設計追求的終極境界。',
        kind: 'exact'
      }
    ],
    related: ['demo-2']
  },
  {
    id: 'demo-7',
    isbn: '9789862728291',
    title: '槍炮、病菌與鋼鐵：人類社會的命運',
    authors: '賈德・戴蒙 (Jared Diamond)',
    translator: '王道還，廖月娟',
    publisher: '時報出版',
    published: '2019-10-22',
    published_year: 2019,
    series: '歷史大歷史',
    edition: '20週年典藏版',
    cover_url: '',
    description: '從地理、生態、動植物馴化與病菌傳播，探討一萬三千年來各大洲人類文明發展差異的根源。',
    location_kind: 'physical',
    location: '客廳書櫃 歷史社科區 D1',
    start_date: '2025-07-01',
    finish_date: '2025-07-28',
    status: 'done',
    lend_to: '',
    lend_date: '',
    reading_reason: '大歷史視角，探討環境決定論在歷史演化中的深層邏輯。',
    key_question: '為什麼歐亞大陸先發展出槍炮與鋼鐵，而非美洲或非洲？',
    last_reviewed_at: '2026-06-25',
    topics: ['歷史', '考據', '思辨', '創意', '人文'],
    audience: '歷史人文愛好者、社科教師、大歷史架構研究者',
    review: '氣勢恢宏的跨學科巨作。徹底破除種族優劣論，從地理軸線（東西向 vs 南北向）與動植物馴化條件給出令人信服的科學解釋。',
    review_log: [
      { date: '2025-07-28', text: '讀完全書，對地理環境如何深遠塑造人類社會演進有了全新視角。' }
    ],
    actions: [],
    highlights: [
      {
        text: '不同民族的歷史之所以走上不同的道路，是由於他們的環境差異，而不是由於各民族本身在生物學上的特徵差異。',
        page: '28',
        tags: '大歷史, 環境決定, 核心觀點',
        my_take: '全書核心論點，以實證科學粉碎種族主義迷思。',
        kind: 'exact'
      }
    ],
    related: ['demo-3']
  }
];
