(function() {
let restaurantsData = [];

// 저장된 집/회사 위치가 둘 다 없을 때(처음 쓰거나 방금 삭제한 경우)의 최후
// 수단 기본 시야 — 특정 업무지구 좌표를 쓰면 "이전에 등록했던 회사 위치인가?"
// 하는 혼란을 주므로, 일부러 서울시청 좌표 + 넓은 줌으로 "그냥 기본값일
// 뿐"이라는 게 한눈에 보이게 함. 실제로는 아래 init()에서 이 값보다 실시간
// GPS를 먼저 시도하고, GPS까지 실패했을 때만 이 값을 씀.
const FALLBACK_VIEW = { lat: 37.5665, lng: 126.9780, zoom: 11 };

// 로컬 스토리지에서 위치 불러오기
let savedHomeLoc = localStorage.getItem('woody_home_loc') ? JSON.parse(localStorage.getItem('woody_home_loc')) : null;
let savedCompanyLoc = localStorage.getItem('woody_company_loc') ? JSON.parse(localStorage.getItem('woody_company_loc')) : null;

// GPS 위치를 한 번만 가져오는 Promise 버전 — 초기 화면 중심을 정할 때 씀
// (watchPosition 기반 getAccurateLocation과 별개로, 앱 시작 시 "일단 한 번
// 받아보고 안 되면 안내"용 가벼운 버전).
function getCurrentPositionOnce(timeoutMs) {
    return new Promise((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { timeout: timeoutMs, maximumAge: 0 }
        );
    });
}

// ⚠️ 위 GPS 조회를 init()에서 매번(=다른 탭 갔다가 지도로 돌아올 때마다) 다시
// await하면, 이 탭 스크립트가 탭을 오갈 때마다 통째로 재실행되는 구조상
// 회사 위치를 안 정한 사용자는 지도 탭에 들어올 때마다 GPS 응답을 기다리는
// 동안(기기에 따라 권한 프롬프트가 매번 뜨거나 GPS 수신에 몇 초씩 걸릴 수
// 있음) 지도가 비어 보였음 — "다른 탭 갔다가 지도로 돌아오면 지도가 안
// 뜬다"는 제보의 원인. window에 Promise를 한 번만 캐싱해 세션 동안은 첫
// 시도 결과를 재사용하고, 이후 탭 재방문 때는 기다리지 않고 바로 씀.
function getCachedInitialGps(timeoutMs) {
    if (!window.__mapInitialGpsPromise) {
        window.__mapInitialGpsPromise = getCurrentPositionOnce(timeoutMs);
    }
    return window.__mapInitialGpsPromise;
}

let map, selectedMarkerId = null, markerMap = {};
let markerClustering = null;
let lastFilteredData = []; // filterData()가 마지막으로 계산한 필터 결과 (검색/지역/정렬이 바뀔 때만 마커 재구성용)
const LIST_RENDER_LIMIT = 200; // 목록 카드는 상위 N개만 그려서 초기 렌더링 부담을 줄임
let homeMarker = null, companyMarker = null, gpsMarker = null;

// 좌표 생성 축약 헬퍼
function LL(lat, lng) { return new naver.maps.LatLng(lat, lng); }

// 위치 지정 모드 여부 확인
const pickerMode = localStorage.getItem('woody_location_picker_mode'); // 'home' or 'company'
const searchedLocStr = localStorage.getItem('woody_picker_search_loc');

// 탭 이동 시 위치 지정 모드 유지 방지 (읽은 후 즉시 삭제)
localStorage.removeItem('woody_location_picker_mode');
localStorage.removeItem('woody_picker_search_loc');

// 테마 설정 (네이버 지도는 CARTO처럼 교체 가능한 무료 커스텀 스킨을 제공하지 않아
// 기본/다크 2종으로 단순화. 다크는 CSS 필터 오버레이로 구현.
// 앱 설정과 동기화: 0번=기본, 1번=다크. (예전 3단계 중 저장된 값이 2였다면 다크로 매핑)
const THEMES = [
    { name: '🌎 기본맵', bg: 'rgba(255,255,255,0.7)', color: '#333' },
    { name: '🌃 다크맵', bg: '#1e293b', color: '#fff', filterClass: 'dark-map-filter' }
];
let currentThemeIndex = parseInt(localStorage.getItem('woody_map_theme')) === 2 ? 1 : (parseInt(localStorage.getItem('woody_map_theme')) || 0);

// 파이어베이스 관련 변수
let db;
let unsubscribeReviews = null;

async function initFirebase() {
    try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js');
        const { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, getDoc, setDoc, increment } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');
        
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
        
        window.fsCollection = collection;
        window.fsAddDoc = addDoc;
        window.fsQuery = query;
        window.fsOrderBy = orderBy;
        window.fsLimit = limit;
        window.fsOnSnapshot = onSnapshot;
        window.fsServerTimestamp = serverTimestamp;
        window.fsDoc = doc;
        window.fsGetDoc = getDoc;
        window.fsSetDoc = setDoc;
        window.fsIncrement = increment;
    } catch(e) { console.error("Firebase init err:", e); }
}

