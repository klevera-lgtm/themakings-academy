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

// === 네이버: 블로그 검색 (페이지네이션 지원) ===
async function naverBlog(query, display = 100, start = 1) {
  const p = new URLSearchParams({ query, display: String(display), start: String(start), sort: 'sim' });
  const r = await fetch(`https://openapi.naver.com/v1/search/blog.json?${p}`, {
    headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET }
  });
  if (!r.ok) return { items: [], total: 0 };
  return r.json();
}

// === 학교 주변 학원 수집 (카카오) ===
async function collectKakaoAcademies(schoolName, area, address) {
  // 주소가 있으면 주소로 좌표 검색 (동명 학교 문제 방지)
  const searchQuery = address || `서울 ${area} ${schoolName}`;
  const coords = await kakaoCoords(searchQuery);
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

// === 다른 지역 필터 ===
const OTHER_REGIONS = [
  '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  '안산', '동탄', '화성', '수원', '성남', '용인', '고양', '일산',
  '파주', '김포', '평택', '시흥', '광명', '안양', '의왕', '군포',
  '하남', '구리', '남양주', '의정부', '양주', '포천',
  '천안', '청주', '전주', '창원', '김해', '포항', '구미',
];

// === 학교 관련 블로그 수집 (네이버) — 과목별 쿼리 + 페이지네이션 ===
const SUBJECTS_FOR_SEARCH = ['영어', '수학', '국어', '과학', '사회'];

async function collectBlogs(schoolName, area, region) {
  const allBlogs = [];
  
  // 일반 쿼리
  const queries = [
    `서울 ${area} ${schoolName} 내신 학원`,
    `${schoolName} 내신 전문 학원 ${area}`,
  ];
  
  // 과목별 쿼리 추가
  for (const subj of SUBJECTS_FOR_SEARCH) {
    queries.push(`${schoolName} ${subj} 내신 학원`);
    queries.push(`${area} ${schoolName} ${subj} 내신`);
  }

  for (const q of queries) {
    // 각 쿼리당 최대 2페이지 (100개 × 2 = 200개)
    for (let page = 0; page < 2; page++) {
      const start = page * 100 + 1;
      try {
        const res = await naverBlog(q, 100, start);
        if (!res.items || res.items.length === 0) break;
        
        for (const item of res.items) {
          const date = item.postdate || '';
          if (date && date < '20230101') continue;
          
          const title = strip(item.title);
          const desc = strip(item.description);
          const fullText = title + ' ' + desc;
          
          // 다른 지역 언급 필터링
          const hasOtherRegion = OTHER_REGIONS.some(r => fullText.includes(r));
          const hasCorrectArea = fullText.includes(area) || fullText.includes(region) || fullText.includes('서울');
          
          if (hasOtherRegion && !hasCorrectArea) continue;
          
          allBlogs.push({
            title,
            description: desc,
            url: item.link,
            date: date ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}` : '',
            blogger: item.bloggername || '',
          });
        }
        
        // 결과가 100개 미만이면 다음 페이지 없음
        if (res.items.length < 100) break;
        await sleep(DELAY);
      } catch { break; }
    }
    await sleep(DELAY);
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
  const schoolType = process.argv[3] || 'all'; // 'high', 'middle', 'all'
  const dataFile = path.join(__dirname, '..', 'data', `${region}-schools.json`);
  if (!fs.existsSync(dataFile)) {
    console.error(`❌ ${dataFile} 없음`);
    process.exit(1);
  }

  const schoolData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  let allSchools;
  let typeLabel;
  
  if (schoolType === 'high') {
    allSchools = schoolData.high_schools;
    typeLabel = '고등학교';
  } else if (schoolType === 'middle') {
    allSchools = schoolData.middle_schools;
    typeLabel = '중학교';
  } else {
    allSchools = [...schoolData.high_schools, ...schoolData.middle_schools];
    typeLabel = '전체';
  }

  console.log(`\n🏫 ${region} ${typeLabel} — ${allSchools.length}개 학교 데이터 수집`);
  console.log(`   과목별 쿼리 포함 (영어/수학/국어/과학/사회)\n${'='.repeat(50)}`);

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
      const academies = await collectKakaoAcademies(school.name, school.area || region, school.address);
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
      const blogs = await collectBlogs(school.name, school.area || region, region);
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

  const suffix = schoolType === 'all' ? '' : `_${typeLabel}`;
  const outFile = path.join(__dirname, '..', `${region}${suffix}_학원데이터.xlsx`);
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
