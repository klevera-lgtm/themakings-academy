const fs = require('fs');
const path = require('path');

// === CONFIG ===
const SITE_NAME = '더메이킹스 학원 찾기';
const SITE_URL = 'https://kittycapital.github.io/themakings-academy';
const THEME = {
  bg: '#0a0a0a',
  card: '#111118',
  border: '#1e1e2e',
  accent: '#4263eb',
  text: '#e0e0e0',
  muted: '#868e96',
  font: "'Noto Sans KR', -apple-system, sans-serif"
};

// === LOAD DATA ===
const dataDir = path.join(__dirname, '..', 'data');
const outputDir = path.join(__dirname, '..');

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
}

// Load academy mapping if exists
function loadAcademyData(schoolName) {
  const file = path.join(dataDir, 'academies', `${schoolName}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  return null;
}

// === SHARED STYLES ===
function sharedCSS() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${THEME.bg}; color: ${THEME.text}; font-family: ${THEME.font}; min-height: 100vh; }
    a { color: ${THEME.accent}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    .header .tag { font-size: 12px; color: ${THEME.accent}; letter-spacing: 2px; font-weight: 600; margin-bottom: 8px; }
    .header h1 { font-size: 28px; font-weight: 900; color: #fff; }
    .header p { color: ${THEME.muted}; margin-top: 8px; font-size: 14px; }
    .search-box { width: 100%; padding: 14px 20px; background: ${THEME.card}; border: 1px solid ${THEME.border}; border-radius: 12px; color: ${THEME.text}; font-size: 16px; outline: none; font-family: inherit; margin-bottom: 24px; }
    .search-box:focus { border-color: ${THEME.accent}; }
    .section-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .section-title .count { font-size: 13px; font-weight: 400; color: ${THEME.accent}; }
    .school-card { display: block; background: ${THEME.card}; border: 1px solid ${THEME.border}; border-radius: 12px; padding: 18px 22px; margin-bottom: 10px; transition: all 0.2s; text-decoration: none !important; }
    .school-card:hover { border-color: ${THEME.accent}; transform: translateY(-1px); }
    .school-card .name { font-size: 16px; font-weight: 700; color: #fff; }
    .school-card .meta { font-size: 13px; color: ${THEME.muted}; margin-top: 4px; }
    .school-card .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; margin-right: 6px; }
    .badge-general { background: rgba(66,99,235,0.15); color: #7b9cf5; }
    .badge-special { background: rgba(234,179,8,0.15); color: #eab308; }
    .badge-auto { background: rgba(16,185,129,0.15); color: #10b981; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .tab { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid ${THEME.border}; background: ${THEME.card}; color: ${THEME.muted}; font-family: inherit; }
    .tab.active { background: ${THEME.accent}; color: #fff; border-color: transparent; }
    .academy-card { background: ${THEME.card}; border: 1px solid ${THEME.border}; border-radius: 12px; padding: 18px; margin-bottom: 10px; }
    .academy-card .name { font-size: 15px; font-weight: 700; color: #fff; }
    .academy-card .info { font-size: 13px; color: ${THEME.muted}; margin-top: 4px; }
    .breadcrumb { font-size: 13px; color: ${THEME.muted}; margin-bottom: 20px; }
    .breadcrumb a { color: ${THEME.muted}; }
    .breadcrumb a:hover { color: ${THEME.accent}; }
    .empty-state { text-align: center; padding: 60px 20px; color: ${THEME.muted}; }
    .empty-state p { font-size: 14px; line-height: 1.8; }
    .footer { text-align: center; padding: 40px 20px; font-size: 12px; color: #444; border-top: 1px solid ${THEME.border}; margin-top: 40px; }
    .subject-section { margin-bottom: 32px; }
    .subject-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid ${THEME.border}; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: ${THEME.muted}; margin-bottom: 16px; }
    .back-link:hover { color: ${THEME.accent}; }
    @media (max-width: 600px) {
      .header h1 { font-size: 22px; }
      .wrap { padding: 20px 16px; }
    }
  `;
}

// === SHARED FOOTER ===
function footer() {
  return `<div class="footer">
    <p>© 2026 <a href="https://themakings.co.kr" target="_blank">더메이킹스(The Makings)</a> — 학원 데이터는 블로그 기반 자동 수집 결과이며, 실제와 다를 수 있습니다.</p>
  </div>`;
}

// === GENERATE MAIN INDEX ===
function generateIndex(regions) {
  const allRegions = Object.keys(regions);
  let regionCards = '';

  for (const region of allRegions) {
    const data = regions[region];
    const hs = data.high_schools.length;
    const ms = data.middle_schools.length;
    const slug = region.replace(/\s/g, '-');

    regionCards += `<a href="${slug}/" class="school-card">
      <div class="name">${region}</div>
      <div class="meta">고등학교 ${hs}개 · 중학교 ${ms}개</div>
    </a>\n`;
  }

  return `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${SITE_NAME}</title>
<meta name="description" content="학교별 내신 전문 학원을 찾아보세요. 내 학교 내신을 잘 잡아주는 학원이 어디인지 한눈에 확인할 수 있습니다.">
<style>${sharedCSS()}</style>
</head><body>
<div class="wrap">
  <div class="header">
    <div class="tag">THE MAKINGS ACADEMY FINDER</div>
    <h1>학교별 내신 학원 찾기</h1>
    <p>내 학교 내신을 전문으로 하는 학원을 찾아보세요</p>
  </div>
  <div id="regions">${regionCards}</div>
</div>
${footer()}
</body></html>`;
}

// === GENERATE REGION PAGE ===
function generateRegionPage(data) {
  const region = data.region;
  const slug = region.replace(/\s/g, '-');

  function schoolCard(s, type) {
    const nameSlug = s.name.replace(/\s/g, '-');
    const badges = [];
    if (s.type === '자사고') badges.push('<span class="badge badge-special">자사고</span>');
    else if (s.type === '특성화') badges.push('<span class="badge badge-special">특성화</span>');

    const academyData = loadAcademyData(s.name);
    if (academyData) {
      const total = Object.values(academyData.subjects || {}).reduce((sum, arr) => sum + arr.length, 0);
      badges.push(`<span class="badge badge-auto">학원 ${total}개</span>`);
    }

    const genderText = s.gender ? ` · ${s.gender}` : '';
    return `<a href="schools/${nameSlug}.html" class="school-card">
      <div class="name">${badges.join('')}${s.name}</div>
      <div class="meta">${s.area}${genderText}</div>
    </a>`;
  }

  const hsCards = data.high_schools.map(s => schoolCard(s, 'high')).join('\n');
  const msCards = data.middle_schools.map(s => schoolCard(s, 'middle')).join('\n');

  return `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${region} 학교별 내신 학원 - ${SITE_NAME}</title>
<meta name="description" content="${region} 중학교 고등학교별 내신 전문 학원 리스트. ${region} 내 학교를 선택하면 과목별 내신 학원을 확인할 수 있습니다.">
<style>${sharedCSS()}</style>
</head><body>
<div class="wrap">
  <a href="../" class="back-link">← 전체 지역</a>
  <div class="header">
    <div class="tag">${region.toUpperCase()}</div>
    <h1>${region} 학교별 내신 학원</h1>
    <p>학교를 선택하면 내신 전문 학원 리스트를 볼 수 있습니다</p>
  </div>
  <input type="text" class="search-box" id="schoolSearch" placeholder="학교 이름으로 검색..." oninput="filterSchools()">

  <div class="section-title">고등학교 <span class="count">${data.high_schools.length}개</span></div>
  <div id="highSchools">${hsCards}</div>

  <div style="height:32px"></div>

  <div class="section-title">중학교 <span class="count">${data.middle_schools.length}개</span></div>
  <div id="middleSchools">${msCards}</div>
</div>
${footer()}
<script>
function filterSchools(){
  const q = document.getElementById('schoolSearch').value.toLowerCase();
  document.querySelectorAll('.school-card').forEach(c => {
    c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
</script>
</body></html>`;
}

// === GENERATE SCHOOL PAGE ===
function generateSchoolPage(school, regionData) {
  const region = regionData.region;
  const regionSlug = region.replace(/\s/g, '-');
  const academyData = loadAcademyData(school.name);

  let content = '';
  if (academyData && academyData.subjects) {
    const subjects = academyData.subjects;
    for (const [subject, academies] of Object.entries(subjects)) {
      if (academies.length === 0) continue;
      content += `<div class="subject-section">
        <div class="subject-title">${subject} <span style="color:${THEME.accent};font-weight:400;font-size:13px">${academies.length}개</span></div>`;
      for (const a of academies) {
        content += `<div class="academy-card">
          <div class="name">${a.name}</div>
          <div class="info">📍 ${a.address || '주소 정보 없음'}</div>
          ${a.phone ? `<div class="info">📞 ${a.phone}</div>` : ''}
          ${a.source ? `<div class="info" style="font-size:12px;color:#555;">출처: ${a.source}</div>` : ''}
        </div>`;
      }
      content += `</div>`;
    }
  } else {
    content = `<div class="empty-state">
      <p style="font-size:40px;margin-bottom:16px;">🔍</p>
      <p>이 학교의 내신 전문 학원 데이터를 수집 중입니다.<br>
      곧 업데이트될 예정이니 조금만 기다려주세요!</p>
    </div>`;
  }

  const genderText = school.gender ? ` · ${school.gender}` : '';
  const typeText = school.type ? ` · ${school.type}` : '';

  return `<!DOCTYPE html>
<html lang="ko"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${school.name} 내신 학원 리스트 - ${SITE_NAME}</title>
<meta name="description" content="${school.name} 내신을 전문으로 하는 학원 리스트. ${school.name} 재학생을 위한 과목별 내신 대비 학원 정보를 제공합니다.">
<style>${sharedCSS()}</style>
</head><body>
<div class="wrap">
  <a href="../" class="back-link">← ${region} 학교 목록</a>
  <div class="header">
    <div class="tag">${region} · ${school.area}</div>
    <h1>${school.name}</h1>
    <p>${school.area}${typeText}${genderText}</p>
  </div>
  ${content}
</div>
${footer()}
</body></html>`;
}

// === MAIN BUILD ===
function build() {
  console.log('🏗️  Building themakings-academy pages...\n');

  // Find all region data files
  const regionFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('-schools.json'));
  const regions = {};

  for (const file of regionFiles) {
    const data = loadJSON(file);
    regions[data.region] = data;
  }

  // Ensure output dirs
  fs.mkdirSync(path.join(dataDir, 'academies'), { recursive: true });

  // Generate main index
  fs.writeFileSync(path.join(outputDir, 'index.html'), generateIndex(regions));
  console.log('✅ index.html');

  // Generate region pages
  for (const [region, data] of Object.entries(regions)) {
    const regionSlug = region.replace(/\s/g, '-');
    const regionDir = path.join(outputDir, regionSlug);
    const schoolsDir = path.join(regionDir, 'schools');
    fs.mkdirSync(schoolsDir, { recursive: true });

    // Region index
    fs.writeFileSync(path.join(regionDir, 'index.html'), generateRegionPage(data));
    console.log(`✅ ${regionSlug}/index.html`);

    // School pages
    const allSchools = [...data.high_schools, ...data.middle_schools];
    for (const school of allSchools) {
      const slug = school.name.replace(/\s/g, '-');
      fs.writeFileSync(
        path.join(schoolsDir, `${slug}.html`),
        generateSchoolPage(school, data)
      );
    }
    console.log(`✅ ${regionSlug}/schools/ (${allSchools.length} pages)`);
  }

  console.log(`\n🎉 Done! Generated pages for ${Object.keys(regions).length} region(s)`);
}

build();