async function init() {
    if (typeof naver === 'undefined' || !naver.maps) { setTimeout(init, 100); return; }
    const isMobile = window.innerWidth <= 768;

    // 초기 중심 좌표 결정 우선순위:
    //  1) 피커 모드에서 주소 검색으로 좌표를 골랐다면 그 좌표
    //  2) 피커 모드면 지금 수정하려는 대상(집/회사)에 이미 저장돼 있던 위치
    //  3) 일반 모드면 저장된 회사 위치(집은 예전부터 초기 중심엔 안 쓰고
    //     홈버튼/거리순 정렬 등 다른 곳에서만 기준점으로 사용 — 기존 동작 유지)
    //  4) 그래도 없으면(처음 쓰거나 집/회사를 방금 지운 경우) 실시간 GPS로
    //     시작 — 예전엔 이 경우 특정 업무지구(가산디지털단지) 좌표를 하드
    //     코딩 기본값으로 썼는데, 집/회사를 지워도 계속 그 위치가 나와서
    //     "이전에 등록했던 회사인가?" 하는 혼란을 줬음(실제로는 그냥 그
    //     하드코딩 기본값이었을 뿐, 삭제한 값이 되살아난 게 아니었음).
    //     GPS도 못 받으면(권한 거부/미지원) 넓은 기본 시야로 시작하고 위치
    //     권한을 허용해달라는 안내 배너를 띄움.
    let initialLat, initialLng, initialZoom = 17;

    if (pickerMode && searchedLocStr) {
        try {
            const parsed = JSON.parse(searchedLocStr);
            if (parsed.lat && parsed.lng) { initialLat = parsed.lat; initialLng = parsed.lng; }
        } catch(e) {}
    }
    if (initialLat == null && pickerMode) {
        const editingLoc = pickerMode === 'home' ? savedHomeLoc : savedCompanyLoc;
        if (editingLoc) { initialLat = editingLoc.lat; initialLng = editingLoc.lng; }
    }
    if (initialLat == null && !pickerMode && savedCompanyLoc) {
        initialLat = savedCompanyLoc.lat;
        initialLng = savedCompanyLoc.lng;
    }
    if (initialLat == null) {
        const gps = await getCachedInitialGps(6000);
        if (gps) {
            initialLat = gps.lat;
            initialLng = gps.lng;
        } else {
            initialLat = FALLBACK_VIEW.lat;
            initialLng = FALLBACK_VIEW.lng;
            initialZoom = FALLBACK_VIEW.zoom;
            if (!pickerMode) showGpsPermissionBanner();
        }
    }

    map = new naver.maps.Map('map', {
        center: LL(isMobile ? initialLat - 0.0006 : initialLat, initialLng),
        zoom: initialZoom,
        zoomControl: false
    });

    applyMapTheme(currentThemeIndex);

    // 회사 위치 마커 (있을 경우만)
    if (savedCompanyLoc) {
        companyMarker = new naver.maps.Marker({
            position: LL(savedCompanyLoc.lat, savedCompanyLoc.lng),
            map: map,
            icon: buildPinIcon('🏢', '회사')
        });
    }

    // 집 위치 마커 (있을 경우만)
    if (savedHomeLoc) {
        homeMarker = new naver.maps.Marker({
            position: LL(savedHomeLoc.lat, savedHomeLoc.lng),
            map: map,
            icon: buildPinIcon('🏠', '집')
        });
    }

    // 일반 모드에서는 GPS 우선 시도해서 위치 보정 (피커 모드는 검색/회사 좌표 고정)
    if (!pickerMode) {
        startGPS(false);
    }

    // 검색 모드 UI 활성화
    if (pickerMode) {
        document.getElementById('picker-crosshair').classList.add('active');
        document.getElementById('location-picker-ui').classList.add('active');
        document.getElementById('picker-title').innerText = pickerMode === 'home' ? '🏠 집 위치 지정' : '🏢 회사 위치 지정';

        // 모바일에서 왼쪽 패널이 화면을 가리지 않도록 자동 접기
        document.getElementById('left-panel').classList.add('collapsed');
    }

    // ✅ 지도 빈 공간 클릭 시 선택 해제
    naver.maps.Event.addListener(map, 'click', function() {
        if (selectedMarkerId !== null) {
            closeDetail();
        }
    });

    // ⚠️ 예전엔 지도가 멈출 때(idle)마다 화면 안 마커 전체를 통째로 새로 만들고
    // 클러스터링 인스턴스도 매번 새로 만들었음. 넓게 축소해서 볼 때(수도권 전체
    // 등, 마커 수천 개)는 이 "통째 재생성" 자체가 팬/줌 한 번에 수백 ms씩 걸리는
    // 원인이었음("조작하면 느려짐"). 지금은 renderMarkers()가 처음 한 번(검색/
    // 지역 필터/정렬이 바뀔 때) 뷰포트 안에 보이는 만큼만 만들어두고, 아래에서는
    // 팬/줌으로 새로 화면에 들어온 — 아직 마커 객체가 없는 — 식당만 추가로
    // 만든다. 이미 만든 마커는 다시 만들지 않으므로 이미 본 적 있는 영역을 다시
    // 지나가도 비용이 거의 없음. 벤더 클러스터링 라이브러리도 자체적으로 map의
    // idle 이벤트를 구독해서 재클러스터링하므로(_onIdle → _redraw), 여기서 직접
    // _redraw()를 호출해 새로 추가된 마커가 같은 틱에 바로 반영되게 함.
    naver.maps.Event.addListener(map, 'idle', function() {
        if (!map.getBounds) return;
        const bounds = map.getBounds();
        let added = false;
        lastFilteredData.forEach(r => {
            if (markerMap[r.id]) return; // 이미 만들어져 있음
            if (!bounds.hasLatLng(LL(r.lat, r.lng))) return; // 아직 화면 밖
            buildMarker(r);
            added = true;
        });
        // markerClustering이 아직 없어도(= 최초 renderMarkers() 시점엔 지도
        // bounds가 준비 안 돼서 0개였던 경우) attachOrUpdateClustering이 그때
        // 처음 만들어줌 — 그래서 여기선 markerClustering 존재 여부를 안 따짐.
        if (added) attachOrUpdateClustering(Object.values(markerMap));
    });

    try {
        await initFirebase();
        // index.html의 공용 캐시 로더 사용 — 탭을 오갈 때마다 엑셀을 새로
        // 받고 새로 파싱하지 않도록(첫 로딩 이후엔 세션 내내 재사용).
        restaurantsData = await window.getRestaurantsData();

        // 지역 옵션 동적 생성
        const regions = [...new Set(restaurantsData.map(r => r.region))].filter(r => r && r !== '미지정').sort();
        const regionSelect = document.getElementById('regionFilter');
        regionSelect.innerHTML = '<option value="all">지역 전체</option>'; // 초기화
        regions.forEach(rg => {
            const opt = document.createElement('option');
            opt.value = rg;
            opt.text = rg;
            regionSelect.appendChild(opt);
        });

        // 지역 미지정이 있으면 맨 뒤에 추가
        if (restaurantsData.some(r => r.region === '미지정')) {
            const opt = document.createElement('option');
            opt.value = '미지정';
            opt.text = '미지정';
            regionSelect.appendChild(opt);
        }

        filterData();

        // 다른 탭에서 식당 클릭 후 지도 탭으로 전환된 경우 자동 선택
        if (window._pendingSelectId !== undefined) {
            const pendingId = window._pendingSelectId;
            delete window._pendingSelectId;
            setTimeout(() => window.selectRestaurant(pendingId), 100);
        }

        // 다른 탭에서 위치 이동(GPS/Home) 후 지도 탭으로 전환된 경우
        if (window._pendingAction !== undefined) {
            const action = window._pendingAction;
            delete window._pendingAction;
            setTimeout(() => {
                if (action === 'gps') window.moveToGPS();
                else if (action === 'home') window.goHome();
            }, 100);
        }

        // 전체 인기도 데이터 실시간 구독
        window.fsOnSnapshot(window.fsCollection(db, 'popularity'), (snap) => {
            snap.forEach(doc => {
                window.popularityData[doc.id] = doc.data().count || 0;
            });
            // 인기순 재정렬을 위해 리스트 갱신
            filterData();
        });

    } catch(e) {
        console.error('Data fetch error:', e);
        document.getElementById('restaurantCards').innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444; font-size: 0.9em; font-weight: 700;">데이터를 불러오지 못했습니다.<br>새로고침 해주세요.</div>`;
    }
}

// 집/회사 핀 아이콘 생성 헬퍼 (홈/컴퍼니 마커 공용)
function buildPinIcon(emoji, label) {
    return {
        content: `<div class="map-marker-fix" style="display:flex; flex-direction:column; align-items:center;"><div style="font-size:20px; background:#fff; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border:3px solid #ef4444;">${emoji}</div><div style="margin-top:4px; font-size:11px; font-weight:700; color:#dc2626; text-shadow:-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff; white-space:nowrap;">${label}</div></div>`,
        size: new naver.maps.Size(100, 60),
        anchor: new naver.maps.Point(50, 30)
    };
}

// 마커 안에 들어가는 밥그릇+젓가락 글리프 (이모지 폰트 의존 없는 순수 SVG, 필드 핀 디자인)
// 부모 배지가 rotate(-45deg)로 눕혀 있는 만큼 아이콘 자체는 rotate(45deg)로 되돌려 세운다.
const RESTAURANT_GLYPH = `<svg viewBox="0 0 24 24" width="16" height="16" style="display:block; transform:rotate(45deg);">
    <g fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 11.5 A8 6 0 0 0 20 11.5"/>
        <path d="M3.3 11.5 H20.7"/>
        <path d="M5 11.5 A7 3.6 0 0 0 19 11.5"/>
        <line x1="14.5" y1="10" x2="18.5" y2="2.5"/>
        <line x1="16" y1="10" x2="20" y2="3"/>
        <path d="M8 4.5c0.8-1 0.8-1.8 0-2.7" stroke-width="1.4"/>
        <path d="M11 4.5c0.8-1 0.8-1.8 0-2.7" stroke-width="1.4"/>
    </g>
</svg>`;

// ✅ 마커 아이콘 생성 함수 (선택 여부에 따라 다른 디자인) — "필드 핀" 스타일
function createIcon(name, isSelected = false) {
    if (isSelected) {
        // 선택된 마커: 브랜드 블루 계열이면서도 밝고 선명하게 — 눈에 확 띄는 "선택됨" 티를 살림
        return {
            content: `<div class="map-marker-fix" style="display:flex; flex-direction:column; align-items:center;">
                <div style="width:30px;height:30px;background:#2E9BFF;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(46,155,255,0.35), 0 4px 14px rgba(46,155,255,0.6);animation:marker-focus 0.4s forwards;">
                    <div style="width:10px;height:10px;background:#fff;border-radius:50%;transform:rotate(45deg);"></div>
                </div>
                <div style="margin-top:4px; font-size:11px; font-weight:700; color:#0c3060; text-shadow:-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff; white-space:nowrap;">${name}</div>
            </div>
            <style>@keyframes marker-focus { 100% { transform: scale(1.3) translateY(-8px) rotate(-45deg); } }</style>`,
            size: new naver.maps.Size(100, 60),
            anchor: new naver.maps.Point(50, 30)
        };
    } else {
        // 기본 마커: 파란 필드 핀 + 밥그릇 글리프, 작고 얇은 글씨
        return {
            content: `<div class="map-marker-fix" style="display:flex; flex-direction:column; align-items:center;">
                <div style="width:30px; height:30px; background:#3182F6; border:2px solid #fff; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(49,130,246,0.4);">
                    ${RESTAURANT_GLYPH}
                </div>
                <div style="margin-top:3px; font-size:9px; font-weight:500; color:#334155; text-shadow:-0.5px -0.5px 0 #fff, 0.5px -0.5px 0 #fff, -0.5px 0.5px 0 #fff, 0.5px 0.5px 0 #fff; white-space:nowrap;">${name}</div>
            </div>`,
            size: new naver.maps.Size(100, 60),
            anchor: new naver.maps.Point(50, 30)
        };
    }
}

