/**
 * 서울/경기 고등학교 목록 자동 생성기
 * 나이스(NEIS) 교육정보 API로 전체 학교 목록을 가져와서
 * 구/시별 JSON 파일을 자동 생성
 * 
 * API 키 불필요 (무료 공개 API)
 * 
 * 사용법:
 *   node scripts/fetch-schools.js
 */

const fs = require('fs');
const path = require('path');

const DELAY = 300;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 시도교육청 코드
const REGIONS = [
  { code: 'B10', name: '서울' },
  { code: 'J10', name: '경기' },
];

// NEIS API로 학교 목록 가져오기
async function fetchSchools(eduCode, schoolType = '고등학교', page = 1) {
  const params = new URLSearchParams({
    Type: 'json',
    ATPT_OFCDC_SC_CODE: eduCode,
    SCHUL_KND_SC_NM: schoolType,
    pIndex: String(page),
    pSize: '1000',
  });

  const url = `https://open.neis.go.kr/hub/schoolInfo?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NEIS API ${res.status}`);
  const data = await res.json();

  if (data.schoolInfo) {
    return data.schoolInfo[1].row;
  }
  return [];
}

// 주소에서 구/시 추출
function extractDistrict(address) {
  if (!address) return '기타';
  
  // 서울: "서울특별시 OO구 ..."
  const seoulMatch = address.match(/서울특별시\s+(\S+구)/);
  if (seoulMatch) return seoulMatch[1];
  
  // 경기: "경기도 OO시 ..." or "경기도 OO군 ..."
  const gyeonggiMatch = address.match(/경기도\s+(\S+[시군])/);
  if (gyeonggiMatch) return gyeonggiMatch[1];
  
  return '기타';
}

// 학교 유형 분류
function classifyType(school) {
  const fond = school.FOND_SC_NM || ''; // 설립구분 (공립/사립)
  const purpose = school.HS_SC_NM || ''; // 고등학교 구분
  
  if (purpose.includes('특수목적')) return '특목고';
  if (purpose.includes('자율형사립')) return '자사고';
  if (purpose.includes('자율형공립')) return '자공고';
  if (purpose.includes('특성화')) return '특성화';
  return '일반고';
}

// 성별 분류
function classifyGender(school) {
  const coed = school.COEDU_SC_NM || '';
  if (coed.includes('남')) return '남고';
  if (coed.includes('여')) return '여고';
  return '공학';
}

// 주소에서 동/지역 추출
function extractArea(address) {
  if (!address) return '';
  // "서울특별시 양천구 목동서로 367" → "목동" 정도 추출은 어려움
  // 간단하게 도로명 앞 동네만
  const match = address.match(/[구시군]\s+(\S+?)[로길동읍면리]\s/);
  return match ? match[1] : '';
}

async function main() {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  let totalSchools = 0;
  let totalDistricts = 0;

  for (const region of REGIONS) {
    console.log(`\n📚 ${region.name} 고등학교 가져오는 중...`);

    let schools;
    try {
      schools = await fetchSchools(region.code, '고등학교');
      console.log(`   ${schools.length}개 학교 발견`);
    } catch (e) {
      console.error(`   ❌ 실패: ${e.message}`);
      continue;
    }

    // 구/시별로 그룹핑
    const byDistrict = {};
    for (const s of schools) {
      // 폐교 제외
      if (s.SCHUL_RDNMA === '' && s.SCHUL_RDNDA === '') continue;
      
      const address = (s.SCHUL_RDNMA || '') + ' ' + (s.SCHUL_RDNDA || '');
      const district = extractDistrict(address);
      
      if (!byDistrict[district]) byDistrict[district] = [];
      
      byDistrict[district].push({
        name: s.SCHUL_NM,
        type: classifyType(s),
        gender: classifyGender(s),
        area: extractArea(address),
        address: address.trim(),
        code: s.SD_SCHUL_CODE, // 학교 코드 (나중에 유용)
      });
    }

    // 구/시별 JSON 파일 생성
    for (const [district, distSchools] of Object.entries(byDistrict)) {
      if (district === '기타') continue;
      
      const filename = `${district}-schools.json`;
      const filepath = path.join(dataDir, filename);
      
      // 이미 있는 파일이면 중학교 데이터 보존
      let existing = null;
      if (fs.existsSync(filepath)) {
        existing = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      }
      
      const data = {
        region: district,
        province: region.name,
        updated: new Date().toISOString().split('T')[0],
        high_schools: distSchools.sort((a, b) => a.name.localeCompare(b.name)),
        middle_schools: existing ? existing.middle_schools : [],
      };
      
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
      
      const typeBreakdown = {};
      for (const s of distSchools) {
        typeBreakdown[s.type] = (typeBreakdown[s.type] || 0) + 1;
      }
      const detail = Object.entries(typeBreakdown).map(([k,v]) => `${k}:${v}`).join(' ');
      
      console.log(`   ✅ ${district}: ${distSchools.length}개 (${detail})`);
      totalDistricts++;
    }

    totalSchools += schools.length;
    await sleep(DELAY);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 완료!`);
  console.log(`   총 ${totalSchools}개 고등학교`);
  console.log(`   ${totalDistricts}개 지역 JSON 파일 생성`);
  console.log(`   저장 위치: ${dataDir}/`);
  console.log(`\n📄 다음 단계:`);
  console.log(`   각 지역별로 크롤링 실행:`);
  console.log(`   node scripts/collect-data.js 강남구 high`);
  console.log(`   node scripts/collect-data.js 서초구 high`);
  console.log(`   ...`);
}

main().catch(e => { console.error(e); process.exit(1); });
