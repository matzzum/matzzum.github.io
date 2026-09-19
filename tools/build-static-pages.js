// 정적 콘텐츠 페이지 생성기 — faq.html / guide.html / about.html / region/*.html / sitemap.xml
//
// 기획서 광고·정책 04번(애드센스 반려 대응)의 "정적 페이지" 요구사항 구현.
// 사용: node tools/build-static-pages.js   (data/restaurants.xlsx가 바뀌었으면 다시 실행)
//
// 설계 메모
//  - about.html은 앱 안 "서비스 소개" 화면(contact-tab.js의 loadAboutContent)이 그대로
//    가져다 쓰는 원본이다(#about-content > section.about-section). 문구를 바꿀 땐
//    이 파일의 ABOUT_SECTIONS만 고치면 웹 페이지와 앱 화면이 함께 바뀜.
//  - 지역 페이지의 숫자(식당 수·뷔페/구내식당 수·동네별 개수)는 xlsx에서 직접 세므로
//    엑셀이 갱신되면 이 스크립트만 다시 돌리면 됨. 노출 규칙은 앱과 동일:
//    노출여부가 "비공개"/"확인필요"로 시작하면 제외, 이름 없음/Dev_Test 제외.
//  - 광고 코드는 넣지 않음(기획서: 콘텐츠 페이지에는 광고 배치 금지).
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://matzzum.github.io';
const _d = new Date();
const TODAY = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`; // 로컬 날짜

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// 공용 레이아웃
// ---------------------------------------------------------------------------
const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%233182F6'/%3E%3Cpath d='M32 10 C20 10 11 19 11 30 C11 44 32 56 32 56 C32 56 53 44 53 30 C53 19 44 10 32 10 Z' fill='%23fff'/%3E%3Cellipse cx='26' cy='22' rx='5.5' ry='7' fill='%233182F6'/%3E%3Crect x='24' y='28' width='4' height='16' rx='2' fill='%233182F6'/%3E%3Crect x='37' y='16' width='2.3' height='28' rx='1.15' fill='%233182F6'/%3E%3Crect x='40.3' y='16' width='2.3' height='28' rx='1.15' fill='%233182F6'/%3E%3C/svg%3E`;