// ✅ 마커 클러스터링 (식당이 많아질수록 화면에 그리는 마커 수를 줄여 성능 확보)
// 네이버 공식 MarkerClustering.js(Apache 2.0, assets/js/에 자체 포함) 사용.
// count < 10: 작은 원 / 10~49: 중간 / 50개 이상: 큰 원, 3단계로 표시.
function buildClusterIcon(sizePx, bgColor) {
    return {
        content: `<div class="map-marker-fix" style="display:flex; align-items:center; justify-content:center; width:${sizePx}px; height:${sizePx}px; border-radius:50%; background:${bgColor}; border:3px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.25); color:#fff; font-weight:800; font-family:'Pretendard','Noto Sans KR',sans-serif;"><span class="cluster-count"></span></div>`,
        size: new naver.maps.Size(sizePx, sizePx),
        anchor: new naver.maps.Point(sizePx / 2, sizePx / 2)
    };
}
// 브랜드 블루(#3182F6) 한 색만 밝기 단계로 써서 통일 — 옅은 톤 → 원색 → 진한 톤
const CLUSTER_ICONS = [
    buildClusterIcon(36, 'rgba(49,130,246,0.75)'), // 2~9개 (연한 톤)
    buildClusterIcon(44, '#3182F6'),                // 10~49개 (브랜드 원색)
    buildClusterIcon(54, '#1B64DA')                 // 50개 이상 (진한 톤, 선택 마커와 동일)
];

window.popularityData = {}; // 인기도 캐시

window.updateListAndMarkers = function() {
    if (typeof window.filterData === 'function') {
        window.filterData();
    }
};

// 검색창은 글자 하나 칠 때마다 전체 목록/마커/클러스터링을 다시 만드는
// filterData()를 바로 부르면 타이핑할 때마다 부담이 커서(특히 데이터가
// 수천 건일 때) 200ms 동안 입력이 없을 때만 한 번 실행되도록 지연시킴.
let filterDataDebounceTimer = null;
window.filterDataDebounced = function() {
    clearTimeout(filterDataDebounceTimer);
    filterDataDebounceTimer = setTimeout(() => window.filterData(), 200);
};

window.filterData = function() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const rFilter = document.getElementById('regionFilter') ? document.getElementById('regionFilter').value : 'all';
    const isD = document.getElementById('dinnerToggle').classList.contains('active');
    const isPopSort = document.getElementById('sortToggle') ? document.getElementById('sortToggle').classList.contains('active') : false;
    
    let filtered = restaurantsData.filter(r => {
        const mQ = r.name.toLowerCase().includes(q);
        const mR = rFilter === 'all' || r.region === rFilter;
        const mD = !isD || (r.hours.includes('석식') || /17:|18:|19:/.test(r.hours));
        const favs = window.parent.getFavorites ? window.parent.getFavorites() : [];
        const mF = !window.isFavoriteMode || favs.includes(r.id);
        return mQ && mR && mD && mF;
    });

    // 인기순 정렬 버튼 활성화 시에만 정렬 (내림차순)
    if (isPopSort) {
        filtered.sort((a, b) => {
            const popA = window.popularityData[a.id] || 0;
            const popB = window.popularityData[b.id] || 0;
            return popB - popA;
        });
    } else {
        // 기본 정렬: 거리순. 기준점은 GPS 우선, 없으면 회사(점심 기준지) 저장 위치, 그것도 없으면 집 위치.
        // 기준점이 전혀 없으면(첫 방문 등) 정렬하지 않고 등록 순서를 그대로 유지.
        const refLoc = (currentGPSLat !== null && currentGPSLng !== null)
            ? { lat: currentGPSLat, lng: currentGPSLng }
            : (savedCompanyLoc || savedHomeLoc || null);
        if (refLoc) {
            filtered.sort((a, b) =>
                getDistanceKm(refLoc.lat, refLoc.lng, a.lat, a.lng) -
                getDistanceKm(refLoc.lat, refLoc.lng, b.lat, b.lng)
            );
        }
    }

    lastFilteredData = filtered;

    // 목록 카드는 상위 N개만 렌더링 (데이터가 많아져도 화면에 한 번에 그리는
    // DOM 개수를 제한해서 초기 로딩이 느려지지 않게 함). 정렬(거리순/인기순)이
    // 이미 위에서 끝난 상태라 "상위 N개"는 항상 사용자에게 가장 관련 있는 항목.
    const listItems = filtered.slice(0, LIST_RENDER_LIMIT);

    document.getElementById('restaurantCards').innerHTML = listItems.map((r, index) => {
        const isDinner = r.hours.includes('석식') || /17:|18:|19:/.test(r.hours);
        const popCount = window.popularityData[r.id] || 0;
        
        const favs = window.parent.getFavorites ? window.parent.getFavorites() : [];
        const isFav = favs.includes(r.id);
        const favIcon = isFav ? '<span style="display:inline-block; width:22px; text-align:center; color:#FBBF24;">⭐</span>' : '<span style="display:inline-block; width:22px; text-align:center; opacity:0.35; filter: grayscale(1);">⭐</span>';

        // 인기순 정렬 활성화 시에만 상위 3위 메달 및 불꽃 표시
        let rankIcon = '';
        let popHtml = '';
        if (isPopSort && popCount > 0) {
            if (index === 0) rankIcon = '🥇 ';
            else if (index === 1) rankIcon = '🥈 ';
            else if (index === 2) rankIcon = '🥉 ';
            popHtml = `<span style="font-size:0.8em; color:var(--main-blue); font-weight:800;">🔥 ${popCount}</span>`;
        }

        return `
        <div class="restaurant-card" onclick="selectRestaurant(${r.id})">
            <div style="font-weight:700; font-size:0.95em; color:var(--text-primary); display:flex; justify-content:space-between; align-items:center;">
                <span>${rankIcon}${r.name}</span>
                <div>
                    ${popHtml}
                    <span style="cursor:pointer; font-size:1.15em; margin-left:6px;" onclick="if(window.parent.toggleFavorite) window.parent.toggleFavorite(event, ${r.id})" title="즐겨찾기">${favIcon}</span>
                </div>
            </div>
            <div style="font-size:0.8em; color:#64748b; margin-top:3px;">
                💳 ${r.price ? r.price.toLocaleString() + '원' : '-'} 
                ${isDinner ? '<span class="dinner-badge">🌙 석식 가능</span>' : ''}
            </div>
        </div>`;
    }).join('') + (filtered.length > LIST_RENDER_LIMIT
        ? `<div style="padding:14px; text-align:center; font-size:0.8em; color:var(--text-secondary);">그 외 ${(filtered.length - LIST_RENDER_LIMIT).toLocaleString()}곳 더 있어요 — 검색이나 지역 필터로 좁혀보세요</div>`
        : '');

    // ✅ 검색/지역 필터/정렬 결과(lastFilteredData)가 바뀔 때만 마커를 다시
    // 만든다. 팬/줌 자체로는 다시 안 만듦 — 클러스터링 라이브러리가 지도
    // idle 이벤트를 자체 구독해서 이미 있는 마커들을 알아서 재클러스터링함.
    renderMarkers();
}

// 식당 한 곳의 마커 객체를 만들고 markerMap에 등록 + 클릭 리스너 연결.
// renderMarkers()의 초기 구성과, 아래 idle 리스너의 점진적 추가 양쪽에서 공용으로 씀.
function buildMarker(r) {
    const isSelected = r.id === selectedMarkerId;
    const marker = new naver.maps.Marker({
        position: LL(r.lat, r.lng),
        icon: createIcon(r.name, isSelected)
    });
    markerMap[r.id] = marker;
    // 마커 클릭은 지도 클릭 이벤트와 별도로 처리되어 전파 걱정 없음
    naver.maps.Event.addListener(marker, 'click', function() {
        selectRestaurant(r.id);
    });
    return marker;
}

