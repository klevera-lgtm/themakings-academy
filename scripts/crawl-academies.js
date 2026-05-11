/**
 * 학교별 내신 학원 크롤러
 * 
 * 사용법:
 *   1. npm install 실행
 *   2. .env 파일에 API 키 설정
 *   3. node scripts/crawl-academies.js [지역] 
 *      예: node scripts/crawl-academies.js 양천구
 * 
 * 필요한 API 키:
 *   - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (developers.naver.com → 검색 API)
 *   - ANTHROPIC_API_KEY (console.anthropic.com)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// === CONFIG ===
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

const SUBJECTS = ['국어', '영어', '수학', '과학', '사회'];
const BLOG_RESULTS_PER_QUERY = 20;
const DELAY_MS = 500;

// === HELPERS ===
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHTML(html) {
  return (html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

// === NAVER BLOG SEARCH ===
async function searchNaverBlog(query, display = 10, start = 1) {
  const params = new URLSearchParams({
    query,
    display: String(display),
    start: String(start),
    sort: 'sim'  // relevance
  });

  const res = await fetch(
    `https://openapi.naver.com/v1/search/blog.json?${params}`,
    {
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
      }
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Naver API ${res.status}: ${text}`);
  }

  return res.json();
}

// === CLAUDE API ===
async function extractAcademies(schoolName, blogTexts) {
  const prompt = `아래는 "${schoolName}" 내신 학원에 대한 네이버 블로그 검색 결과입니다.

이 블로그 글들에서 "${schoolName}" 내신을 전문으로 하거나 담당한다고 언급된 학원들을 추출해주세요.

규칙:
1. 학원 이름이 명확하게 언급된 경우만 추출
2. 과목별로 분류 (국어, 영어, 수학, 과학, 사회, 기타)
3. 같은 학원이 여러 블로그에서 언급되면 mentions 수를 카운트
4. 학원 이름만 추출하고, 학원이 아닌 것(인강, 과외, 교재 등)은 제외
5. 주소나 전화번호가 언급되어 있으면 포함

JSON 형식으로만 응답해주세요 (백틱이나 설명 없이):
{
  "school": "${schoolName}",
  "subjects": {
    "국어": [{"name": "학원명", "mentions": 2, "address": "", "phone": ""}],
    "영어": [],
    "수학": [],
    "과학": [],
    "사회": [],
    "기타": []
  }
}

=== 블로그 검색 결과 ===
${blogTexts}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();
  
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('  ⚠️ JSON 파싱 실패, raw:', text.substring(0, 200));
    return null;
  }
}

// === MAIN CRAWL FUNCTION ===
async function crawlSchool(schoolName, area) {
  console.log(`\n🔍 ${schoolName} 크롤링 시작...`);

  const allBlogTexts = [];

  // Search with different query patterns
  const queries = [
    `${schoolName} 내신 학원`,
    `${schoolName} 내신 전문`,
    `${schoolName} 내신 대비 ${area}`,
  ];

  for (const query of queries) {
    try {
      console.log(`  📝 검색: "${query}"`);
      const result = await searchNaverBlog(query, BLOG_RESULTS_PER_QUERY);

      if (result.items && result.items.length > 0) {
        for (const item of result.items) {
          const title = stripHTML(item.title);
          const desc = stripHTML(item.description);
          const date = item.postdate || '';
          
          // Skip if too old (before 2023)
          if (date && date < '20230101') continue;

          allBlogTexts.push(`[제목] ${title}\n[날짜] ${date}\n[내용] ${desc}\n`);
        }
        console.log(`  ✅ ${result.items.length}개 블로그 수집 (총 ${allBlogTexts.length}개)`);
      } else {
        console.log(`  ⚠️ 검색 결과 없음`);
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  ❌ 검색 오류: ${err.message}`);
    }
  }

  if (allBlogTexts.length === 0) {
    console.log(`  ⚠️ ${schoolName}: 블로그 데이터 없음, 스킵`);
    return null;
  }

  // Limit text to avoid token overflow
  const combinedText = allBlogTexts.slice(0, 30).join('\n---\n');
  
  console.log(`  🤖 Claude API로 학원 추출 중...`);
  try {
    const result = await extractAcademies(schoolName, combinedText);
    if (result) {
      // Add source info
      for (const subject in result.subjects) {
        for (const academy of result.subjects[subject]) {
          academy.source = '네이버 블로그 자동 수집';
        }
      }
      
      const totalAcademies = Object.values(result.subjects)
        .reduce((sum, arr) => sum + arr.length, 0);
      console.log(`  ✅ ${totalAcademies}개 학원 추출 완료`);
      return result;
    }
  } catch (err) {
    console.error(`  ❌ Claude API 오류: ${err.message}`);
  }

  return null;
}

// === MAIN ===
async function main() {
  // Validate API keys
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.error('❌ NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 를 .env에 설정해주세요');
    console.error('   → https://developers.naver.com 에서 "검색" API 등록');
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY 를 .env에 설정해주세요');
    process.exit(1);
  }

  // Get region from args
  const region = process.argv[2] || '양천구';
  const dataFile = path.join(__dirname, '..', 'data', `${region.replace(/\s/g, '-')}-schools.json`);

  if (!fs.existsSync(dataFile)) {
    console.error(`❌ 데이터 파일 없음: ${dataFile}`);
    process.exit(1);
  }

  const schoolData = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  const allSchools = [...schoolData.high_schools, ...schoolData.middle_schools];
  const academiesDir = path.join(__dirname, '..', 'data', 'academies');
  fs.mkdirSync(academiesDir, { recursive: true });

  console.log(`\n🏫 ${region} 학교 ${allSchools.length}개 크롤링 시작\n${'='.repeat(50)}`);

  let successCount = 0;
  let totalAcademies = 0;

  for (let i = 0; i < allSchools.length; i++) {
    const school = allSchools[i];
    console.log(`\n[${i + 1}/${allSchools.length}] ${school.name}`);

    const result = await crawlSchool(school.name, school.area || region);

    if (result) {
      const outFile = path.join(academiesDir, `${school.name}.json`);
      fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');

      const count = Object.values(result.subjects)
        .reduce((sum, arr) => sum + arr.length, 0);
      totalAcademies += count;
      successCount++;
    }

    // Rate limiting
    await sleep(1000);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🎉 완료!`);
  console.log(`  학교: ${successCount}/${allSchools.length} 성공`);
  console.log(`  학원: 총 ${totalAcademies}개 추출`);
  console.log(`\n📄 다음 단계: node scripts/generate-pages.js 실행하여 HTML 페이지 재생성`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