// base: 페이지가 있는 폴더에서 루트로 가는 상대 경로 ('' 또는 '../')
function layout({ base, file, title, description, h1, lede, bodyHtml, jsonLd }) {
    const url = `${SITE}/${file}`;
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="맛쩜">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<!-- 구글 애드센스 사이트 소유권 확인용 코드 — index.html과 동일(광고 스크립트는 넣지 않음) -->
<meta name="google-adsense-account" content="ca-pub-1429945929826005">
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" crossorigin>
<link rel="stylesheet" href="${base}css/static-page.css">${jsonLd ? `\n<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body>
<div class="wrap">

  <a class="back-link" href="${base}index.html">‹ 맛쩜으로 돌아가기</a>
  <h1>${esc(h1)}</h1>
  <div class="updated">최종 수정일: ${TODAY}</div>
${lede ? `\n  <div class="lede">${lede}</div>\n` : ''}
${bodyHtml}

  <nav class="page-links" aria-label="맛쩜 안내 페이지">
    <a href="${base}about.html">서비스 소개</a>
    <a href="${base}guide.html">이용 가이드</a>
    <a href="${base}faq.html">자주 묻는 질문</a>
    <a href="${base}privacy-policy.html">개인정보처리방침</a>
  </nav>
  <nav class="page-links region-links" aria-label="지역별 안내">
    <span>지역별 안내</span>
${REGIONS.map(r => `    <a href="${base}region/${r.slug}.html">${esc(r.label)}</a>`).join('\n')}
  </nav>

  <footer>
    맛쩜 · 구내식당·한식뷔페 지도 · 식당 정보는 공공데이터를 바탕으로 하며 실제와 다를 수 있어요. 방문 전에 식당에 한 번 확인해 주세요.
  </footer>

</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 1) 서비스 소개 (about.html + 앱 안 서비스 소개 화면의 원본)
// ---------------------------------------------------------------------------
const ABOUT_SECTIONS = [
    { icon: '🍚', title: '맛쩜이란?', html: `
      <p>회사 주변 구내식당·한식뷔페 정보를 한곳에 모아, 매일 점심 메뉴 고민을 덜어드리는 서비스예요.</p>
      <p>위치 정보는 물론 실제 이용자들의 한줄평과 인기 랭킹도 함께 확인할 수 있어요. 가격·영업시간은 아직 확인된 곳이 적어서, 표본이 쌓이는 대로 순차적으로 채워가고 있어요.</p>` },
    { icon: '🧭', title: '이렇게 써보세요', html: `
      <p>지도 홈에서 가까운 순으로 식당을 훑어보고, 랭킹·피드 탭에서 다른 이용자들의 한줄평을 살펴본 뒤, 그래도 고르기 어려우면 점심 룰렛으로 재미있게 오늘 메뉴를 정해보세요. 기능별 자세한 사용법은 <a href="guide.html">이용 가이드</a>에서 볼 수 있어요.</p>` },
    { icon: '🙋', title: '이런 분께 추천해요', html: `
      <ul>
        <li>매일 점심 메뉴를 고민하는 직장인</li>
        <li>회사 근처에 어떤 구내식당이 있는지 잘 모르는 분</li>
        <li>점심 룰렛으로 재미있게 오늘의 메뉴를 정하고 싶은 분</li>
      </ul>` },
    { icon: '🛡️', title: '맛쩜이 지키는 원칙', html: `
      <ul>
        <li><b>확실한 정보만 보여드려요.</b> 식당 기본 정보는 공공데이터포털의 상가(상권)정보를 바탕으로 하고, 지도는 네이버 지도를 사용해요. 확인되지 않은 가격·영업시간은 아는 척하지 않고 비워 둬요. 출처는 설정의 '정보 출처'에서 볼 수 있어요.</li>
        <li><b>외부인 이용이 어려운 곳은 뺐어요.</b> 경찰서·소방서 같은 보안기관 내부 식당은 지도에 표시하지 않아요. 관공서·기업 내부 식당처럼 이용 가능 여부를 확인하지 못한 곳도 확인 전까지는 뺐어요. 지도에 보이는 식당이라도 이용 조건은 식당마다 달라서, 방문 전 확인이 필요해요.</li>
        <li><b>후기는 이용자가 직접 남긴 것만 보여드려요.</b> 한줄평과 랭킹은 이용자가 남긴 내용으로 채워져요. 운영자가 쓴 글은 따로 구분해서 표시해요.</li>
        <li><b>회원가입이 필요 없어요.</b> 현재 위치는 거리순 정렬에만 쓰고 서버에 저장하지 않으며, 즐겨찾기와 집·회사 위치는 내 기기에만 저장돼요.</li>
        <li><b>잘못된 정보는 함께 고쳐가요.</b> 이용자가 '정보 수정 제안'이나 문의하기로 알려주시면 확인한 뒤 반영해요.</li>
      </ul>` },
    { icon: '📍', title: '지금의 범위와 앞으로', html: `
      <p>현재는 서울·경기·인천 등 수도권 식당을 중심으로 등록돼 있어요. 가까운 시일 안에 전국으로 차근차근 넓혀갈 예정이고, 가격·영업시간 같은 정보도 확인되는 대로 채워갈 거예요.</p>` },
    { icon: '🏷️', title: '맛쩜이라는 이름', html: `
      <p>처음에는 "맛점"이라는 이름으로 시작했지만, 발음은 같아도 표기가 더 뚜렷하게 남도록 지금의 "맛쩜"으로 이름을 다듬었어요.</p>` },
    { icon: '💬', title: '문의', html: `
      <p>서비스 이용 중 궁금한 점이나 제안하고 싶은 내용이 있다면 [설정 → 문의하기]로 편하게 남겨주세요.</p>` },
];

function buildAbout() {
    const sections = ABOUT_SECTIONS.map(s => `    <section class="about-section" data-icon="${s.icon}">
      <h2>${esc(s.title)}</h2>${s.html.replace(/^\n/, '\n').replace(/\n {6}/g, '\n      ')}
    </section>`).join('\n\n');
    return layout({
        base: '', file: 'about.html',
        title: '서비스 소개 | 맛쩜',
        description: '맛쩜은 회사 주변 구내식당·한식뷔페 정보를 지도에서 한곳에 모아 보여주는 서비스예요. 서비스가 지키는 원칙과 정보 출처를 소개합니다.',
        h1: '서비스 소개',
        lede: '',
        bodyHtml: `  <div id="about-content">\n${sections}\n  </div>`,
    });
}

// ---------------------------------------------------------------------------
// 2) 이용 가이드
// ---------------------------------------------------------------------------
function buildGuide() {
    const body = `  <p>맛쩜은 구내식당·한식뷔페를 지도에서 찾아볼 수 있는 서비스예요. 점심 메뉴를 고민하는 시간을 줄이고, 근처에 어떤 식당이 있는지 한눈에 볼 수 있도록 만들었어요. 이 가이드에서는 처음 쓰는 분도 바로 따라 할 수 있게 기능별 사용법을 정리했어요.</p>

  <section>
    <h2>구내식당과 한식뷔페는 어떤 곳인가요?</h2>
    <p>구내식당은 회사·기관·학교 같은 곳 안에서 운영하는 식당이고, 한식뷔페는 정해진 가격에 여러 반찬을 직접 골라 먹는 식당이에요. 산업단지와 오피스 밀집 지역에서는 점심시간에 많은 사람이 찾아요. 다만 구내식당은 외부인 이용 여부가 식당마다 달라서, 방문 전에 출입 방법을 한 번 확인해 주세요.</p>
  </section>

  <section>
    <h2>1. 식당 찾기 — 지도 홈</h2>
    <ul>
      <li><b>지도와 목록:</b> 왼쪽(모바일은 아래쪽) 목록과 지도가 함께 보여요. 지도에 숫자가 적힌 파란 원은 그 안에 식당이 모여 있다는 뜻이고, 지도를 확대하면 식당별 마커로 나뉘어 보여요.</li>
      <li><b>검색:</b> 위쪽 검색창에 식당 이름을 입력하면 바로 찾을 수 있어요.</li>
      <li><b>지역 선택:</b> '지역 전체'를 눌러 구·시 단위로 범위를 좁힐 수 있어요.</li>
      <li><b>거리순:</b> 내 위치에서 가까운 순으로 정렬해요. 위치 권한을 허용하면 현재 위치를, 허용하지 않으면 등록해 둔 회사·집 위치를 기준으로 삼아요.</li>
      <li><b>석식:</b> 저녁에도 운영하는 식당만 골라 볼 수 있어요. 목록의 '석식 가능' 표시가 붙은 곳이에요.</li>
      <li><b>내 위치 / 집·회사 버튼:</b> 지도를 내 현재 위치로 옮기거나, 현재 위치에서 더 가까운 집 또는 회사 위치로 한 번에 이동해요.</li>
    </ul>
  </section>

  <section>
    <h2>2. 식당 자세히 보기</h2>
    <p>목록의 식당 카드나 지도 마커를 누르면 상세 화면이 열려요. 영업시간·가격 정보가 등록된 곳은 함께 보이고, 인스타그램·카카오톡 채널·블로그 링크가 있는 곳은 버튼으로 이동할 수 있어요. 등록된 정보가 실제와 다르다면 '정보 수정 제안'으로 알려주세요. 확인을 거쳐 반영돼요.</p>
  </section>

  <section>
    <h2>3. 즐겨찾기</h2>
    <p>자주 가는 식당은 목록 카드 오른쪽의 ☆를 눌러 저장해 두세요. 저장한 식당은 '즐겨찾기' 탭에 모여요. 즐겨찾기는 사용 중인 기기의 브라우저에만 저장되니, 브라우저 데이터를 지우면 사라지는 점을 기억해 주세요.</p>
  </section>

  <section>
    <h2>4. 한줄평, 랭킹, 피드</h2>
    <ul>
      <li><b>한줄평 남기기:</b> 상세 화면 아래쪽에서 로그인 없이 남길 수 있어요. 닉네임은 자동으로 채워지고, 직접 바꿔도 돼요.</li>
      <li><b>랭킹:</b> 한줄평이 3개 이상 모인 식당을 지역·기간별로 보여줘요. '이번 주'와 '전체' 중에서 고를 수 있어요.</li>
      <li><b>피드:</b> 전체 식당의 최신 한줄평을 시간순으로 모아 볼 수 있어요. 항목을 누르면 해당 식당으로 이동해요.</li>
    </ul>
  </section>

  <section>
    <h2>5. 룰렛 — 오늘 점심 뭐 먹지?</h2>
    <p>정하기 어려울 땐 룰렛에 맡겨 보세요. '미니'는 4칸, '일반'은 12칸이에요. '자동 배치'를 누르면 가까운 식당으로 빈 칸이 채워지고, 원하는 식당을 직접 넣고 싶다면 칸을 눌러 검색하면 돼요. 그다음 '돌려돌려!'를 누르면 끝이에요.</p>
  </section>

  <section>
    <h2>6. 설정</h2>
    <ul>
      <li><b>자주 가는 장소 설정:</b> 집과 회사 위치를 지도에서 직접 정해 두면, 위치 권한 없이도 거리순으로 볼 수 있어요.</li>
      <li><b>시스템 및 테마:</b> 화면 테마를 취향에 맞게 바꿔요.</li>
      <li><b>공지사항·문의하기:</b> 업데이트 소식을 확인하고, 건의사항이나 잘못된 정보, 추가됐으면 하는 지역을 남길 수 있어요.</li>
    </ul>
  </section>

  <section>
    <h2>이렇게 쓰면 편해요</h2>
    <ul>
      <li>점심시간 전에 미리 즐겨찾기와 회사 위치를 등록해 두세요.</li>
      <li>점심시간대에는 식당이 붐빌 수 있으니, 한줄평을 보고 미리 고르면 시간을 아낄 수 있어요.</li>
      <li>스마트폰 브라우저 메뉴에서 '홈 화면에 추가'를 누르면 앱처럼 바로 열 수 있어요.</li>
    </ul>
    <p>궁금한 점은 <a href="faq.html">자주 묻는 질문</a>에서도 확인할 수 있어요.</p>
  </section>`;
    return layout({
        base: '', file: 'guide.html',
        title: '이용 가이드 | 맛쩜',
        description: '맛쩜 사용법 안내. 지도에서 구내식당·한식뷔페 찾기, 즐겨찾기, 한줄평·랭킹·피드, 점심 룰렛, 설정까지 기능별로 정리했어요.',
        h1: '이용 가이드',
        lede: '',
        bodyHtml: body,
    });
}

// ---------------------------------------------------------------------------
// 3) 자주 묻는 질문
// ---------------------------------------------------------------------------
const FAQ = [
    ['맛쩜은 어떤 서비스인가요?',
     '구내식당·한식뷔페를 지도에서 찾아볼 수 있는 서비스예요. 내 위치에서 가까운 순으로 식당을 보고, 이용해 본 사람들의 한줄평도 함께 확인할 수 있어요. 회원가입 없이 바로 이용할 수 있어요.'],
    ['어느 지역 식당이 등록돼 있나요?',
     '현재는 서울·경기·인천 등 수도권 식당을 중심으로 등록돼 있어요. 가까운 시일 안에 전국으로 차근차근 넓혀갈 예정이에요. 추가됐으면 하는 지역이 있다면 설정의 문의하기로 알려주세요.'],
    ['식당 정보는 어디서 가져오고, 정확한가요?',
     '식당 이름·주소·위치는 공공데이터포털의 상가(상권)정보를 바탕으로 해요. 공공데이터라 실제와 다를 수 있고, 가격·영업시간·식단표는 아직 등록된 곳이 많지 않아요. 확실하지 않은 정보는 보여드리지 않는 것을 원칙으로 하고 있어요.'],
    ['외부인도 이용할 수 있나요?',
     '경찰서·소방서 같은 보안기관 내부 식당은 지도에서 뺐어요. 관공서·기업 내부 식당처럼 외부인 이용 가능 여부를 확인하지 못한 곳도 확인 전까지는 표시하지 않아요. 다만 지도에 보이는 식당도 출입 방법과 이용 조건은 식당마다 달라서, 방문 전에 한 번 확인해 주세요.'],
    ['위치 권한을 꼭 허용해야 하나요? 내 위치가 저장되나요?',
     '허용하면 가까운 순으로 볼 수 있지만, 허용하지 않아도 지역을 골라서 이용할 수 있어요. 현재 위치는 거리순 정렬에만 쓰이고, 서버로 보내거나 저장하지 않아요. 집·회사 위치를 등록해 두면 위치 권한 없이도 거리순으로 볼 수 있고, 이 위치도 내 기기에만 저장돼요.'],
    ['즐겨찾기는 어디에 저장되나요?',
     '식당 목록의 ☆를 누르면 저장돼요. 즐겨찾기는 사용 중인 기기의 브라우저에만 저장돼서, 브라우저 데이터를 지우거나 다른 기기로 바꾸면 보이지 않아요.'],
    ['한줄평은 어떻게 남기나요?',
     '식당 상세 화면 아래쪽에서 남길 수 있어요. 로그인 없이 닉네임과 내용만 적으면 되고, 닉네임은 자동으로 채워져요(직접 바꿔도 돼요). 도배를 막기 위해 짧은 시간에 여러 번 등록하는 건 제한해요. 한줄평이 3개 이상 모인 식당은 랭킹에 올라가요.'],
    ['잘못된 정보는 어떻게 알리나요?',
     "식당 상세 화면의 '정보 수정 제안'에서 영업시간·가격·식단표 링크를 알려주실 수 있어요. 바로 반영되지 않고 확인을 거친 뒤 반영해요. 폐업했거나 새로 생긴 식당, 이름·위치가 틀린 경우에는 설정의 문의하기로 알려주세요."],
    ['내가 쓴 한줄평이나 문의를 지우고 싶어요.',
     '로그인 기능이 없어서 직접 삭제는 어려워요. 설정의 문의하기로 요청해 주시면 확인 후 처리해요. 자세한 내용은 <a href="privacy-policy.html">개인정보처리방침</a>에서 볼 수 있어요.'],
    ['앱처럼 설치할 수 있나요?',
     "스마트폰 브라우저 메뉴에서 '홈 화면에 추가'를 누르면 앱처럼 바로 열 수 있어요."],
];

function buildFaq() {
    const body = FAQ.map(([q, a]) => `  <section class="faq-item">
    <h2>Q. ${esc(q)}</h2>
    <p>${a}</p>
  </section>`).join('\n\n');
    const stripTags = s => s.replace(/<[^>]+>/g, '');
    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({
            '@type': 'Question', name: q,
            acceptedAnswer: { '@type': 'Answer', text: stripTags(a) },
        })),
    });
    return layout({
        base: '', file: 'faq.html',
        title: '자주 묻는 질문 | 맛쩜',
        description: '맛쩜 이용 중 자주 묻는 질문 10가지. 등록 지역, 정보 출처, 외부인 이용, 위치 권한, 즐겨찾기, 한줄평, 정보 수정 방법을 안내해요.',
        h1: '자주 묻는 질문',
        lede: '맛쩜을 쓰면서 가장 많이 궁금해하시는 내용을 모았어요. 사용법은 <a href="guide.html">이용 가이드</a>에서 더 자세히 볼 수 있어요.',
        bodyHtml: body,
        jsonLd,
    });
}

// ---------------------------------------------------------------------------
// 4) 지역 페이지 (시범 5곳) — 숫자는 xlsx에서 직접 집계
// ---------------------------------------------------------------------------
const REGIONS = [
    { slug: 'hwaseong-manse', label: '화성시 만세구', region: '화성시 만세구' },
    { slug: 'siheung', label: '시흥시', region: '시흥시' },
    { slug: 'ansan-danwon', label: '안산시 단원구', region: '안산시 단원구' },
    { slug: 'incheon-namdong', label: '인천 남동구', region: '남동구' },
    { slug: 'pyeongtaek', label: '평택시', region: '평택시' },
];

function loadRestaurants() {
    const wb = XLSX.readFile(path.join(ROOT, 'data', 'restaurants.xlsx'));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const idx = {};
    rows[0].forEach((h, i) => { idx[String(h).trim()] = i; });
    return rows.slice(1).map(r => ({
        name: String(r[idx['이름']] || '').trim(),
        region: String(r[idx['지역']] || '').trim(),
        address: String(r[idx['주소']] || '').trim(),
        visibility: String(r[idx['노출여부']] || '').trim(),
    })).filter(r => r.name && r.name !== 'Dev_Test'
        && !r.visibility.startsWith('비공개') && !r.visibility.startsWith('확인필요'));
}

// 도로명주소에서 "○○로/○○길" 본 도로명만 뽑음('별망로12번길'→'별망로')
function roadOf(address) {
    const tok = address.split(/\s+/).find(t => /(로|길)\d*(번?길)?$/.test(t) && /[가-힣]/.test(t));
    return tok ? tok.replace(/\d+(번?길)?$/, '').replace(/\d+$/, '') : null;
}
// 주소에서 읍·면·동 단위(있을 때만)
function townOf(address) {
    return address.split(/\s+/).find(t => /[가-힣]+(읍|면)$/.test(t)) || null;
}
function topCounts(list, fn, n) {
    const m = new Map();
    list.forEach(r => { const k = fn(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).slice(0, n);
}
const has = (list, re, field = 'name') => list.filter(r => re.test(r[field])).length;

function regionStats(list) {
    return {
        total: list.length,
        buffet: has(list, /뷔페|부페/),
        gunae: has(list, /구내식당/),
        consign: has(list, /위탁급식소/),
        food: has(list, /푸드/),
        gongdan: has(list, /공단/, 'address'),
        sandan: has(list, /산단/, 'address'),
        sihwa: has(list, /시화/),
        towns: topCounts(list, r => townOf(r.address), 5),
        roads: topCounts(list, r => roadOf(r.address), 5),
    };
}
const fmtTop = (arr, n = arr.length) => arr.slice(0, n).map(([k, c]) => `${k}(${c}곳)`).join(', ');

// 지역별 소개 문단 — 문장 구조는 손으로 쓰고 숫자만 집계값으로 채움
const REGION_INTRO = {
    'hwaseong-manse': (s, r) => `${r.label}에는 현재 ${s.total}곳의 구내식당·한식뷔페가 등록돼 있어요. 등록된 식당 이름 가운데 ${s.buffet}곳에 '뷔페'나 '부페'가 들어가 있어서, 구내식당(이름에 '구내식당'이 들어간 곳 ${s.gunae}곳)보다 뷔페형 식당이 훨씬 많은 지역이에요. 식당은 ${fmtTop(s.towns)}처럼 읍·면 단위로 넓게 퍼져 있고, ${s.roads[0][0]} 주변에도 여러 곳이 모여 있어요. 한 동네에 몰려 있기보다는 흩어져 있어서, 지도에서 내 위치를 기준으로 가까운 곳부터 찾는 게 편해요. 가격과 영업시간은 아직 확인된 곳이 많지 않으니, 방문 전에 식당에 직접 확인해 주세요.`,
    'siheung': (s, r) => `${r.label}에는 현재 ${s.total}곳이 등록돼 있고, 등록된 주소 가운데 ${s.gongdan}곳이 공단1대로·공단2대로처럼 '공단'이 들어간 도로에 있어요. 이름에 '시화'가 들어간 곳도 ${s.sihwa}곳 있어요. 공단 지역의 점심 식당을 찾는 분께 특히 잘 맞는 지역이에요. 이름에 '뷔페'나 '부페'가 들어간 곳은 ${s.buffet}곳, '구내식당'이 들어간 곳은 ${s.gunae}곳이고, 나머지는 이름만으로는 종류를 알기 어려운 식당이에요. 이런 곳은 상세 화면의 한줄평이나 링크를 먼저 살펴보시면 도움이 돼요. 등록된 정보는 공공데이터를 바탕으로 해서 실제와 다를 수 있어요.`,
    'ansan-danwon': (s, r) => `${r.label}에는 현재 ${s.total}곳이 등록돼 있어요. ${fmtTop(s.roads, 4)}처럼 몇몇 도로 주변에 식당이 모여 있고, 주소에 '산단'이 들어간 곳만 ${s.sandan}곳이에요. 이름에 '구내식당'이 들어간 곳이 ${s.gunae}곳, '뷔페'나 '부페'가 들어간 곳이 ${s.buffet}곳이고, '푸드'라는 이름이 들어간 곳도 ${s.food}곳으로 많은 편이라 급식·외식업체가 운영하는 식당이 적지 않을 것으로 보여요(이름을 보고 짐작한 것이라 실제 운영 주체를 확인한 것은 아니에요). 이런 식당은 이용 대상이 정해져 있을 수 있으니, 방문 전에 출입과 이용 방법을 확인해 주세요.`,
    'incheon-namdong': (s, r) => `${r.label}에는 현재 ${s.total}곳이 등록돼 있고, 그중 ${s.consign}곳이 이름에 '위탁급식소'가 붙은 식당이에요. 절반이 넘는 곳이 업체가 급식을 위탁 운영하는 방식으로 보인다는 뜻이고, '뷔페'나 '부페'가 들어간 곳은 ${s.buffet}곳으로 상대적으로 적어요. 이름에 '구내식당'이 들어간 곳은 ${s.gunae}곳이에요. ${fmtTop(s.roads, 3)} 주변에 식당이 많이 모여 있어요. 위탁급식소와 구내식당은 특정 업체 직원 위주로 운영될 수 있어서 외부인이 이용할 수 있는지는 식당마다 달라요. 방문 전에 꼭 확인해 주세요.`,
    'pyeongtaek': (s, r) => `${r.label}에는 현재 ${s.total}곳이 등록돼 있어요. 이름에 '뷔페'나 '부페'가 들어간 곳이 ${s.buffet}곳으로 절반 가까이 되고, '구내식당'이 들어간 곳은 ${s.gunae}곳이에요. ${fmtTop(s.towns, 4)}에 식당이 많고, 주소에 '산단'이 들어간 곳이 ${s.sandan}곳이에요. 시내가 아니라 산업단지가 있는 읍·면 지역에 식당이 몰려 있는 편이니, 이동 거리를 감안해서 지도에서 거리를 확인하고 가세요. 가격과 영업시간은 아직 등록된 곳이 많지 않아요.`,
};

function buildRegion(reg, all) {
    const list = all.filter(r => r.region === reg.region)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    if (!list.length) throw new Error(`지역 데이터 없음: ${reg.region}`);
    const s = regionStats(list);
    const intro = REGION_INTRO[reg.slug](s, reg);

    const summaryRows = [
        ['등록된 식당', `${s.total}곳`],
        ["이름에 '뷔페'·'부페'가 들어간 곳", `${s.buffet}곳`],
        ["이름에 '구내식당'이 들어간 곳", `${s.gunae}곳`],
        ...(s.consign ? [["이름에 '위탁급식소'가 들어간 곳", `${s.consign}곳`]] : []),
        ...(s.towns.length ? [['식당이 많은 읍·면', fmtTop(s.towns)]] : []),
        ['식당이 많은 도로', fmtTop(s.roads)],
    ];
    const summary = `<table>
      <tbody>
${summaryRows.map(([k, v]) => `        <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')}
      </tbody>
    </table>
    <p class="note">${TODAY} 기준 맛쩜에 등록된 식당 데이터를 집계한 값이에요. 이름·주소에 들어간 글자를 기준으로 센 것이라 실제 운영 형태와 다를 수 있어요.</p>`;

    const items = list.map(r => `        <li><b>${esc(r.name)}</b><span>${esc(r.address)}</span></li>`).join('\n');
    const body = `  <section>
    <h2>지역 소개</h2>
    <p>${esc(intro)}</p>
  </section>

  <section>
    <h2>지역 현황</h2>
    ${summary}
  </section>

  <section>
    <h2>등록된 식당 목록 (${s.total}곳)</h2>
    <p>가나다순이에요. 가격·영업시간은 확인된 곳이 많지 않아 표시하지 않았어요. 위치와 한줄평은 <a href="../index.html">맛쩜 지도</a>에서 확인할 수 있어요.</p>
    <ul class="restaurant-list">
${items}
    </ul>
  </section>

  <section>
    <h2>이용 전에 확인해 주세요</h2>
    <ul>
      <li>식당 이름·주소는 공공데이터포털의 상가(상권)정보를 바탕으로 하고 있어서 실제와 다를 수 있어요.</li>
      <li>구내식당·위탁급식소는 외부인 이용 가능 여부와 출입 방법이 식당마다 달라요. 방문 전에 식당에 직접 확인해 주세요.</li>
      <li>잘못된 정보나 빠진 식당은 앱의 [설정 → 문의하기]로 알려주세요. 자세한 서비스 원칙은 <a href="../about.html">서비스 소개</a>에서 볼 수 있어요.</li>
    </ul>
  </section>`;
    return layout({
        base: '../', file: `region/${reg.slug}.html`,
        title: `${reg.label} 구내식당·한식뷔페 ${s.total}곳 | 맛쩜`,
        description: `${reg.label}에 등록된 구내식당·한식뷔페 ${s.total}곳의 지역 현황과 식당 목록. 이름에 뷔페가 들어간 곳 ${s.buffet}곳, 구내식당 ${s.gunae}곳.`,
        h1: `${reg.label} 구내식당·한식뷔페`,
        lede: '',
        bodyHtml: body,
    });
}

// ---------------------------------------------------------------------------
// 5) sitemap.xml
// ---------------------------------------------------------------------------
function buildSitemap() {
    const urls = [
        ['', 'daily', '1.0'],
        ['about.html', 'monthly', '0.7'],
        ['guide.html', 'monthly', '0.7'],
        ['faq.html', 'monthly', '0.7'],
        ...REGIONS.map(r => [`region/${r.slug}.html`, 'weekly', '0.6']),
        ['privacy-policy.html', 'monthly', '0.3'],
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, f, pr]) => `  <url>
    <loc>${SITE}/${p}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${f}</changefreq>
    <priority>${pr}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

// ---------------------------------------------------------------------------
function write(rel, content) {
    const p = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    console.log('wrote', rel, `(${content.length} chars)`);
}

const all = loadRestaurants();
write('about.html', buildAbout());
write('guide.html', buildGuide());
write('faq.html', buildFaq());
REGIONS.forEach(r => write(`region/${r.slug}.html`, buildRegion(r, all)));
write('sitemap.xml', buildSitemap());