// ✅ 검색/지역 필터/정렬 결과(lastFilteredData)가 바뀔 때 마커를 처음부터 다시 만든다.
// 데이터 총량(5천 건 이상)이 아니라 "지금 화면(뷰포트) 안에 들어온 만큼만" 마커
// 객체를 만들어서 시작하고(그래야 필터를 바꿀 때마다 항상 빠름), 이후 사용자가
// 팬/줌으로 화면을 넓히면서 새로 들어오는 식당은 아래 idle 리스너가 그때그때
// 추가로만 만든다 — 이미 만든 마커는 다시 안 만들고 그대로 재사용.
//
// ⚠️ 예전엔 팬/줌으로 지도가 멈출 때(idle)마다 화면 안 마커를 통째로 새로
// 만들었었는데, 넓게 축소해서 볼 때(수도권 전체 등, 마커 수천 개)는 이 통째
// 재생성 자체가 팬/줌 한 번에 수백 ms씩 걸리는 원인이었음. 지금은 idle마다
// "새로 들어온 것만" 추가하므로 이미 본 적 있는 영역을 다시 지나가도 비용이 없음.
function renderMarkers() {
    if (!map) return;

    // 개별 마커는 map을 직접 지정하지 않음 — 클러스터링 라이브러리가 줌 레벨에 따라
    // 낱개로 보여줄지, 클러스터 원으로 묶어 보여줄지 알아서 지도에 붙이고 뗀다.
    Object.values(markerMap).forEach(m => m.setMap(null));
    if (markerClustering) {
        // ⚠️ MarkerClustering.js 자체 버그 우회: onAdd()는 idle 리스너를
        // this._mapRelations(복수형)에 저장하는데, onRemove()는 존재하지 않는
        // this._mapRelation(단수형, 오타)을 지우려고 해서 실제로는 리스너가 안
        // 지워짐. setMap(null)만 호출하면 리스너가 지도에 계속 쌓여서, 검색/필터가
        // 바뀔 때마다(이 함수가 반복 호출될 때마다) 죽은 리스너가 하나씩 누적되어
        // 시간이 지날수록 점점 느려지는 원인이 됐음. 여기서 올바른 이름의 참조를
        // 직접 지워서 실제로 리스너가 제거되게 함.
        if (markerClustering._mapRelations) {
            naver.maps.Event.removeListener(markerClustering._mapRelations);
        }
        markerClustering.setMap(null);
        markerClustering = null;
    }
    markerMap = {};

    // ⚠️ 이 시점(tab HTML이 막 주입된 직후)엔 지도 컨테이너가 아직 브라우저의
    // 레이아웃 계산을 안 거쳤을 수 있어 map.getBounds()가 실제 화면과 안 맞는
    // (혹은 빈) bounds를 돌려줄 수 있음 — index.html의 isMobile()/innerWidth가
    // 초기엔 0으로 나오던 것과 같은 종류의 타이밍 이슈. 그래서 여기서 뷰포트로
    // 걸러 0개가 나와도 문제없음: 아래 idle 리스너가 지도가 실제로 자리를 잡고
    // 첫 idle을 내보내는 시점에 "아직 안 만들어진 마커"를 마저 채워준다.
    const bounds = map.getBounds && map.getBounds();
    const initial = bounds ? lastFilteredData.filter(r => bounds.hasLatLng(LL(r.lat, r.lng))) : lastFilteredData;
    initial.forEach(buildMarker);

    attachOrUpdateClustering(Object.values(markerMap));
}

// 새로 만든(또는 갱신된) 마커 배열을 클러스터링에 반영한다. 기존 인스턴스가
// 있으면 setMarkers + 강제 재계산(_redraw)만 하고, 없으면(처음 화면에 뭔가
// 뜨는 시점) 새로 만든다 — renderMarkers()의 최초 구성과 idle 리스너의 점진적
// 추가 양쪽에서 공용으로 씀.
function attachOrUpdateClustering(markerList) {
    if (markerClustering) {
        markerClustering.setMarkers(markerList);
        if (typeof markerClustering._redraw === 'function') markerClustering._redraw();
    } else if (markerList.length > 0 && typeof MarkerClustering !== 'undefined') {
        markerClustering = new MarkerClustering({
            minClusterSize: 3,
            maxZoom: 15,
            map: map,
            markers: markerList,
            disableClickZoom: false,
            gridSize: 100,
            icons: CLUSTER_ICONS,
            indexGenerator: [10, 50],
            stylingFunction: function(clusterMarker, count) {
                const el = clusterMarker.getElement();
                const countEl = el && el.querySelector('.cluster-count');
                if (countEl) countEl.textContent = count;
            }
        });
    } else if (markerList.length > 0) {
        // 클러스터링 스크립트를 못 불러온 경우를 대비한 대체 동작(전부 낱개로 표시)
        markerList.forEach(m => m.setMap(map));
    }
}

window.selectRestaurant = function(id) {
    const isPanelOpen = document.getElementById('detail-panel').classList.contains('open');
    if (selectedMarkerId === id && isPanelOpen) {
        window.closeDetail();
        return;
    }

    const r = restaurantsData.find(x => x.id === id);
    if (!r) return;
    
    // ✅ 이전 선택 마커 복구
    if (selectedMarkerId !== null && markerMap[selectedMarkerId]) {
        const prevR = restaurantsData.find(x => x.id === selectedMarkerId);
        if (prevR) {
            markerMap[selectedMarkerId].setIcon(createIcon(prevR.name, false));
        }
    }
    
    // ✅ 새 마커 선택
    selectedMarkerId = id;
    if (markerMap[id]) {
        markerMap[id].setIcon(createIcon(r.name, true));
    }
    
    // ✅ 모바일에서는 마커를 위쪽에 표시
    const isMobile = window.innerWidth <= 768;
    map.panTo(LL(isMobile ? r.lat - 0.0006 : r.lat, r.lng));
    
    document.getElementById('detailName').innerText = r.name;
    
    // 인기도 로드 + 집계 (식당 상세를 열 때마다 1회 — 인스타/카카오 링크 유무와
    // 무관하게 모든 식당이 동등하게 카운트됨. 같은 식당을 실수로 여러 번 열어도
    // 새로고침 전까진 한 번만 올라가도록 세션 내 중복 방지)
    loadPopularity(id);
    if (!popularityCountedThisSession.has(id)) {
        popularityCountedThisSession.add(id);
        increasePopularity(id);
    }

    const detailDescEl = document.getElementById('detailDesc');
    detailDescEl.innerText = r.description || "";
    detailDescEl.style.display = r.description ? 'block' : 'none';
    
    let formattedHours = r.hours || "정보 없음";
    formattedHours = formattedHours.replace(/, /g, "<br>").replace(/,/g, "<br>");
    document.getElementById('detailHours').innerHTML = formattedHours;
    document.getElementById('detailPrice').innerText = r.price ? `${r.price.toLocaleString()}원` : '-';

    // SNS 버튼 렌더링 (인스타 + 카카오톡 채널)
    let snsHtml = '';
    if (r.instagram) snsHtml += `<a href="${r.instagram}" target="_blank" class="insta-btn">📸 인스타그램<\/a>`;
    if (r.kakaoChannel) snsHtml += `<a href="${r.kakaoChannel}" target="_blank" class="kakao-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="#3C1E1E"><path d="M12 3c-6.627 0-12 4.254-12 9.5 0 3.321 2.161 6.248 5.5 7.91l-1.13 4.144c-.066.241.02.5.213.655a.575.575 0 0 0 .341.111c.119 0 .237-.036.338-.107l4.908-3.414c.6.066 1.21.101 1.83.101 6.627 0 12-4.254 12-9.5S18.627 3 12 3z"/><\/svg> 카톡 채널<\/a>`;
    if (r.naverBlog) snsHtml += `<a href="${r.naverBlog}" target="_blank" class="naver-btn"><svg width="15" height="15" viewBox="0 0 24 24"><path d="M4 4.5C4 3.67 4.67 3 5.5 3h9.6c.36 0 .7.14.96.38l3.9 3.62c.28.26.44.63.44 1.02V19.5c0 .83-.67 1.5-1.5 1.5h-13C4.67 21 4 20.33 4 19.5v-15Z" fill="#fff"/><path d="M14.6 3.2v3.6c0 .77.63 1.4 1.4 1.4h3.7" fill="none" stroke="#03C75A" stroke-width="1.1"/><rect x="7" y="12" width="10" height="1.6" rx="0.8" fill="#03C75A"/><rect x="7" y="15.4" width="7" height="1.6" rx="0.8" fill="#03C75A"/><\/svg> 블로그<\/a>`;
    document.getElementById('snsArea').innerHTML = snsHtml;

    // 한줄평 로드
    loadReviews(id);
    document.getElementById('reviewInput').value = '';
    prefillReviewNickname();
    document.getElementById('reviewCooldownMsg').innerHTML = '';
    resetEditSuggestForm();
    document.getElementById('detail-panel').classList.add('open');
}

window.closeDetail = function() { 
    document.getElementById('detail-panel').classList.remove('open'); 
    
    if (typeof window.plpClearSelection === 'function') {
        window.plpClearSelection();
    } 
    
    // 패널을 닫을 때 선택된 마커 스타일도 초기화
    if (selectedMarkerId !== null) {
        const prevR = restaurantsData.find(x => x.id === selectedMarkerId);
        if (prevR && markerMap[selectedMarkerId]) {
            markerMap[selectedMarkerId].setIcon(createIcon(prevR.name, false));
        }
        selectedMarkerId = null;
    }
}

