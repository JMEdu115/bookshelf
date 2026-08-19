/**
 * 竹林七賢・國風閱讀化身導航模組
 * 結合國風潑墨 Q 版視覺，提供七大閱讀維度導讀、主題聯想與藏書篩選
 */

export const SAGES = [
  {
    id: 'ji_kang',
    name: '嵇康',
    action: '撫琴',
    badge: '經典精讀・思想哲學',
    quote: '「何玉之可求，何金之可鍛。」',
    desc: '魏晉名士之首，神清氣爽，工於詩賦，尤善鼓琴。專注於需要沉靜心靈、反覆咀嚼的傳世經典與哲思大作。',
    img: '/icons/sages/ji_kang.jpg',
    keywords: ['哲學', '經典', '思辨', '人文', '思想', '心理']
  },
  {
    id: 'ruan_ji',
    name: '阮籍',
    action: '嘯傲',
    badge: '隨性閱覽・散文隨筆',
    quote: '「時無英雄，使豎子成名！」',
    desc: '步兵校尉，任誕不羈，長嘯山林。不帶功利目的，享受自在放鬆、字裡行間性情漫遊的散文、遊記與生活觀察。',
    img: '/icons/sages/ruan_ji.jpg',
    keywords: ['散文', '文學', '遊記', '生活', '隨筆', '飲食']
  },
  {
    id: 'liu_ling',
    name: '劉伶',
    action: '醉酒',
    badge: '靈感微醺・跨界創意',
    quote: '「我以天地為棟宇，屋室為褌衣。」',
    desc: '嗜酒如命，幕天席地，著《酒德頌》。專治思維框架僵化，探索打破常規的科幻、狂想、跨界靈感與腦洞新知。',
    img: '/icons/sages/liu_ling.jpg',
    keywords: ['創意', '科幻', '靈感', '想像', '跨界', '未來']
  },
  {
    id: 'ruan_xian',
    name: '阮咸',
    action: '撫阮',
    badge: '音樂音律・藝術美學',
    quote: '「神解通音，妙入神品。」',
    desc: '精通音律，妙解琴韻，阮咸琵琶名揚天下。涵蓋視覺、聽覺、排版美感、詩詞韻律與跨界影音藝術。',
    img: '/icons/sages/ruan_xian.jpg',
    keywords: ['藝術', '音樂', '美學', '設計', '影音', '建築']
  },
  {
    id: 'xiang_xiu',
    name: '向秀',
    action: '註莊',
    badge: '深度摘記・書評考據',
    quote: '「妙析微言，發明奇趣。」',
    desc: '註解《莊子》發明新義，作《思舊賦》。專門字斟句酌、隨書批註，摘錄引文與出處的硬核筆記狂人。',
    img: '/icons/sages/xiang_xiu.jpg',
    keywords: ['筆記', '考據', '註釋', '論述', '研究', '歷史']
  },
  {
    id: 'shan_tao',
    name: '山濤',
    action: '品茗',
    badge: '選書伯樂・書單導航',
    quote: '「璞玉渾金，人皆欽其寶。」',
    desc: '雅量宏深，識拔人才，舉賢任能。慧眼識好書，負責為讀者與學生篩選最值得閱讀的必讀書單與成長導航。',
    img: '/icons/sages/shan_tao.jpg',
    keywords: ['教育', '教學', '成長', '推薦', '導讀', '班級經營']
  },
  {
    id: 'wang_rong',
    name: '王戎',
    action: '辨李',
    badge: '商業實戰・工具效率',
    quote: '「樹在道邊而多子，此必苦李。」',
    desc: '幼時識苦李，長於理財治產。一眼看穿本質、重視效率產出與方法論的商業管理、生產力與工具指南。',
    img: '/icons/sages/wang_rong.jpg',
    keywords: ['商業', '理財', '管理', '工具', '生產力', '效率', '科技']
  }
];

export function renderSagesView(books = []) {
  return `
    <section class="sages-container">
      <div class="sages-hero">
        <div class="sages-hero-img-wrap">
          <img src="/icons/sages/bamboo_seven_sages.jpg" alt="竹林七賢雅集圖" class="sages-hero-img">
        </div>
        <div class="sages-hero-text">
          <h2>🎋 竹林七賢・閱讀分身導航</h2>
          <p>取魏晉名士之灑脫風骨，化為七大藏書維度。點擊各賢士探索專屬領域，引經據典、指引閱讀航道。</p>
        </div>
      </div>

      <div class="sages-grid">
        ${SAGES.map(sage => {
          const matchedCount = books.filter(b => {
            const allText = `${b.title} ${(b.topics || []).join(' ')} ${b.review || ''}`.toLowerCase();
            return sage.keywords.some(k => allText.includes(k.toLowerCase()));
          }).length;

          return `
            <article class="sage-card" data-sage-id="${sage.id}">
              <div class="sage-avatar-wrap">
                <img src="${sage.img}" alt="${sage.name}${sage.action}" class="sage-avatar" loading="lazy">
                <span class="sage-pill">${sage.name}・${sage.action}</span>
              </div>
              <div class="sage-content">
                <div class="sage-header">
                  <h3 class="sage-title">${sage.name} <span class="sage-badge">${sage.badge}</span></h3>
                  <p class="sage-quote">${sage.quote}</p>
                </div>
                <p class="sage-desc">${sage.desc}</p>
                <div class="sage-keywords">
                  <span class="kw-label">涵蓋主題：</span>
                  ${sage.keywords.map(kw => `<button type="button" class="chip sage-kw-btn" data-search-kw="${kw}">${kw}</button>`).join('')}
                </div>
                <div class="sage-footer">
                  <span class="sage-match-count">館內相關約 <strong>${matchedCount}</strong> 本</span>
                  <button type="button" class="btn secondary small sage-explore-btn" data-sage-search="${sage.keywords[0]}">探索此類藏書 →</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}
