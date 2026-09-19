(function() {
const SCORE_W_REVIEW = 10;   // 한줄평 1건당 점수 (비중 高)
const SCORE_W_POPULARITY = 1; // SNS클릭 인기도 1건당 점수 (비중 低)
const MIN_REVIEWS_FOR_RANKING = 3; // 랭킹 후보 최소 한줄평 수
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_LIMIT = 50;

let db;
let currentMode = 'ranking'; // 'ranking' | 'feed'
let currentPeriod = 'all';   // 'all' | 'week'
let popularityCache = {};    // { id: count }
let unsubPopularity = null;
let unsubFeed = null;

// 지역 검색 필터: Firestore를 다시 조회하지 않고, 마지막으로 받아온
// counts/metaList를 캐싱해뒀다가 로컬에서만 다시 걸러 그림 (타이핑할 때마다
// Firestore 쿼리를 새로 날리지 않기 위함 — API 한도 낭비 방지)
let lastCounts = null;
let lastMetaList = null;
let regionInputDebounceTimer = null;
let userManuallySetRegion = false; // 사용자가 직접 입력하면 위치 기반 자동 선택을 덮어쓰지 않음

async function initFirebase() {
    try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js');
        const { getFirestore, collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs } =
            await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

        const firebaseConfig = {
            apiKey: "AIzaSyAaMivo3ZBcwS5OjDjXmCo9kZo47t0rZBc",
            authDomain: "woody-table.firebaseapp.com",
            projectId: "woody-table",
            storageBucket: "woody-table.firebasestorage.app",
            messagingSenderId: "640333501525",
            appId: "1:640333501525:web:db00602be7d7e8742c30dc"
        };
        const apps = getApps();
        const app = apps.length ? apps[0] : initializeApp(firebaseConfig);
        db = getFirestore(app);

        window._rfCollection = collection;
        window._rfCollectionGroup = collectionGroup;
        window._rfQuery = query;
        window._rfWhere = where;
        window._rfOrderBy = orderBy;
        window._rfLimit = limit;
        window._rfOnSnapshot = onSnapshot;
        window._rfGetDocs = getDocs;
    } catch (e) {
        console.error('Firebase init err (rankfeed):', e);
    }
}

// index.html의 공용 캐시 로더(window.getRestaurantsData) 사용 — 탭을 오갈
// 때마다 엑셀을 새로 받고 새로 파싱하지 않도록(첫 로딩 이후엔 세션 내내
// 재사용, map-tab.html 등 다른 탭과도 같이 공유됨). 이 탭에서 쓰는 필드
// (id/name/region/lat/lng/visibility)는 공용 데이터에 이미 다 들어있어
// 별도 재가공 없이 그대로 씀.
function loadRestaurantsMeta() {
    return window.getRestaurantsData();
}

function withRestaurantMeta(cb) {
    loadRestaurantsMeta().then(cb).catch(e => {
        console.error('식당 데이터 로드 실패:', e);
        document.getElementById('rf-ranking-view').innerHTML = `<div class="rf-empty">데이터를 불러오지 못했어요. 새로고침 해주세요.</div>`;
        document.getElementById('rf-feed-view').innerHTML = `<div class="rf-empty">데이터를 불러오지 못했어요. 새로고침 해주세요.</div>`;
    });
}

let allRegions = []; // 지역 검색 드롭다운에 쓸 전체 지역 목록(한 번만 계산해 캐싱)
function populateRegionFilter(list) {
    if (allRegions.length) return;
    allRegions = [...new Set(list.map(r => r.region))].filter(r => r && r !== '미지정').sort();
    if (list.some(r => r.region === '미지정')) allRegions.push('미지정');
}

// 입력값(q)에 포함되는 지역만 걸러 드롭다운에 그림. q가 비어있으면 전체 목록.
// "전체"(필터 해제) 항목은 항상 맨 위에 고정으로 넣음.
function renderRegionDropdown(q) {
    const dropdown = document.getElementById('rfRegionDropdown');
    const matches = q ? allRegions.filter(r => r.includes(q)) : allRegions;
    const rows = [
        `<div class="rf-region-option all" onclick="window.selectRegionOption('')">전체</div>`,
        `<div class="rf-region-option current-loc" onclick="window.selectCurrentLocationOption()">현재 위치</div>`
    ].concat(matches.length
        ? matches.map(r => `<div class="rf-region-option" onclick="window.selectRegionOption('${r.replace(/'/g, "\\'")}')">${escapeHtml(r)}</div>`)
        : [`<div class="rf-region-option empty">일치하는 지역이 없어요</div>`]);
    dropdown.innerHTML = rows.join('');
    dropdown.hidden = false;
}

// 입력란에 이미 값(예: 현재 위치로 자동 채워진 지역)이 있어도 그 값은 그대로
// 둔 채, 클릭/포커스하면 바로 아래에 전체 목록을 세로로 보여줌 — 값을 지워야만
// 다른 지역이 보이는 문제(버그처럼 보인다는 피드백)를 해결하기 위함.
window.onRegionFilterFocus = function() {
    renderRegionDropdown(document.getElementById('rfRegionFilter').value.trim());
};

// 드롭다운에서 지역을 직접 선택했을 때: 입력값 반영 + 드롭다운 닫기 +
// debounce 없이 바로 재렌더(명시적으로 고른 액션이므로).
window.selectRegionOption = function(region) {
    userManuallySetRegion = true;
    document.getElementById('rfRegionFilter').value = region;
    document.getElementById('rfRegionDropdown').hidden = true;
    if (lastCounts && lastMetaList) renderRankingList(lastCounts, lastMetaList);
};

// 드롭다운의 "📍 현재 위치"를 직접 선택했을 때: 탭 진입 시 자동으로 하던 것과
// 같은 방식으로 다시 한 번 현재 위치를 가져와 가장 가까운 지역으로 채움
// (자동 채움 이후 사용자가 다른 지역으로 바꿔봤다가 다시 내 위치로 돌아오고
// 싶을 때를 위함). maximumAge:0으로 캐시된 위치 말고 매번 새로 요청.
window.selectCurrentLocationOption = function() {
    userManuallySetRegion = true;
    document.getElementById('rfRegionDropdown').hidden = true;
    const input = document.getElementById('rfRegionFilter');
    if (!navigator.geolocation) return;
    const originalPlaceholder = input.placeholder;
    input.value = '';
    input.placeholder = '위치 확인 중...';
    withRestaurantMeta((metaList) => {
        navigator.geolocation.getCurrentPosition((pos) => {
            input.placeholder = originalPlaceholder;
            const region = findNearestRegion(metaList, pos.coords.latitude, pos.coords.longitude);
            if (region) input.value = region;
            if (lastCounts && lastMetaList) renderRankingList(lastCounts, lastMetaList);
        }, (err) => {
            console.warn('현재 위치를 가져오지 못했어요:', err.message);
            input.placeholder = originalPlaceholder;
        }, { timeout: 5000, maximumAge: 0 });
    });
};

// 드롭다운 바깥을 클릭하면 닫음. 탭이 다시 열릴 때마다 스크립트가 재실행되므로
// 이전 리스너를 지우고 새로 등록해 document에 리스너가 계속 쌓이지 않게 함.
if (window.__rfOutsideClickHandler) {
    document.removeEventListener('click', window.__rfOutsideClickHandler);
}
window.__rfOutsideClickHandler = function(e) {
    const dropdown = document.getElementById('rfRegionDropdown');
    const input = document.getElementById('rfRegionFilter');
    if (!dropdown || !input || dropdown.hidden) return;
    if (e.target === input || dropdown.contains(e.target)) return;
    dropdown.hidden = true;
};
document.addEventListener('click', window.__rfOutsideClickHandler);

// getDistanceKm는 assets/js/shared.js의 공용 함수를 씀(index.html에서 이미 로드됨)

// 좌표(lat, lng)에서 가장 가까운 식당의 지역명을 찾음. 외부 API 호출 없이
// (네이버 지오코딩 등 사용 안 함) 이미 로드된 xlsx 좌표만으로 계산 —
// 별도 API 한도 소모 없음. 탭 진입 시 자동 선택과 드롭다운의 "📍 현재 위치"
// 둘 다 이 함수를 공용으로 씀.
function findNearestRegion(metaList, lat, lng) {
    let nearest = null, nearestDist = Infinity;
    metaList.forEach(r => {
        if (!r.lat || !r.lng) return;
        const d = getDistanceKm(lat, lng, r.lat, r.lng);
        if (d < nearestDist) { nearestDist = d; nearest = r; }
    });
    return (nearest && nearest.region && nearest.region !== '미지정') ? nearest.region : null;
}

// 탭 진입 시 현재 위치(브라우저 GPS)에서 가장 가까운 식당의 지역을 찾아
// 지역 검색란에 미리 채워둠.
function detectCurrentRegionAndApply(metaList) {
    if (userManuallySetRegion || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
        if (userManuallySetRegion) return; // 응답 오는 사이 사용자가 이미 직접 입력했으면 덮어쓰지 않음
        const region = findNearestRegion(metaList, pos.coords.latitude, pos.coords.longitude);
        if (region) {
            document.getElementById('rfRegionFilter').value = region;
            if (lastCounts && lastMetaList) renderRankingList(lastCounts, lastMetaList);
        }
    }, (err) => {
        console.warn('현재 위치를 가져오지 못했어요 (랭킹 지역 자동 선택 생략):', err.message);
    }, { timeout: 5000, maximumAge: 5 * 60 * 1000 });
}