window.toggleCollapse = function() { 
    document.getElementById('left-panel').classList.toggle('collapsed'); 
    closeDetail(); 
}

const FILTER_ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6Z"/><circle cx="12" cy="9" r="2.2"/></svg>';
const FILTER_ICON_FLAME = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.2 2.6-1.6 3.8-1.6 6.6a3.6 3.6 0 0 0 7.2 0c0-.9-.4-1.7-.9-2.5.9 0 1.8 1.7 1.8 4.4a6.3 6.3 0 1 1-12.6 0c0-3.6 2.7-5.4 3.6-8.1.4.9.9 1.8 2.5 0Z"/></svg>';

window.toggleDinner = function() {
    const b = document.getElementById('dinnerToggle');
    b.classList.toggle('active');
    if (b.classList.contains('active')) {
        b.style.background = 'var(--primary)';
        b.style.color = '#fff';
        b.style.borderColor = 'var(--primary)';
    } else {
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
    }
    filterData();
}

window.toggleSort = function() {
    const b = document.getElementById('sortToggle');
    b.classList.toggle('active');
    if (b.classList.contains('active')) {
        b.style.background = 'var(--primary)';
        b.style.color = '#fff';
        b.style.borderColor = 'var(--primary)';
        b.innerHTML = FILTER_ICON_FLAME + '인기순';
    } else {
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
        b.innerHTML = FILTER_ICON_PIN + '거리순';
    }
    filterData();
}

// ✅ 지도 테마 적용 (기본/다크). 네이버 지도는 커스텀 타일 스킨이 없어
// 다크는 지도 컨테이너에 CSS 필터를 씌우는 방식으로 구현.
function applyMapTheme(index) {
    const mapEl = document.getElementById('map');
    THEMES.forEach(theme => { if (theme.filterClass && mapEl) mapEl.classList.remove(theme.filterClass); });
    const t = THEMES[index];
    if (t.filterClass && mapEl) mapEl.classList.add(t.filterClass);

    const b = document.getElementById('themeToggle');
    if (b) {
        b.innerHTML = t.name;
        b.style.background = t.bg;
        b.style.color = t.color;
        b.style.borderColor = (index === 1) ? '#0f172a' : '#fff';
    }
}

window.setMapTheme = function(index) {
    currentThemeIndex = index;
    localStorage.setItem('woody_map_theme', currentThemeIndex); // 로컬 스토리지에 저장
    applyMapTheme(currentThemeIndex);
}

// ✅ 테마 토글 함수
window.toggleMapTheme = function() {
    window.setMapTheme((currentThemeIndex + 1) % THEMES.length);
}

// 위치 지정 모드 저장
window.saveLocation = function() {
    if (!pickerMode) return;
    const center = map.getCenter();
    const c = { lat: center.lat(), lng: center.lng() };
    const saveKey = pickerMode === 'home' ? 'woody_home_loc' : 'woody_company_loc';
    localStorage.setItem(saveKey, JSON.stringify({lat: c.lat, lng: c.lng}));

    // 1. 마커 화면에서 즉시 위치 이동 처리
    if (pickerMode === 'home') {
        savedHomeLoc = {lat: c.lat, lng: c.lng};
        if (homeMarker) {
            homeMarker.setPosition(LL(c.lat, c.lng));
        } else {
            homeMarker = new naver.maps.Marker({ position: LL(c.lat, c.lng), map: map, icon: buildPinIcon('🏠', '집') });
        }
    } else if (pickerMode === 'company') {
        savedCompanyLoc = {lat: c.lat, lng: c.lng};
        if (companyMarker) {
            companyMarker.setPosition(LL(c.lat, c.lng));
        } else {
            companyMarker = new naver.maps.Marker({ position: LL(c.lat, c.lng), map: map, icon: buildPinIcon('🏢', '회사') });
        }
    }
    
    // 2. 안내 모달 UI 변경
    const uiContainer = document.getElementById('location-picker-ui');
    const titleEl = document.getElementById('picker-title');
    const descEl = titleEl.nextElementSibling;
    titleEl.innerText = "설정이 완료 되었습니다! ✅";
    titleEl.style.color = "#10b981"; // 초록빛 성공색
    descEl.innerText = pickerMode === 'home' ? "이제 집 핀이 이 위치에 고정됩니다." : "이제 회사 핀이 이 위치에 고정됩니다.";
    
    // 버튼 숨김
    const btns = document.querySelectorAll('#location-picker-ui .picker-btn');
    btns.forEach(b => b.style.display = 'none');
    
    // 크로스헤어 즉시 숨김
    document.getElementById('picker-crosshair').classList.remove('active');
    
    // 상태 초기화 방지 (5초 후 다시 복구하기 위함)
    // localStorage.removeItem('woody_location_picker_mode');
    
    // 검색결과 기준점은 삭제 (더 이상 고정되지 않게)
    localStorage.removeItem('woody_picker_search_loc');
    
    // 3. 약간의 딜레이 후 UI 창 복구 (실수 대비)
    setTimeout(() => {
        document.getElementById('picker-crosshair').classList.add('active');
        
        // 향후 진입을 위해 원상 복구
        titleEl.style.color = "var(--main-blue)";
        titleEl.innerText = pickerMode === 'home' ? '🏠 집 위치 지정' : '🏢 회사 위치 지정';
        descEl.innerText = "지도를 움직여 중심을 맞춘 후\n완료를 눌러주세요.";
        btns.forEach(b => b.style.display = 'inline-block');
    }, 3000);
};

// 위치 지정 모드 취소
window.cancelLocationPicker = function() {
    // 설정 화면의 '자주 가는 장소 설정' 탭으로 복귀
    localStorage.setItem('woody_setting_resume_screen', 'favorite-places');
    if (window.loadTab) {
        window.loadTab('contact'); // 설정 화면으로 복구
    } else {
        document.getElementById('picker-crosshair').classList.remove('active');
        document.getElementById('location-picker-ui').classList.remove('active');
    }
};

window.goHome = function() {
    const dest = getSmartHomeDest();
    if (!dest.loc) {
        alert(dest.type === 'home' ? '집 위치를 지정해주세요' : '회사 위치를 지정해주세요');
        return;
    }
    const isMobile = window.innerWidth <= 768;
    map.setCenter(LL(isMobile ? dest.loc.lat - 0.0006 : dest.loc.lat, dest.loc.lng));
    map.setZoom(17);
    closeDetail();
}

// ===== GPS 현재 위치 =====
// getDistanceKm는 assets/js/shared.js의 공용 함수를 씀(index.html에서 이미 로드됨)

// 현재 GPS 좌표 저장 (proximity 연산용)
let currentGPSLat = null, currentGPSLng = null;

// Home 버튼: GPS 위치에 따라 집/회사 중 가까운 쪽을 { type, loc } 형태로 반환
// loc이 null이면 아직 해당 위치가 지정되지 않은 상태
function getSmartHomeDest() {
    if (currentGPSLat === null) {
        return savedHomeLoc ? { type: 'home', loc: savedHomeLoc } : { type: 'home', loc: null };
    }
    const distHome = savedHomeLoc ? getDistanceKm(currentGPSLat, currentGPSLng, savedHomeLoc.lat, savedHomeLoc.lng) : Infinity;
    const distCompany = savedCompanyLoc ? getDistanceKm(currentGPSLat, currentGPSLng, savedCompanyLoc.lat, savedCompanyLoc.lng) : Infinity;
    if (distHome === Infinity && distCompany === Infinity) {
        // 둘 다 지정 안 됨: 집 마크를 기본으로 노출
        return { type: 'home', loc: null };
    }
    if (distHome <= distCompany) {
        return { type: 'home', loc: savedHomeLoc };
    }
    return { type: 'company', loc: savedCompanyLoc };
}

