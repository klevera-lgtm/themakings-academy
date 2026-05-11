/**
 * 학교별 내신 학원 크롤러 (키워드 매칭 - 무료 버전)
 * 네이버 블로그 검색 + 정규식 패턴으로 학원명 자동 추출
 * Anthropic API 불필요 — 네이버 API만 있으면 됨
 * 
 * 사용법:
 *   1. npm install
 *   2. .env 에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 설정
 *   3. node scripts/crawl-academies.js 양천구
 *   4. node scripts/generate-pages.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const DELAY_MS = 500;

// === 과목 키워드 ===
const SUBJECT_KEYWORDS = {
  '국어': ['국어', '논술', '독서', '문학', '비문학', '화작'],
  '영어': ['영어', 'english', '영문', '어학', '잉글', '토플', '텝스'],
  '수학': ['수학', '산수', '매스', 'math', '기하', '미적'],
  '과학': ['과학', '물리', '화학', '생물', '생명', '지구과학', '과탐'],
  '사회': ['사회', '역사', '한국사', '세계사', '경제', '정치', '지리', '사탐'],
};

// === 학원명 패턴 ===
const SUFFIXES = ['학원', '어학원', '아카데미', '스쿨', '교습소', '에듀'];
const ACADEMY_REGEX = new RegExp(`([가-힣A-Za-z0-9]{2,12}(?:${SUFFIXES.join('|')}))`, 'g');

const EXCLUDE = new Set([
  '학원가', '대학원', '유치원',
  '좋은학원', '유명학원', '근처학원', '주변학원', '동네학원',
  '이학원', '그학원', '저학원', '어떤학원', '어느학원',
  '다른학원', '여러학원', '많은학원', '같은학원', '무슨학원',
  '보습학원', '종합학원', '전문학원', '입시학원', '우리학원',
  '해당학원', '일반학원', '사설학원', '개인학원', '온라인학원',
  '네이버학원', '블로그학원', '추천학원', '인기학원', '최고학원',
]);

const EXCLUDE_ENDINGS = [
  '학원을', '학원에', '학원의', '학원이', '학원은', '학원도',
  '학원과', '학원으로', '학원에서', '학원인지', '학원부터',
  '학원선택', '학원추천', '학원정보', '학원리스트', '학원비용',
  '학원수업', '학원관리', '학원상담', '학원등록', '학원문의',
  '학원비', '학원생',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function strip(html) {
  return (html || '').replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/g, ' ').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function naverBlog(query, n = 20) {
  const p = new URLSearchParams({ query, display: String(n), start: '1', sort: 'sim' });
  const r = await fetch(`https://openapi.naver.com/v1/search/blog.json?${p}`, {
    headers: { 'X-Naver-Client-Id': NAVER_CLIENT_ID, 'X-Naver-Client-Secret': NAVER_CLIENT_SECRET }
  });
  if (!r.ok) throw new Error(`Naver ${r.status}`);
  return r.json();
}

function extractNames(text) {
  const raw = text.match(ACADEMY_REGEX) || [];
  return [...new Set(raw.filter(n => {
    if (n.length < 4) return false;
    if (EXCLUDE.has(n)) return false;
    if (EXCLUDE_ENDINGS.some(e => n.endsWith(e))) return false;
    if (/^[0-9]/.test(n)) return false;
    return true;
  }))];
}

function classify(text, name) {
  const t = (text + ' ' + name).toLowerCase();
  for (const [subj, kws] of Object.entries(SUBJECT_KEYWORDS)) {
    if (kws.some(k => t.includes(k))) return subj;
  }
  return '기타';
}

async function crawlSchool(schoolName, area) {
  process.stdout.write(`🔍 ${schoolName} ... `);
  const map = new Map();

  const queries = [
    `${schoolName} 내신 학원`,
    `${schoolName} 내신 전문 ${area}`,
    `${schoolName} 내신 대비 학원`,
  ];

  for (const q of queries) {
    try {
      const res = await naverBlog(q);
      if (!res.items) continue;
      for (const item of res.items) {
        const date = item.postdate || '';
        if (date && date < '20230101') continue;
        const text = strip(item.title) + ' ' + strip(item.description);
        for (const name of extractNames(text)) {
          const prev = map.get(name);
          if (prev) {
            prev.mentions++;
            const s = classify(text, name);
            if (!prev.subjects.includes(s)) prev.subjects.push(s);
          } else {
            map.set(name, { name, mentions: 1, subjects: [classify(text, name)] });
          }
        }
      }
      await sleep(DELAY_MS);
    } catch (e) { /* skip */ }
  }

  if (map.size === 0) { console.log('없음'); return null; }

  const all = [...map.values()].sort((a, b) => b.mentions - a.mentions);
  const result = {
    school: schoolName,
    updated: new Date().toISOString().split('T')[0],
    subjects: { '국어': [], '영어': [], '수학': [], '과학': [], '사회': [], '기타': [] }
  };

  for (const a of all) {
    const subj = a.subjects[0] || '기타';
    const bucket = result.subjects[subj] || result.subjects['기타'];
    bucket.push({
      name: a.name,
      mentions: a.mentions,
      address: '',
      phone: '',
      source: `블로그 자동 수집 (${a.mentions}회 언급)`
    });
  }

  const total = all.length;
  const reliable = all.filter(a => a.mentions >= 2).length;
  console.log(`${total}개 (2회+ 언급: ${reliable}개)`);
  return result;
}

async function main() {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.error('❌ .env 에 네이버 API 키를 설정하세요:');
    console.error('   NAVER_CLIENT_ID=xxx');
    console.error('   NAVER_CLIENT_SECRET=xxx');
    console.error('   https://developers.naver.com → 애플리케이션 등록 → 검색 API');
    process.exit(1);
  }

  const region = process.argv[2] || '양천구';
  const dataFile = path.join(__dirname, '..', 'data', `${region}-schools.json`);
  if (!fs.existsSync(dataFile)) { console.error(`❌ ${dataFile} 없음`); process.exit(1); }

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  const schools = [...data.high_schools, ...data.middle_schools];
  const outDir = path.join(__dirname, '..', 'data', 'academies');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n🏫 ${region} — ${schools.length}개 학교 크롤링\n${'='.repeat(50)}`);

  let ok = 0, total = 0;
  for (let i = 0; i < schools.length; i++) {
    const s = schools[i];
    process.stdout.write(`[${i + 1}/${schools.length}] `);
    const result = await crawlSchool(s.name, s.area || region);
    if (result) {
      fs.writeFileSync(path.join(outDir, `${s.name}.json`), JSON.stringify(result, null, 2));
      total += Object.values(result.subjects).reduce((s, a) => s + a.length, 0);
      ok++;
    }
    await sleep(800);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 ${ok}/${schools.length} 학교, ${total}개 학원 추출`);
  console.log(`📄 다음: node scripts/generate-pages.js`);
}

main().catch(e => { console.error(e); process.exit(1); });
