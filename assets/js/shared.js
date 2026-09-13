// 여러 탭에서 똑같이 중복 정의돼 있던 유틸 함수를 한 곳으로 모음
// (map-tab.js/game-tab.js/calorie-tab.js/index.js 4곳에 거의 동일한 코드가
// 복붙돼 있었음). index.html의 <head>에서 한 번만 로드되고, 각 탭 스크립트는
// 이 파일이 이미 로드된 뒤에 실행되므로 window.getDistanceKm를 그냥
// getDistanceKm(...)로 바로 불러 쓰면 됨.

// 두 좌표(위도/경도) 사이의 직선 거리를 km 단위로 계산 (Haversine 공식).
function getDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
window.getDistanceKm = getDistanceKm;

// ----- 랜덤 닉네임 (형용사 + 명사) — 한줄평(map-tab.js)·문의하기(contact-tab.js) 공용 -----
// 원래 map-tab.js에만 있던 걸 15번 기획(문의하기 개선)에서 문의하기에도
// 그대로 재사용하기로 하면서 이곳으로 옮김. 닉네임 입력 부담을 줄이기 위한
// 기본값 — 이 파일은 앱 최초 로드 시 한 번만 실행되므로, sessionRandomNickname은
// 탭을 오가며 스크립트가 재실행돼도(각 탭 js의 특성) 새로고침 전까지는
// 그대로 유지됨. 직접 자기만의 닉네임으로 고쳐서 한 번 제출하면 그 값을
// 기억해뒀다가 다음 방문부터 계속 씀(호출하는 쪽에서 CUSTOM_NICK_KEY로 저장).
const NICK_ADJECTIVES = [
    '행복한','즐거운','신나는','든든한','다정한','명랑한','상큼한','활기찬','씩씩한','느긋한','설레는','유쾌한',
    '편안한','포근한','차분한','상냥한','재빠른','촉촉한','매콤한','여유로운'
];
const NICK_NOUNS = [
    '너구리','오리','다람쥐','고양이','강아지','토끼','펭귄','수달','여우','사자','하마','판다', // 동물
    '부엉이','코알라','알파카','라쿤','고슴도치', // 동물 추가
    '감자','만두','붕어빵','호떡','딸기','라떼','도토리','젤리','쿠키','마카롱', // 음식·사물
    '구름','바람','별빛','햇살','조약돌','눈송이','무지개','반딧불' // 자연
];
// 형용사 20개 × 명사 35개 = 700가지 조합
const CUSTOM_NICK_KEY = 'woody_custom_nickname';
let sessionRandomNickname = null; // 새로고침 전까지 세션 내에서 고정

function getSessionRandomNickname() {
    if (!sessionRandomNickname) {
        const adj = NICK_ADJECTIVES[Math.floor(Math.random() * NICK_ADJECTIVES.length)];
        const noun = NICK_NOUNS[Math.floor(Math.random() * NICK_NOUNS.length)];
        sessionRandomNickname = `${adj} ${noun}`;
    }
    return sessionRandomNickname;
}

// existingNicknames: 겹침을 검사할 대상 목록 — 어떤 범위(지금 열린 식당의
// 리뷰 목록인지, 최근 문의 목록인지 등)로 검사할지는 호출하는 쪽이 정해서
// 넘겨줌. 이 함수 자체는 특정 탭의 상태를 모름.
function dedupeNickname(nickname, existingNicknames) {
    if (!existingNicknames.includes(nickname)) return nickname;
    let n = 2;
    while (existingNicknames.includes(`${nickname} ${n}`)) n++;
    return `${nickname} ${n}`;
}

window.NICK_ADJECTIVES = NICK_ADJECTIVES;
window.NICK_NOUNS = NICK_NOUNS;
window.CUSTOM_NICK_KEY = CUSTOM_NICK_KEY;
window.getSessionRandomNickname = getSessionRandomNickname;
window.dedupeNickname = dedupeNickname;

// ----- 지도 탭 식당 리스트 하단 광고 슬롯 표시/숨김 (PC 패널 index.js · 모바일
// 리스트 map-tab.js 공용) -----
// 애드센스 반려 사유("게시자 콘텐츠 없는 화면에 광고") 대응: 리스트에 실제
// 항목이 하나라도 렌더링된 뒤에만 광고 슬롯을 보여주고, 로딩 중이거나 검색
// 결과가 0건일 땐 숨김. 슬롯 자체(<ins class="adsbygoogle">)는 리스트를
// 다시 그릴 때마다 재생성하지 않고 hidden 속성만 토글 — 필터를 바꿀 때마다
// 광고가 다시 요청되면 애드센스 무효 트래픽/새로고침 정책에 걸릴 수 있음.
//
// push()는 이 함수 안에서 딱 한 번만, 그것도 슬롯이 "hidden → 보임"으로
// 실제 전환되는 그 순간에만 호출함(el.dataset.adPushed로 중복 방지).
// 처음부터(hidden 상태에서) 미리 push()해두면 애드센스가 폭 0으로 읽어서
// "No slot size for availableWidth=0" 에러가 남 — 반드시 보이게 된 뒤에
// 호출해야 함. offsetParent 체크는 PC에서 #left-panel 자체가
// display:none이라 모바일 전용 슬롯(#map-ad-slot)이 hidden을 풀어도 여전히
// 안 보이는 경우까지 걸러줌(부모 어딘가 display:none이면 offsetParent가 null).
function updateListAdSlot(slotId, hasItems) {
    const el = document.getElementById(slotId);
    if (!el) return;
    el.hidden = !hasItems;
    if (hasItems && !el.dataset.adPushed && el.offsetParent !== null) {
        el.dataset.adPushed = '1';
        // hidden 속성을 막 풀어준 직후라 이 시점에 바로 push()하면 레이아웃이
        // 아직 안 굳어서 너비를 0으로 읽는 경우가 있었음("No slot size for
        // availableWidth=0") — 브라우저가 레이아웃을 한 번 확정 짓도록 rAF로
        // 한 틱 미뤄서 호출.
        requestAnimationFrame(() => {
            try {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
            } catch (e) {
                console.error('광고 슬롯 초기화 실패:', e);
            }
        });
    }
}
window.updateListAdSlot = updateListAdSlot;