// Home 버튼 UI 업데이트
function updateHomeBtn() {
    const btn = document.getElementById('home-btn');
    if (!btn) return;
    const dest = getSmartHomeDest();
    const houseIcon = '<svg viewBox="0 0 24 24"><path d="M12 3 L20 11 L4 11 Z" fill="#fff"/><rect x="5" y="10.5" width="14" height="10.5" fill="#fff"/><rect x="15" y="2.2" width="2.2" height="5.3" rx="0.3" fill="#fff"/><rect x="7.6" y="13" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/><rect x="13.6" y="13" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/><rect x="7.6" y="17" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/><rect x="13.6" y="17" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/></svg>';
    const buildingIcon = '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="1.5" fill="#fff"/><rect x="7.7" y="6.4" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="13.7" y="6.4" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="7.7" y="10" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="13.7" y="10" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="7.7" y="13.6" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="13.7" y="13.6" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="10" y="17.2" width="4" height="3.3" rx="0.6" fill="var(--primary)"/></svg>';
    btn.innerHTML = dest.type === 'home' ? houseIcon : buildingIcon;
}
function placeGPSMarker(lat, lng) {
    currentGPSLat = lat;
    currentGPSLng = lng;
    // PC 영구 패널(index.html)도 같은 GPS 좌표로 거리순 정렬할 수 있도록 window에 미러링
    window.currentGPSLat = lat;
    window.currentGPSLng = lng;
    if (gpsMarker) {
        gpsMarker.setPosition(LL(lat, lng));
    } else {
        gpsMarker = new naver.maps.Marker({
            position: LL(lat, lng),
            map: map,
            icon: { content: `<div class="gps-dot map-marker-fix"></div>`, size: new naver.maps.Size(18, 18), anchor: new naver.maps.Point(9, 9) },
            zIndex: 500
        });
    }
    updateHomeBtn();
    // PC 영구 패널(index.html)의 집/회사 버튼도 같은 GPS로 아이콘을 갱신
    if (typeof window.updatePlpHomeBtn === 'function') window.updatePlpHomeBtn();
    // GPS 위치가 갱신되면 거리순 기본 정렬도 다시 계산 (모바일 탭 목록 + PC 영구 패널 둘 다)
    if (typeof window.filterData === 'function') window.filterData();
    if (typeof window.plpFilterData === 'function') window.plpFilterData();
}

// ========== 위치 보정 로직 (watchPosition 활용) ==========
let gpsWatchId = null;
let gpsTimeoutId = null;

function getAccurateLocation(onLocation, onComplete, onError, timeoutMs = 10000) {
    if (!navigator.geolocation) {
        if (onError) onError(new Error('GPS 미지원'));
        return;
    }

    if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
    if (gpsTimeoutId) clearTimeout(gpsTimeoutId);

    let bestAccuracy = 999999;
    let updateCount = 0;

    // 제한 시간 내에 가장 정확한 위치를 찾고 감시 종료
    gpsTimeoutId = setTimeout(() => {
        if (gpsWatchId) navigator.geolocation.clearWatch(gpsWatchId);
        if (onComplete) onComplete();
    }, timeoutMs);

    gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            const acc = pos.coords.accuracy;
            // 이전보다 정확도가 향상되었거나 첫 측정일 때 위치 업데이트
            if (acc < bestAccuracy) {
                bestAccuracy = acc;
                onLocation(pos.coords.latitude, pos.coords.longitude, updateCount === 0);
                updateCount++;
            }

            // 오차가 50m 이내면 충분히 정확하므로 조기 종료
            if (acc <= 50) {
                clearTimeout(gpsTimeoutId);
                navigator.geolocation.clearWatch(gpsWatchId);
                if (onComplete) onComplete();
            }
        },
        (err) => {
            // 한 번도 위치를 가져오지 못한 상태에서 에러가 발생한 경우만 에러 처리
            if (updateCount === 0 && onError) {
                clearTimeout(gpsTimeoutId);
                navigator.geolocation.clearWatch(gpsWatchId);
                onError(err);
            }
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
}

// 내 위치로 지도 이동 + 마커 표시 (앱 시작 시 호출)
function startGPS(panToLocation) {
    getAccurateLocation(
        (lat, lng, isFirst) => {
            placeGPSMarker(lat, lng);
            // panToLocation이 명시적으로 false가 아니고 첫 위치 갱신일 때만 지도 이동
            // (이후 정확한 위치가 잡히면 마커만 이동하고 지도는 안 움직임 -> 사용자 방해 방지)
            if (panToLocation !== false && isFirst) {
                const isMobile = window.innerWidth <= 768;
                map.setCenter(LL(isMobile ? lat - 0.0006 : lat, lng));
                map.setZoom(17);
            }
        },
        () => {}, // 완료 시 별도 액션 없음
        (err) => { console.warn('GPS 오류:', err?.message); }
    );
}

// GPS 버튼 클릭 시 현위치로 이동
window.moveToGPS = function() {
    const btn = document.getElementById('locate-btn');
    if (btn) btn.style.opacity = '0.5';
    
    getAccurateLocation(
        (lat, lng, isFirst) => {
            placeGPSMarker(lat, lng);
            // 버튼 클릭 시에는 위치가 갱신될 때마다 더 정확한 곳으로 지도를 이동해줌
            const isMobile = window.innerWidth <= 768;
            map.setCenter(LL(isMobile ? lat - 0.0006 : lat, lng));
            map.setZoom(17);
        },
        () => { 
            if (btn) btn.style.opacity = '1'; 
        },
        (err) => {
            console.warn('GPS 오류:', err?.message);
            alert('현재 위치를 가져올 수 없습니다.\nWi-Fi를 켜시거나 위치 권한을 확인해주세요.');
            if (btn) btn.style.opacity = '1';
        },
        12000 // 수동 클릭 시에는 12초까지 대기하며 최고 정확도 찾기
    );
};

// ========== GPS 위치 권한 안내 배너 ==========
// init()에서 저장된 집/회사 위치도 없고 GPS도 못 받았을 때 보여줌.
function showGpsPermissionBanner() {
    const el = document.getElementById('gps-permission-banner');
    if (el) el.hidden = false;
}
window.dismissGpsPermissionBanner = function() {
    const el = document.getElementById('gps-permission-banner');
    if (el) el.hidden = true;
};
// 배너의 "다시 시도" — 권한을 허용한 뒤 다시 눌러보라는 용도. 성공하면
// 배너를 닫고 그 위치로 지도를 옮김(moveToGPS와 동일한 이동 로직).
window.retryLocationPermission = function() {
    getCurrentPositionOnce(8000).then((gps) => {
        if (!gps) return; // 여전히 실패 — 배너 유지
        // 방금 새로 허용받은 위치를 캐시에도 반영 — 이후 탭을 오가도 실패했던
        // 예전 결과(캐시) 대신 이 성공한 위치를 바로 재사용하게 함.
        window.__mapInitialGpsPromise = Promise.resolve(gps);
        window.dismissGpsPermissionBanner();
        placeGPSMarker(gps.lat, gps.lng);
        const isMobile = window.innerWidth <= 768;
        map.setCenter(LL(isMobile ? gps.lat - 0.0006 : gps.lat, gps.lng));
        map.setZoom(17);
    });
};

// ========== 한줄평 시스템 (파이어베이스 연동) ==========
const COOLDOWN_KEY = 'woody_review_cooldown';
const COOLDOWN_MS = 60000; // 1분 쿨타임
let currentDetailId = null;

// ----- 랜덤 닉네임 (형용사 + 명사) -----
// 닉네임 입력 부담을 줄이기 위한 기본값. 페이지를 새로고침할 때마다 다른
// 조합이 나오지만, 같은 세션 안에서 여러 식당에 리뷰를 남길 땐 같은
// 닉네임을 유지함(새로고침 전까진 안 바뀜). 직접 자기만의 닉네임으로
// 고쳐서 한 번 제출하면 그 값을 기억해뒀다가 다음 방문부터 계속 씀.
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
let nicknameIsRandomPlaceholder = false; // 지금 입력칸 값이 (아직 안 건드린) 랜덤값인지
let currentReviewNicknames = []; // 지금 열려있는 식당의 기존 리뷰 닉네임 목록 (겹침 체크용)

function getSessionRandomNickname() {
    if (!sessionRandomNickname) {
        const adj = NICK_ADJECTIVES[Math.floor(Math.random() * NICK_ADJECTIVES.length)];
        const noun = NICK_NOUNS[Math.floor(Math.random() * NICK_NOUNS.length)];
        sessionRandomNickname = `${adj} ${noun}`;
    }
    return sessionRandomNickname;
}

// 지금 열려있는 식당의 리뷰 목록(currentReviewNicknames) 안에서만 겹침을 검사.
// 앱 전체를 대상으로 하려면 제출할 때마다 Firestore 조회가 추가로 필요해서
// 비용이 드는데, 실제로 헷갈리는 상황은 "한 식당 리뷰 목록에 같은 닉네임
// 두 개"인 경우가 대부분이라 이미 불러와져 있는 이 목록만으로 충분함.
function dedupeNickname(nickname) {
    if (!currentReviewNicknames.includes(nickname)) return nickname;
    let n = 2;
    while (currentReviewNicknames.includes(`${nickname} ${n}`)) n++;
    return `${nickname} ${n}`;
}