function timeAgo(date) {
    const diffMs = Date.now() - date.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    if (day < 7) return `${day}일 전`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function goToRestaurant(id) {
    window._pendingSelectId = id;
    if (window.loadTab) window.loadTab('map');
}

// ===== 인기도(SNS 클릭) 실시간 구독 — 랭킹 점수 계산용, 모드/기간과 무관하게 한 번만 =====
function startPopularityListener() {
    if (unsubPopularity || !db) return;
    unsubPopularity = window._rfOnSnapshot(window._rfCollection(db, 'popularity'), (snap) => {
        popularityCache = {};
        snap.forEach(d => { popularityCache[d.id] = d.data().count || 0; });
        if (currentMode === 'ranking') renderRanking();
    });
}

// ===== 랭킹 =====
window.setRankFeedMode = function(mode) {
    currentMode = mode;
    document.getElementById('rfBtnRanking').classList.toggle('active', mode === 'ranking');
    document.getElementById('rfBtnFeed').classList.toggle('active', mode === 'feed');
    document.getElementById('rf-ranking-filters').style.display = mode === 'ranking' ? 'flex' : 'none';
    document.getElementById('rf-ranking-view').style.display = mode === 'ranking' ? '' : 'none';
    document.getElementById('rf-feed-view').style.display = mode === 'feed' ? '' : 'none';
    document.getElementById('rfRegionDropdown').hidden = true;

    if (mode === 'ranking') {
        stopFeedListener();
        renderRanking();
    } else {
        startFeedListener();
    }
};

window.setRankPeriod = function(period) {
    currentPeriod = period;
    document.getElementById('rfPeriodAll').classList.toggle('active', period === 'all');
    document.getElementById('rfPeriodWeek').classList.toggle('active', period === 'week');
    renderRanking();
};

// 지역 검색란 입력: Firestore를 다시 조회하지 않고 캐시된 결과를 로컬에서만
// 다시 걸러 그림. 타이핑 중 매 keystroke마다 다시 그리지 않도록 살짝 debounce.
window.onRegionFilterInput = function() {
    userManuallySetRegion = true;
    renderRegionDropdown(document.getElementById('rfRegionFilter').value.trim());
    clearTimeout(regionInputDebounceTimer);
    regionInputDebounceTimer = setTimeout(() => {
        if (lastCounts && lastMetaList) renderRankingList(lastCounts, lastMetaList);
    }, 150);
};

function renderRankingList(counts, metaList) {
    lastCounts = counts;
    lastMetaList = metaList;
    // 정확히 일치하는 지역명이 아니어도("강남" 같은 부분 검색어) 걸리도록 포함(includes) 매칭
    const rFilter = document.getElementById('rfRegionFilter').value.trim();
    const metaById = Object.fromEntries(metaList.map(r => [r.id, r]));

    let rows = Object.entries(counts)
        .map(([id, reviewCount]) => ({ id: parseInt(id), reviewCount }))
        .filter(r => metaById[r.id] && r.reviewCount >= MIN_REVIEWS_FOR_RANKING)
        .map(r => {
            const meta = metaById[r.id];
            const pop = popularityCache[r.id] || 0;
            return {
                ...r,
                name: meta.name,
                region: meta.region,
                score: r.reviewCount * SCORE_W_REVIEW + pop * SCORE_W_POPULARITY
            };
        })
        .filter(r => !rFilter || r.region.includes(rFilter))
        .sort((a, b) => b.score - a.score);

    const view = document.getElementById('rf-ranking-view');
    if (rows.length === 0) {
        view.innerHTML = `<div class="rf-empty">아직 랭킹에 오를 만큼(한줄평 ${MIN_REVIEWS_FOR_RANKING}건 이상) 쌓인 식당이 없어요.<br>한줄평이 ${MIN_REVIEWS_FOR_RANKING}개 이상 모인 식당부터 순위에 올라요. 식당 상세 화면에서 첫 한줄평을 남겨 보세요. ✍️</div>`;
        return;
    }

    view.innerHTML = rows.map((r, i) => {
        const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        const rankLabel = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
        return `
        <div class="rank-item" onclick="window.__rfGoTo(${r.id})">
            <div class="rank-num ${rankClass}">${rankLabel}</div>
            <div class="rank-body">
                <div class="rank-name">${r.name}</div>
                <div class="rank-meta">${r.region} · 한줄평 ${r.reviewCount}건</div>
            </div>
            <div class="rank-score">${r.score}점</div>
        </div>`;
    }).join('');
}

window.renderRanking = function() {
    if (!db) return;
    withRestaurantMeta((metaList) => {
        populateRegionFilter(metaList);
        startPopularityListener();

        if (currentPeriod === 'all') {
            // 전체 기간: 식당 문서에 누적해둔 reviewCount 필드를 한 번에 읽음
            window._rfGetDocs(window._rfCollection(db, 'restaurants')).then(snap => {
                const counts = {};
                snap.forEach(d => { counts[d.id] = d.data().reviewCount || 0; });
                renderRankingList(counts, metaList);
            }).catch(e => {
                console.error('랭킹(전체) 조회 실패:', e && e.message ? e.message : e);
                document.getElementById('rf-ranking-view').innerHTML = `<div class="rf-empty">랭킹을 불러오지 못했어요. 😢</div>`;
            });
        } else {
            // 이번 주: 최근 7일 이내 한줄평만 모아서 식당별로 집계
            const weekAgo = new Date(Date.now() - WEEK_MS);
            const q = window._rfQuery(
                window._rfCollectionGroup(db, 'reviews'),
                window._rfWhere('createdAt', '>=', weekAgo)
            );
            window._rfGetDocs(q).then(snap => {
                const counts = {};
                snap.forEach(d => {
                    const restaurantId = d.ref.parent.parent.id;
                    counts[restaurantId] = (counts[restaurantId] || 0) + 1;
                });
                renderRankingList(counts, metaList);
            }).catch(e => {
                console.error('랭킹(이번 주) 조회 실패:', e && e.message ? e.message : e);
                document.getElementById('rf-ranking-view').innerHTML = `<div class="rf-empty">랭킹을 불러오지 못했어요. 😢<br>(Firestore 색인이 아직 준비 안 됐을 수 있어요)</div>`;
            });
        }
    });
};

// ===== 피드 =====
function stopFeedListener() {
    if (unsubFeed) { unsubFeed(); unsubFeed = null; }
}

function startFeedListener() {
    if (!db) return;
    withRestaurantMeta((metaList) => {
        const metaById = Object.fromEntries(metaList.map(r => [r.id, r]));
        const view = document.getElementById('rf-feed-view');
        view.innerHTML = `<div class="rf-empty">불러오는 중... ⏳</div>`;

        stopFeedListener();
        const q = window._rfQuery(
            window._rfCollectionGroup(db, 'reviews'),
            window._rfOrderBy('createdAt', 'desc'),
            window._rfLimit(FEED_LIMIT)
        );
        unsubFeed = window._rfOnSnapshot(q, (snap) => {
            const items = [];
            snap.forEach(d => {
                const restaurantId = parseInt(d.ref.parent.parent.id);
                const meta = metaById[restaurantId];
                if (!meta) return; // 노출여부 비공개/확인필요 식당은 건너뜀
                const data = d.data();
                if (!data.createdAt) return; // 서버 타임스탬프 반영 전 임시 상태는 건너뜀
                items.push({
                    id: restaurantId,
                    name: meta.name,
                    region: meta.region,
                    text: data.text || '',
                    nickname: data.nickname || '익명',
                    date: data.createdAt.toDate()
                });
            });

            if (items.length === 0) {
                view.innerHTML = `<div class="rf-empty"><b>아직 올라온 한줄평이 없어요</b><br>식당 상세 화면 아래쪽에서 첫 한줄평을 남겨 보세요. 닉네임은 자동으로 채워져요. ✍️</div>`;
                return;
            }

            view.innerHTML = items.map(it => `
                <div class="feed-item" onclick="window.__rfGoTo(${it.id})">
                    <div class="feed-top">
                        <span class="feed-name">${escapeHtml(it.name)}</span>
                        <span class="feed-region">${escapeHtml(it.region)}</span>
                    </div>
                    <div class="feed-text">${escapeHtml(it.text)}</div>
                    <div class="feed-bottom">
                        <span>${escapeHtml(it.nickname)}</span>
                        <span>${timeAgo(it.date)}</span>
                    </div>
                </div>
            `).join('');
        }, (e) => {
            console.error('피드 조회 실패:', e && e.message ? e.message : e);
            view.innerHTML = `<div class="rf-empty">피드를 불러오지 못했어요. 😢<br>(Firestore 색인이 아직 준비 안 됐을 수 있어요)</div>`;
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.__rfGoTo = function(id) { goToRestaurant(id); };

// ===== 초기화 =====
initFirebase().then(() => {
    renderRanking(); // 지역 전체 상태로 먼저 한 번 렌더
    // 현재 위치를 얻는 대로(비동기) 가장 가까운 지역으로 필터를 자동 선택해 재렌더.
    // 외부 API 호출 없음 — 브라우저 GPS + 이미 로드된 xlsx 좌표 계산만 사용.
    withRestaurantMeta((metaList) => detectCurrentRegionAndApply(metaList));
});
})();
