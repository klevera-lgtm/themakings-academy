/**
 * 학교별 내신 학원 데이터 수집기 (엑셀 출력)
 * 
 * 카카오 로컬 API → 주변 학원 목록 (이름, 주소, 전화)
 * 네이버 블로그 API → 학교+학원 연관 블로그 (URL, 제목, 날짜)
 * 결과 → 엑셀 파일로 출력
 * 
 * 사용법:
 *   node scripts/collect-data.js 양천구
 * 
 * 필요한 .env:
 *   NAVER_CLIENT_ID=xxx
 *   NAVER_CLIENT_SECRET=xxx
 *   KAKAO_REST_KEY=xxx
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();

const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;
const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const DELAY = 400;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function strip(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// === 카카오: 좌표 검색 ===
async function kakaoCoords(query) {
  const p = new URLSearchParams({ query });
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${p}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
  });
  if (!r.ok) throw new Error(`Kakao ${r.status}`);
  const d = await r.json();
  if (!d.documents.length) return null;
  return { x: d.documents[0].x, y: d.documents[0].y };
}

// === 카카오: 주변 학원 검색 ===
async function kakaoAcademies(query, x, y, radius = 2000, page = 1) {
  const p = new URLSearchParams({
    query, x, y, radius: String(radius),
    sort: 'distance', page: String(page), size: '15',
    category_group_code: 'AC5'
  });
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${p}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
  });
  if (!r.ok) return { documents: [], meta: { is_end: true } };
  return r.json();
}

// === 네이버: 블로그 검색 ===
async function naverBlog(query, display = 20) {
  const p = new URLSearchParams({ query, display: String(display), start: '1', sort: 'sim' });
  const r = await fetch(`https://openapi.naver.com/v1/search/blog.json?${p}`, {
    headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET }
  });
  if (!r.ok) return { items: [] };
  return r.json();
}

// === 학교 주변 학원 수집 (카카오) ===
async function collectKakaoAcademies(schoolName, area) {
  const coords = await kakaoCoords(`${area} ${schoolName}`);
  if (!coords) return [];

  const all = new Map();
  const terms = ['학원', '어학원', '아카데미'];

  for (const term of terms) {
    for (let page = 1; page <= 3; page++) {
      try {
        const data = await kakaoAcademies(`${area} ${term}`, coords.x, coords.y, 2000, page);
        for (const doc of data.documents) {
          if (!all.has(doc.id)) {
            all.set(doc.id, {
              name: doc.place_name,
              address: doc.road_address_name || doc.address_name,
              phone: doc.phone || '',
              kakaoUrl: doc.place_url || '',
              distance: doc.distance,
            });
          }
        }
        if (data.meta.is_end) break;
      } catch { break; }
      await sleep(DELAY);
    }
  }

  return [...all.values()].sort((a, b) => a.distance - b.distance);
}

// === 학교 관련 블로그 수집 (네이버) ===
async function collectBlogs(schoolName) {
  const allBlogs = [];
  const queries = [
    `${schoolName} 내신 학원`,
    `${schoolName} 내신 전문 학원`,
    `${schoolName} 내신 대비`,
  ];

  for (const q of queries) {
    try {
      const res = await naverBlog(q, 20);
      if (res.items) {
        for (const item of res.items) {
          const date = item.postdate || '';
          if (date && date < '20230101') continue;
          allBlogs.push({
            title: strip(item.title),
            description: strip(item.description),
            url: item.link,
            date: date ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : '',
            blogger: item.bloggername || '',
          });
        }
      }
      await sleep(DELAY);
    } catch { /* skip */ }
  }

  // 중복 URL 제거
  const seen = new Set();
  return allBlogs.filter(b => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    return true;
  });
}