// 식당 상세가 열릴 때마다 호출 — 저장된 내 닉네임이 있으면 그걸, 없으면
// 이번 세션의 랜덤 닉네임을 입력칸에 채워둠
function prefillReviewNickname() {
    const nickInput = document.getElementById('reviewNickname');
    if (!nickInput) return;
    const saved = localStorage.getItem(CUSTOM_NICK_KEY);
    if (saved) {
        nickInput.value = saved;
        nicknameIsRandomPlaceholder = false;
    } else {
        nickInput.value = getSessionRandomNickname();
        nicknameIsRandomPlaceholder = true;
    }
}

window.loadReviews = function(restaurantId) {
    currentDetailId = restaurantId;
    currentReviewNicknames = []; // 다른 식당으로 전환되는 동안 이전 목록이 남아있지 않도록 초기화
    const listEl = document.getElementById('reviewList');
    listEl.innerHTML = '<div class="review-empty">리뷰를 불러오는 중... ⏳</div>';

    if (unsubscribeReviews) { unsubscribeReviews(); }
    if (!db) { listEl.innerHTML = '<div class="review-empty">DB 연결 지연 중...</div>'; return; }

    const q = window.fsQuery(
        window.fsCollection(db, `restaurants/${restaurantId}/reviews`), 
        window.fsOrderBy('createdAt', 'desc'), 
        window.fsLimit(20)
    );
    
    unsubscribeReviews = window.fsOnSnapshot(q, (snapshot) => {
        if (currentDetailId !== restaurantId) return; // 뒤늦게 온 응답 무시

        // 닉네임 겹침 체크용으로, 지금 로드된 이 식당의 리뷰 닉네임들을 기억해둠
        currentReviewNicknames = snapshot.docs.map(d => d.data().nickname || '익명');

        if (snapshot.empty) {
            listEl.innerHTML = '<div class="review-empty">아직 한줄평이 없어요. 첫 번째 평가를 남겨 주세요! ✍️</div>';
            return;
        }

        let html = '';
        snapshot.forEach((doc) => {
            const rv = doc.data();
            const text = escapeHtml(rv.text || '');
            const nickname = escapeHtml(rv.nickname || '익명');

            let dateStr = '';
            if (rv.createdAt) {
                const date = rv.createdAt.toDate();
                dateStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }
            
            html += `
                <div class="review-item" style="flex-direction: column; gap: 4px;">
                    <div style="font-weight: 800; font-size: 0.8em; color: var(--main-blue);">${nickname}</div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; width: 100%;">
                        <div class="review-item-text" style="flex:1;">${text}</div>
                        <div class="review-item-date">${dateStr}</div>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;
    }, (error) => {
        console.error("Firebase fetch error:", error);
        listEl.innerHTML = '<div class="review-empty">리뷰를 불러오는 데 실패했습니다. 😢</div>';
    });
}

let unsubscribePopularity = null;
let popularityCountedThisSession = new Set(); // 새로고침 전까지 유지되는 세션 내 중복 방지용

window.loadPopularity = function(restaurantId) {
    const popEl = document.getElementById('detailPopularity');
    const countEl = document.getElementById('popularityCount');
    popEl.style.display = 'block';
    countEl.innerText = '...';
    
    if (unsubscribePopularity) { unsubscribePopularity(); }
    if (!db) return;

    const docRef = window.fsDoc(db, 'popularity', String(restaurantId));
    unsubscribePopularity = window.fsOnSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            countEl.innerText = docSnap.data().count || 0;
        } else {
            countEl.innerText = 0;
        }
    });
}

// 식당 상세를 열 때 호출 (호출부: popularityCountedThisSession으로 세션당 1회만 보장).
// 예전엔 인스타/카카오 링크 클릭 기준이었는데, 그 링크가 없는 식당(대부분의
// 그리드스윕 수집분)은 인기도를 영영 못 올리는 구조적 편향이 있어 이 방식으로 전환.
window.increasePopularity = async function(restaurantId) {
    if (!db) return;
    try {
        const docRef = window.fsDoc(db, 'popularity', String(restaurantId));
        await window.fsSetDoc(docRef, { count: window.fsIncrement(1) }, { merge: true });
    } catch (e) {
        console.error("Popularity update error: ", e);
    }
}

// PC에서 한줄평을 아주 짧은 시간 안에 여러 번 제출되는 버그가 있었음. 원인
// 두 가지: ① 쿨다운(COOLDOWN_KEY)은 Firestore 저장이 끝난 "뒤"에야
// localStorage에 기록되는데, 그 저장 자체가 비동기라 완료 전에 또 호출이
// 들어오면 쿨다운 체크를 그대로 통과해버림. ② Enter 키 리스너가
// document에 등록돼 있는데(맨 아래), 이 탭 스크립트는 탭을 오갈 때마다
// 통째로 재실행되면서 리스너가 지워지지 않고 계속 쌓여서, 세션 중 지도
// 탭을 여러 번 방문했으면 엔터 한 번에 그 방문 횟수만큼 submitReview()가
// 동시에 호출됨. isSubmittingReview 플래그로 ①을(비동기 저장이 끝나기
// 전엔 재진입 자체를 막음), 아래 keydown 리스너 쪽에서 제거 후 재등록으로
// ②를 해결함.
let isSubmittingReview = false;

window.submitReview = async function() {
    if (currentDetailId === null || !db) return;
    if (isSubmittingReview) return; // 앞선 제출이 아직 안 끝났으면 무시(중복 제출 방지)
    const input = document.getElementById('reviewInput');
    const nickInput = document.getElementById('reviewNickname');
    const text = input.value.trim();
    const nickname = nickInput.value.trim() || '익명';

    if (!text) return;
    if (text.length > 50) { alert('한줄평은 50자 이내로 작성해 주세요.'); return; }
    if (nickname.length > 10) { alert('닉네임은 10자 이내로 작성해 주세요.'); return; }

    const lastTime = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0');
    const now = Date.now();
    if (now - lastTime < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
        document.getElementById('reviewCooldownMsg').innerHTML = `<div class="review-cooldown-msg">⏳ ${remaining}초 후에 다시 작성할 수 있어요.</div>`;
        return;
    }

    // ⚠️ isSubmittingReview를 true로 바꾸는 시점부터 finally로 되돌리는
    // 시점 사이에서 뭐가 됐든 예외 없이 끝까지 지나가야 함 — 그 사이에서
    // 뭔가 던지면 플래그가 true로 눌러붙어서, 이 스크립트가 다음에 통째로
    // 재실행되기 전까지 계속 "이미 제출 중"으로 오인해 아무 것도 등록이
    // 안 되는 새 버그가 생김. dedupeNickname 호출도 반드시 try 안에서.
    isSubmittingReview = true;
    try {
        document.getElementById('reviewCooldownMsg').innerHTML = '<div style="font-size: 0.78em; color: var(--main-blue); margin-top: 4px;">등록 중... ✍️</div>';

        // 이 식당 리뷰 목록에 같은 닉네임이 이미 있으면 "닉네임 2"처럼 번호를 붙임.
        // 다음 방문을 위해 기억해두는 "내 닉네임"(customNickname)은 번호 붙기 전
        // 원본(nickname)으로 저장 — 번호는 이 식당 한정 표시용이라 저장할 필요 없음.
        const finalNickname = dedupeNickname(nickname);

        await window.fsAddDoc(window.fsCollection(db, `restaurants/${currentDetailId}/reviews`), {
            text: text,
            nickname: finalNickname,
            createdAt: window.fsServerTimestamp()
        });

        // 랭킹 탭에서 "전체" 기간 집계를 매번 리뷰를 전부 세지 않고 이 누적치만
        // 읽으면 되도록, 식당 문서에 리뷰 수를 같이 올려둠 (인기도 카운트와 동일한 패턴)
        try {
            await window.fsSetDoc(
                window.fsDoc(db, 'restaurants', String(currentDetailId)),
                { reviewCount: window.fsIncrement(1) },
                { merge: true }
            );
        } catch (e) {
            console.error('reviewCount 갱신 실패:', e);
        }

        localStorage.setItem(COOLDOWN_KEY, String(now));
        input.value = '';
        // 닉네임은 다음 작성 편의를 위해 초기화하지 않습니다

        // 랜덤으로 채워졌던 닉네임을 직접 고쳐서 제출했다면, 그걸 "내 닉네임"으로
        // 기억해뒀다가 다음 방문부턴 랜덤 대신 계속 이 닉네임을 씀
        if (nicknameIsRandomPlaceholder && nickname !== sessionRandomNickname) {
            localStorage.setItem(CUSTOM_NICK_KEY, nickname);
            nicknameIsRandomPlaceholder = false;
        } else if (!nicknameIsRandomPlaceholder && nickname !== localStorage.getItem(CUSTOM_NICK_KEY)) {
            // 이미 저장된 내 닉네임을 다시 고친 경우도 최신값으로 갱신
            localStorage.setItem(CUSTOM_NICK_KEY, nickname);
        }

        document.getElementById('reviewCooldownMsg').innerHTML = '';
    } catch (e) {
        console.error("Firebase addDoc error: ", e);
        document.getElementById('reviewCooldownMsg').innerHTML = `<div class="review-cooldown-msg">오류가 발생했습니다. 다시 시도해 주세요.</div>`;
    } finally {
        isSubmittingReview = false;
    }
}

// ========== 식당 정보 수정 제안 (기획서 11번) ==========
// 라이브 xlsx를 바로 건드리지 않고 restaurants/{id}/pendingEdits에 계속
// 쌓아두기만 함 — 운영자가 나중에 export-pending-edits.js로 모아 확인 후
// 반영(tools/clear-pending-edits.js로 정리). 한줄평과 같은 쿨다운 길이를
// 쓰되, 별도 키로 관리해 한줄평 작성과 서로 방해하지 않게 함.
//
// 평소엔 접혀 있다가 펼치면 가격/영업시간/URL/폐업 제보를 한 화면에서
// 다 채우고 제출 버튼 한 번으로 보내는 방식(항목마다 드롭다운을 새로
// 고르던 예전 방식 대신). 채워진 항목만 골라 각각 pendingEdits 문서로
// 저장 — export-pending-edits.js의 "식당×필드" 그룹핑 로직은 그대로
// 재사용 가능(문서 하나=필드 하나 구조는 안 바뀜).
const EDIT_COOLDOWN_KEY = 'woody_edit_cooldown';

window.toggleEditSuggest = function() {
    const body = document.getElementById('editSuggestBody');
    const label = document.getElementById('editSuggestLabel');
    const chevron = document.getElementById('editSuggestChevron');
    if (!body) return;
    const willOpen = body.hidden;
    body.hidden = !willOpen;
    if (label) label.textContent = willOpen ? '접기' : '펼치기';
    if (chevron) chevron.classList.toggle('open', willOpen);
};

// 영업 요일 칩(월~일) — 체크박스 없이 그냥 div를 직접 탭해서 .checked
// 클래스만 토글(다른 토글 버튼들과 동일한 방식).
window.onEditDayChipClick = function(el) {
    if (!el) return;
    el.classList.toggle('checked');
};

function getCheckedEditDays() {
    const list = document.getElementById('editDaysList');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.edit-day-chip.checked')).map(el => el.dataset.day);
}

// 대부분의 구내식당·한식뷔페가 평일에만 여는 경우가 많아, 매번 5번씩
// 체크하는 수고를 덜어주려고 월~금을 기본으로 체크해둠(토/일은 비움).
// 아닌 경우엔 직접 눌러서 조정하면 됨.
const DEFAULT_EDIT_DAYS = ['월', '화', '수', '목', '금'];
function applyDefaultEditDays() {
    const list = document.getElementById('editDaysList');
    if (!list) return;
    list.querySelectorAll('.edit-day-chip').forEach(el => {
        el.classList.toggle('checked', DEFAULT_EDIT_DAYS.includes(el.dataset.day));
    });
}

// 폐업 제보 체크박스를 켜야만 참고 메모 입력칸을 쓸 수 있게 함(체크 안
// 하면 비활성화 + 비움 — 실수로 메모만 채운 채 제출하는 걸 방지).
window.onEditClosedToggle = function() {
    const check = document.getElementById('editClosedCheck');
    const note = document.getElementById('editClosedNote');
    if (!check || !note) return;
    note.disabled = !check.checked;
    if (!check.checked) note.value = '';
};

function resetEditSuggestForm() {
    const body = document.getElementById('editSuggestBody');
    const label = document.getElementById('editSuggestLabel');
    const chevron = document.getElementById('editSuggestChevron');
    if (body) body.hidden = true;
    if (label) label.textContent = '펼치기';
    if (chevron) chevron.classList.remove('open');
    ['editPrice', 'editHours', 'editMenuUrl', 'editClosedNote'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    applyDefaultEditDays();
    const check = document.getElementById('editClosedCheck');
    if (check) check.checked = false;
    const note = document.getElementById('editClosedNote');
    if (note) note.disabled = true;
    document.getElementById('editCooldownMsg').innerHTML = '';
}

window.submitEditSuggestion = async function() {
    if (currentDetailId === null || !db) return;
    const msgEl = document.getElementById('editCooldownMsg');

    const priceVal = document.getElementById('editPrice').value.trim();
    const hoursVal = document.getElementById('editHours').value.trim();
    const daysVal = getCheckedEditDays(); // 월~일 순서대로 이미 DOM 순서 그대로 옴
    const menuUrlVal = document.getElementById('editMenuUrl').value.trim();
    const closedChecked = document.getElementById('editClosedCheck').checked;
    const closedNote = document.getElementById('editClosedNote').value.trim();

    // 채워진 항목만 골라 각각 하나의 제보로 취급 — 아무것도 안 채웠으면 제출 안 함
    const entries = [];
    if (priceVal) entries.push({ field: 'price', value: priceVal });
    if (hoursVal) entries.push({ field: 'hours', value: hoursVal });
    if (daysVal.length > 0) entries.push({ field: 'days', value: daysVal.join(',') });
    if (menuUrlVal) entries.push({ field: 'menuUrl', value: menuUrlVal });
    if (closedChecked) entries.push({ field: 'closed', value: closedNote || '폐업' });

    if (entries.length === 0) {
        msgEl.innerHTML = '<div class="review-cooldown-msg">수정할 내용을 하나 이상 입력해주세요.</div>';
        return;
    }
    if (entries.some(e => e.value.length > 150)) {
        alert('한 항목은 150자 이내로 작성해 주세요.');
        return;
    }

    const lastTime = parseInt(localStorage.getItem(EDIT_COOLDOWN_KEY) || '0');
    const now = Date.now();
    if (now - lastTime < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
        msgEl.innerHTML = `<div class="review-cooldown-msg">⏳ ${remaining}초 후에 다시 제출할 수 있어요.</div>`;
        return;
    }

    // 닉네임은 별도 입력칸을 새로 안 두고, 한줄평 닉네임란에 이미 적혀 있으면
    // 그 값을 그대로 재사용(선택 항목이라 비어 있어도 무방).
    const nickInput = document.getElementById('reviewNickname');
    const nickname = (nickInput && nickInput.value.trim()) ? nickInput.value.trim() : null;

    msgEl.innerHTML = '<div style="font-size:0.78em; color: var(--primary); margin-top:4px;">제출 중... ✏️</div>';

    try {
        for (const entry of entries) {
            const editDoc = { field: entry.field, value: entry.value, submittedAt: window.fsServerTimestamp() };
            if (nickname) editDoc.nickname = nickname;
            await window.fsAddDoc(window.fsCollection(db, `restaurants/${currentDetailId}/pendingEdits`), editDoc);
        }

        localStorage.setItem(EDIT_COOLDOWN_KEY, String(now));
        ['editPrice', 'editHours', 'editMenuUrl', 'editClosedNote'].forEach(id => {
            document.getElementById(id).value = '';
        });
        applyDefaultEditDays();
        document.getElementById('editClosedCheck').checked = false;
        document.getElementById('editClosedNote').disabled = true;
        msgEl.innerHTML = '<div class="review-cooldown-msg success">제출 완료! 확인 후 반영돼요. 감사합니다 🙏</div>';
        setTimeout(() => {
            if (msgEl.innerHTML.includes('제출 완료')) msgEl.innerHTML = '';
        }, 4000);
    } catch (e) {
        console.error('정보 수정 제안 addDoc error:', e);
        msgEl.innerHTML = `<div class="review-cooldown-msg">오류가 발생했습니다. 다시 시도해 주세요.</div>`;
    }
};

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Enter 키로 한줄평 등록. document에 붙는 리스너라 탭을 오갈 때마다(이
// 스크립트가 통째로 재실행될 때마다) 계속 새로 addEventListener하면 예전
// 리스너가 안 지워지고 쌓임 — 그러면 엔터 한 번에 쌓인 리스너 수만큼
// submitReview()가 한꺼번에 불려서 "짧은 시간에 여러 번 등록되는" 버그가
// 생김(game-tab.html/calorie-tab.html의 outside-click 리스너와 동일한
// 종류의 문제). 기존 리스너를 지우고 새로 등록해 항상 하나만 남게 함.
if (window.__reviewEnterKeyHandler) {
    document.removeEventListener('keydown', window.__reviewEnterKeyHandler);
}
window.__reviewEnterKeyHandler = function(e) {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'reviewInput') {
        e.preventDefault();
        submitReview();
    }
};
document.addEventListener('keydown', window.__reviewEnterKeyHandler);

init();
})();