// === 메인 ===
async function main() {
  if (!NAVER_ID || !NAVER_SECRET) {
    console.error('❌ .env에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요');
    process.exit(1);
  }
  if (!KAKAO_KEY) {
    console.error('❌ .env에 KAKAO_REST_KEY 필요');
    process.exit(1);
  }

  const region = process.argv[2] || '양천구';
  const dataFile = path.join(__dirname, '..', 'data', `${region}-schools.json`);
  if (!fs.existsSync(dataFile)) {
    console.error(`❌ ${dataFile} 없음`);
    process.exit(1);
  }

  const schoolData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  const allSchools = [...schoolData.high_schools, ...schoolData.middle_schools];

  console.log(`\n🏫 ${region} — ${allSchools.length}개 학교 데이터 수집\n${'='.repeat(50)}`);

  const wb = XLSX.utils.book_new();

  // === Sheet 1: 카카오 학원 목록 ===
  const kakaoRows = [['학교', '학원명', '주소', '전화번호', '카카오맵URL', '거리(m)']];

  // === Sheet 2: 블로그 데이터 ===
  const blogRows = [['학교', '블로그제목', '블로그URL', '날짜', '작성자', '내용요약']];

  // === Sheet 3: 최종 정리용 (빈 템플릿) ===
  const finalRows = [['학교', '학원명', '과목', '주소', '전화번호', '출처URL', '메모']];

  for (let i = 0; i < allSchools.length; i++) {
    const school = allSchools[i];
    const schoolType = school.type ? `(${school.type})` : '';
    console.log(`[${i + 1}/${allSchools.length}] ${school.name} ${schoolType}`);

    // 카카오 학원 수집
    process.stdout.write('  📍 카카오 학원 검색... ');
    try {
      const academies = await collectKakaoAcademies(school.name, school.area || region);
      console.log(`${academies.length}개`);
      for (const a of academies) {
        kakaoRows.push([school.name, a.name, a.address, a.phone, a.kakaoUrl, a.distance]);
      }
    } catch (e) {
      console.log(`실패: ${e.message}`);
    }

    // 네이버 블로그 수집
    process.stdout.write('  📝 네이버 블로그 검색... ');
    try {
      const blogs = await collectBlogs(school.name);
      console.log(`${blogs.length}개`);
      for (const b of blogs) {
        blogRows.push([school.name, b.title, b.url, b.date, b.blogger, b.description.slice(0, 200)]);
      }
    } catch (e) {
      console.log(`실패: ${e.message}`);
    }

    await sleep(500);
  }

  // 엑셀 생성
  const ws1 = XLSX.utils.aoa_to_sheet(kakaoRows);
  const ws2 = XLSX.utils.aoa_to_sheet(blogRows);
  const ws3 = XLSX.utils.aoa_to_sheet(finalRows);

  // 컬럼 너비 설정
  ws1['!cols'] = [
    { wch: 18 }, { wch: 25 }, { wch: 40 }, { wch: 15 }, { wch: 35 }, { wch: 8 }
  ];
  ws2['!cols'] = [
    { wch: 18 }, { wch: 50 }, { wch: 45 }, { wch: 12 }, { wch: 15 }, { wch: 60 }
  ];
  ws3['!cols'] = [
    { wch: 18 }, { wch: 25 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 45 }, { wch: 30 }
  ];

  XLSX.utils.book_append_sheet(wb, ws1, '카카오_학원목록');
  XLSX.utils.book_append_sheet(wb, ws2, '네이버_블로그');
  XLSX.utils.book_append_sheet(wb, ws3, '최종정리');

  const outFile = path.join(__dirname, '..', `${region}_학원데이터.xlsx`);
  XLSX.writeFile(wb, outFile);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 완료!`);
  console.log(`   카카오 학원: ${kakaoRows.length - 1}개`);
  console.log(`   블로그 데이터: ${blogRows.length - 1}개`);
  console.log(`\n📁 파일: ${outFile}`);
  console.log(`\n💡 사용법:`);
  console.log(`   1. "카카오_학원목록" 시트에서 학원 기본 정보 확인`);
  console.log(`   2. "네이버_블로그" 시트에서 블로그 URL 클릭하여 상세 확인`);
  console.log(`   3. "최종정리" 시트에 검증된 데이터 정리`);
}

main().catch(e => { console.error(e); process.exit(1); });
