let currentTab = '';
function loadTab(tabName) {
    if (currentTab === tabName) return;

    const targetFile = tabName === 'favorite' ? 'map' : tabName;
    window.isFavoriteMode = (tabName === 'favorite');

    currentTab = tabName;
    document.body.setAttribute('data-tab', tabName);
    
    document.querySelectorAll('.tab-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabName);
    });

    // 탭이 바뀔 때마다 PC 화면의 리스트를 즉시 업데이트
    if (typeof window.plpFilterData === 'function') window.plpFilterData();

    // 맵이 이미 로드되어 있다면 HTML을 다시 받지 않고 모바일 뷰/마커 갱신만 수행
    const area = document.getElementById('content-area');
    if (targetFile === 'map' && area.querySelector('#map-container')) {
        if (typeof window.updateListAndMarkers === 'function') window.updateListAndMarkers();
        return;
    }

    const cacheBust = Date.now();
    fetch(`./${targetFile}-tab.html?v=${cacheBust}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.text();
        })
        .then(html => {
            const area = document.getElementById('content-area');

            // Live Server 등 dev tools 주입 코드 제거 (끝태그 뒤 잔여물 정리)
            const marker = '<' + '/script>';
            const lastClose = html.lastIndexOf(marker);
            if (lastClose !== -1) {
                html = html.substring(0, lastClose + marker.length);
            }

            // 각 탭이 계층 분리로 참조하는 css/js/*.css,*.js 파일에도 위와 같은
            // 캐시무효화 쿼리를 붙여줌 — 안 붙이면 이 파일들만 브라우저 캐시에
            // 걸려서, 나중에 css/js 내용을 고쳐도 재배포 후 사용자가 새로고침
            //해도 예전 버전이 계속 보일 수 있음(예전엔 전부 인라인이라 탭
            // html 자체의 cacheBust만으로 항상 최신이 보장됐었음).
            html = html.replace(/((?:href|src)=")((?:css|js)\/[^"?]+)(")/g, `$1$2?v=${cacheBust}$3`);

            area.innerHTML = html;
            
            // 스크립트 강제 실행 로직 (안전한 생성 방식)
            const scripts = area.querySelectorAll('script');
            scripts.forEach(oldScript => {
                const newScript = document.createElement('script');
                Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
                newScript.textContent = oldScript.textContent;
                document.body.appendChild(newScript);
                newScript.remove();
            });
        })
        .catch(err => {
            console.error('Error loading tab:', err);
            document.getElementById('content-area').innerHTML = 
                `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#ef4444; font-weight:700;">
                    탭을 불러오지 못했습니다. (경로 확인 필요)
                </div>`;
        });
}

document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', () => loadTab(item.dataset.tab));
});
window.addEventListener('load', () => loadTab('map'));

// ===== 식당 데이터(엑셀) 공용 로더 =====
// map-tab.html/calorie-tab.html/game-tab.html은 탭을 열 때마다 <script>가
// 강제로 새로 실행되기 때문에, 각 탭이 각자 fetch+XLSX 파싱을 따로 하면
// 탭을 오갈 때마다 매번 2~3MB 엑셀을 새로 받고 새로 파싱하게 됨(XLSX.read만
// 실측 150~260ms). window(= 탭을 옮겨도 안 사라지는 최상위 전역)에 파싱
// 결과를 딱 한 번만 캐싱해두고 모든 탭이 이 함수를 같이 쓰게 해서, 세션
// 동안은 첫 탭 진입 때 한 번만 받고 파싱하면 되도록 함.
// 같은 건물(도로명주소 좌표는 보통 건물 대표점 1개)에 식당이 여러 곳 입점해
// 있으면 좌표가 완전히 똑같아서 지도 마커가 정확히 같은 픽셀에 겹쳐 그려짐.
// 이러면 맨 위에 그려진(=클릭 리스너가 나중에 등록된) 마커만 클릭되고 그
// 아래 깔린 마커는 시각적으로만 보일 뿐 절대 선택이 안 되는 문제가 생김
// (예: "현한신아이티식당"/"백세식단연구소"가 동일 좌표에 겹쳐 있던 사례).
// 좌표가 정확히 같은 그룹을 찾아 아주 작은 반경(약 6~12m)의 원 위에 고르게
// 흩어놓아 전부 독립적으로 클릭 가능하게 함 — 주소 텍스트는 그대로 두고
// 지도 표시용 좌표만 살짝 조정하는 것이라 실제 위치 정확도에는 영향 없음.
function spreadOverlappingCoords(list) {
    const groups = new Map();
    list.forEach(r => {
        if (!r.lat || !r.lng) return;
        const key = r.lat.toFixed(6) + '_' + r.lng.toFixed(6);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    });
    groups.forEach(group => {
        if (group.length < 2) return;
        const n = group.length;
        const radiusM = 6 + Math.min(n, 6);
        group.forEach((r, i) => {
            const angle = (2 * Math.PI * i) / n;
            r.lat += (radiusM * Math.cos(angle)) / 111320;
            r.lng += (radiusM * Math.sin(angle)) / (111320 * Math.cos(r.lat * Math.PI / 180));
        });
    });
    return list;
}

window.__restaurantsDataPromise = null;
window.getRestaurantsData = function() {
    if (window.__restaurantsDataPromise) return window.__restaurantsDataPromise;
    window.__restaurantsDataPromise = (async () => {
        try {
            const res = await fetch(`./data/restaurants.xlsx?v=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP error! ${res.status}`);
            const arrayBuffer = await res.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            const headerMap = {
                'id': 'id', '이름': 'name', '지역': 'region', '주소': 'address',
                'lat': 'lat', 'lng': 'lng', '설명': 'description',
                '가격': 'price', '영업 시간': 'hours',
                '인스타': 'instagram', '카카오': 'kakaoChannel', '네이버': 'naverBlog',
                '노출여부': 'visibility'
            };
            const headers = rows[0].map(h => headerMap[String(h).trim()] || String(h).trim());

            const parsed = rows.slice(1)
                .map(row => { const obj = {}; headers.forEach((key, i) => { obj[key] = row[i]; }); return obj; })
                .filter(r => r.name && String(r.name).trim() !== '' && String(r.name).trim() !== 'Dev_Test')
                .map((r, index) => ({
                    id:           parseInt(r.id) || (index + 1),
                    name:         String(r.name).trim(),
                    region:       r.region && String(r.region).trim() !== '' ? String(r.region).trim() : '미지정',
                    address:      r.address ? String(r.address).trim() : '',
                    lat:          parseFloat(r.lat) || 0,
                    lng:          parseFloat(r.lng) || 0,
                    description:  r.description && String(r.description).trim() !== '' ? String(r.description).trim() : '',
                    price:        parseInt(r.price) || 0,
                    hours:        r.hours ? String(r.hours).trim() : '',
                    instagram:    (r.instagram && String(r.instagram).trim() !== '' && String(r.instagram).trim().toLowerCase() !== 'null') ? String(r.instagram).trim() : null,
                    kakaoChannel: (r.kakaoChannel && String(r.kakaoChannel).trim() !== '' && String(r.kakaoChannel).trim().toLowerCase() !== 'null') ? String(r.kakaoChannel).trim() : null,
                    naverBlog:    (r.naverBlog && String(r.naverBlog).trim() !== '' && String(r.naverBlog).trim().toLowerCase() !== 'null') ? String(r.naverBlog).trim() : null,
                    visibility:   r.visibility ? String(r.visibility).trim() : ''
                }))
                // 공공기관 구내식당 중 외부인 이용 불가/미확인 항목은 노출하지 않음 (id 부여 이후 필터해 위치기반 id 유지)
                .filter(r => !(r.visibility.startsWith('비공개') || r.visibility.startsWith('확인필요')));
            return spreadOverlappingCoords(parsed);
        } catch (e) {
            // 실패한 프로미스를 그대로 캐싱해두면 이후 어떤 탭에서도 영영 재시도가
            // 안 되므로, 실패 시엔 캐시를 비워 다음 호출이 새로 fetch를 시도하게 함
            window.__restaurantsDataPromise = null;
            throw e;
        }
    })();
    return window.__restaurantsDataPromise;
};

// ===== PC 영구 패널: 식당 데이터 로딩 및 필터 =====
(function() {
    window.plpRestaurantsData = [];

    // 거리순 정렬용 — assets/js/shared.js의 공용 함수 재사용(예전엔 각 탭마다
    // 똑같은 공식이 중복 정의돼 있었음)
    const plpGetDistanceKm = window.getDistanceKm;

    async function plpLoadData() {
        try {
            window.plpRestaurantsData = await window.getRestaurantsData();

            const regions = [...new Set(window.plpRestaurantsData.map(r => r.region))].filter(r => r && r !== '미지정').sort();
            const regionSelect = document.getElementById('plpRegionFilter');
            regionSelect.innerHTML = '<option value="all">지역 전체</option>';
            regions.forEach(rg => {
                const opt = document.createElement('option');
                opt.value = rg; opt.text = rg;
                regionSelect.appendChild(opt);
            });
            if (window.plpRestaurantsData.some(r => r.region === '미지정')) {
                const opt = document.createElement('option');
                opt.value = '미지정'; opt.text = '미지정';
                regionSelect.appendChild(opt);
            }

            plpFilterData();
        } catch(e) {
            console.error('PLP data load error:', e);
            document.getElementById('plpRestaurantCards').innerHTML =
                '<div style="padding:20px; text-align:center; color:#ef4444; font-size:0.9em; font-weight:700;">데이터를 불러오지 못했습니다.<br>새로고침 해주세요.</div>';
        }
    }

    const PLP_LIST_RENDER_LIMIT = 200; // map-tab.html의 LIST_RENDER_LIMIT와 동일 취지

    window.plpFilterData = function() {
        // 모바일에서는 #persistent-left-panel 자체가 display:none이라 이 함수가
        // 만드는 목록을 아무도 못 보는데도, 탭을 바꿀 때마다(loadTab에서 무조건
        // 호출) 5천 건 넘는 전체 데이터를 필터+정렬+DOM 렌더링하고 있었음 — 탭
        // 전환/상세팝업 열고닫기마다 100ms 이상씩 버벅이던 원인 중 하나.
        // 패널이 실제로 안 보이면(오프스크린 아님, display:none) 계산 자체를 건너뜀.
        const panel = document.getElementById('persistent-left-panel');
        if (panel && panel.offsetParent === null) return;

        const q = document.getElementById('plpSearchInput').value.toLowerCase();
        const rFilter = document.getElementById('plpRegionFilter').value;
        const dinnerToggle = document.getElementById('plpDinnerToggle');
        const isD = dinnerToggle ? dinnerToggle.classList.contains('active') : false;
        const sortToggle = document.getElementById('plpSortToggle');
        const isPopSort = sortToggle ? sortToggle.classList.contains('active') : false;

        let filtered = window.plpRestaurantsData.filter(r => {
            const mQ = r.name.toLowerCase().includes(q);
            const mR = rFilter === 'all' || r.region === rFilter;
            const mD = !isD || (r.hours.includes('석식') || /17:|18:|19:/.test(r.hours));
            const mF = !window.isFavoriteMode || window.getFavorites().includes(r.id);
            return mQ && mR && mD && mF;
        });

        if (isPopSort && window.popularityData) {
            filtered.sort((a, b) => {
                const popA = window.popularityData[a.id] || 0;
                const popB = window.popularityData[b.id] || 0;
                return popB - popA;
            });
        } else {
            // 기본 정렬: 거리순. 기준점은 GPS 우선(지도 탭에서 미러링됨), 없으면 회사(점심 기준지) 저장 위치, 그것도 없으면 집 위치.
            const savedCompanyLoc = localStorage.getItem('woody_company_loc') ? JSON.parse(localStorage.getItem('woody_company_loc')) : null;
            const savedHomeLoc = localStorage.getItem('woody_home_loc') ? JSON.parse(localStorage.getItem('woody_home_loc')) : null;
            const refLoc = (window.currentGPSLat != null && window.currentGPSLng != null)
                ? { lat: window.currentGPSLat, lng: window.currentGPSLng }
                : (savedCompanyLoc || savedHomeLoc || null);
            if (refLoc) {
                filtered.sort((a, b) =>
                    plpGetDistanceKm(refLoc.lat, refLoc.lng, a.lat, a.lng) -
                    plpGetDistanceKm(refLoc.lat, refLoc.lng, b.lat, b.lng)
                );
            }
        }

        // 카드는 상위 N개만 그려서(정렬은 이미 위에서 전체 기준으로 끝난 상태)
        // 필터링 결과가 많아도 매번 DOM 렌더링 부담이 늘어나지 않게 함.
        const listItems = filtered.slice(0, PLP_LIST_RENDER_LIMIT);

        document.getElementById('plpRestaurantCards').innerHTML = listItems.map((r, index) => {
            const isDinner = r.hours.includes('석식') || /17:|18:|19:/.test(r.hours);
            const popCount = (window.popularityData && window.popularityData[r.id]) || 0;

            const favs = window.getFavorites();
            const isFav = favs.includes(r.id);
            const favIcon = isFav ? '<span style="display:inline-block; width:22px; text-align:center; color:#FBBF24;">⭐</span>' : '<span style="display:inline-block; width:22px; text-align:center; opacity:0.35; filter: grayscale(1);">⭐</span>';

            let rankIcon = '';
            let popHtml = '';
            if (isPopSort && popCount > 0) {
                if (index === 0) rankIcon = '🥇 ';
                else if (index === 1) rankIcon = '🥈 ';
                else if (index === 2) rankIcon = '🥉 ';
                popHtml = `<span style="font-size:0.8em; color:var(--primary); font-weight:800; margin-left:8px;">🔥 ${popCount}</span>`;
            }

            return `
            <div class="restaurant-card ${window.plpSelectedId === r.id ? 'selected-card' : ''}" onclick="plpSelectRestaurant(${r.id})">
                <div style="font-weight:800; font-size:1em; color:var(--text-primary); margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                    <span>${rankIcon}${r.name}</span>
                    <div>
                        ${popHtml}
                        <span style="cursor:pointer; font-size:1.15em; margin-left:6px;" onclick="window.toggleFavorite(event, ${r.id})" title="즐겨찾기">${favIcon}</span>
                    </div>
                </div>
                <div style="font-size:0.85em; color:var(--text-secondary); display:flex; align-items:center;">
                    <span style="background:var(--border-dark); padding:3px 8px; border-radius:8px; margin-right:6px;">💳 ${r.price ? r.price.toLocaleString() + '원' : '-'}</span>
                    ${isDinner ? '<span class="dinner-badge">🌙 석식 가능</span>' : ''}
                </div>
            </div>`;
        }).join('') + (filtered.length > PLP_LIST_RENDER_LIMIT
            ? `<div style="padding:14px; text-align:center; font-size:0.8em; color:var(--text-secondary);">그 외 ${(filtered.length - PLP_LIST_RENDER_LIMIT).toLocaleString()}곳 더 있어요 — 검색이나 지역 필터로 좁혀보세요</div>`
            : '');
    };

    const PLP_ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3.3 0-6 2.7-6 6 0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6Z"/><circle cx="12" cy="9" r="2.2"/></svg>';
    const PLP_ICON_FLAME = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.2 2.6-1.6 3.8-1.6 6.6a3.6 3.6 0 0 0 7.2 0c0-.9-.4-1.7-.9-2.5.9 0 1.8 1.7 1.8 4.4a6.3 6.3 0 1 1-12.6 0c0-3.6 2.7-5.4 3.6-8.1.4.9.9 1.8 2.5 0Z"/></svg>';

    window.plpToggleDinner = function() {
        const b = document.getElementById('plpDinnerToggle');
        b.classList.toggle('active');
        if (b.classList.contains('active')) {
            b.style.background = 'var(--primary)';
            b.style.color = '#fff';
            b.style.borderColor = 'var(--primary)';
        } else {
            b.style.background = 'var(--bg-surface)';
            b.style.color = 'var(--text-primary)';
            b.style.borderColor = 'var(--border-light)';
        }
        plpFilterData();
    };

    window.plpToggleSort = function() {
        const b = document.getElementById('plpSortToggle');
        b.classList.toggle('active');
        if (b.classList.contains('active')) {
            b.style.background = 'var(--primary)';
            b.style.color = '#fff';
            b.style.borderColor = 'var(--primary)';
            b.innerHTML = PLP_ICON_FLAME + '인기순';
        } else {
            b.style.background = 'var(--bg-surface)';
            b.style.color = 'var(--text-primary)';
            b.style.borderColor = 'var(--border-light)';
            b.innerHTML = PLP_ICON_PIN + '거리순';
        }
        plpFilterData();
    };

    // 식당 클릭 시: 지도 탭이 활성이면 selectRestaurant 호출, 다른 탭은 폈팅 팝업 표시
    window.plpSelectRestaurant = function(id) {
        window.plpSelectedId = id;
        plpFilterData(); // 선택 UI 갱신

        if ((currentTab === 'map' || currentTab === 'favorite') && typeof window.selectRestaurant === 'function') {
            window.selectRestaurant(id);
        } else {
            plpShowPopup(id);
        }
    };

    window.plpClearSelection = function() {
        window.plpSelectedId = null;
        plpFilterData(); // 선택 해제 UI 갱신
    };

    window.plpMoveToGPS = function() {
        if (currentTab === 'map' && typeof window.moveToGPS === 'function') {
            window.moveToGPS();
        } else {
            window._pendingAction = 'gps';
            loadTab('map');
        }
    };

    window.plpGoHome = function() {
        if (currentTab === 'map' && typeof window.goHome === 'function') {
            window.goHome();
        } else {
            window._pendingAction = 'home';
            loadTab('map');
        }
    };

    let plpPopupCurrentId = null;

    function plpShowPopup(id) {
        const isPopupOpen = document.getElementById('plp-detail-popup').classList.contains('open');
        if (plpPopupCurrentId === id && isPopupOpen) {
            window.plpClosePopup();
            return;
        }

        const r = window.plpRestaurantsData.find(x => x.id === id);
        if (!r) return;
        plpPopupCurrentId = id;

        document.getElementById('plp-popup-name').innerText = r.name;

        const descEl = document.getElementById('plp-popup-desc');
        descEl.innerText = r.description || '';
        descEl.style.display = r.description ? 'block' : 'none';

        let formattedHours = r.hours || '정보 없음';
        formattedHours = formattedHours.replace(/, /g, '<br>').replace(/,/g, '<br>');
        document.getElementById('plp-popup-hours').innerHTML = formattedHours;
        document.getElementById('plp-popup-price').innerText = r.price ? `${r.price.toLocaleString()}원` : '-';

        let snsHtml = '';
        if (r.instagram) snsHtml += `<a href="${r.instagram}" target="_blank" class="insta-btn" onclick="if(window.increasePopularity) window.increasePopularity(${r.id})">📸 인스타그램</a>`;
        if (r.kakaoChannel) snsHtml += `<a href="${r.kakaoChannel}" target="_blank" class="kakao-btn" onclick="if(window.increasePopularity) window.increasePopularity(${r.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="#3C1E1E"><path d="M12 3c-6.627 0-12 4.254-12 9.5 0 3.321 2.161 6.248 5.5 7.91l-1.13 4.144c-.066.241.02.5.213.655a.575.575 0 0 0 .341.111c.119 0 .237-.036.338-.107l4.908-3.414c.6.066 1.21.101 1.83.101 6.627 0 12-4.254 12-9.5S18.627 3 12 3z"/></svg> 카톡 채널</a>`;
        if (r.naverBlog) snsHtml += `<a href="${r.naverBlog}" target="_blank" class="naver-btn" onclick="if(window.increasePopularity) window.increasePopularity(${r.id})"><svg width="15" height="15" viewBox="0 0 24 24"><path d="M4 4.5C4 3.67 4.67 3 5.5 3h9.6c.36 0 .7.14.96.38l3.9 3.62c.28.26.44.63.44 1.02V19.5c0 .83-.67 1.5-1.5 1.5h-13C4.67 21 4 20.33 4 19.5v-15Z" fill="#fff"/><path d="M14.6 3.2v3.6c0 .77.63 1.4 1.4 1.4h3.7" fill="none" stroke="#03C75A" stroke-width="1.1"/><rect x="7" y="12" width="10" height="1.6" rx="0.8" fill="#03C75A"/><rect x="7" y="15.4" width="7" height="1.6" rx="0.8" fill="#03C75A"/></svg> 블로그</a>`;
        const snsEl = document.getElementById('plp-popup-sns');
        snsEl.innerHTML = snsHtml;
        snsEl.style.display = snsHtml ? 'flex' : 'none';

        document.getElementById('plp-detail-popup').classList.add('open');
        document.getElementById('plp-detail-overlay').classList.add('open');
    }

    window.plpClosePopup = function() {
        document.getElementById('plp-detail-popup').classList.remove('open');
        document.getElementById('plp-detail-overlay').classList.remove('open');
        plpPopupCurrentId = null;
    };

    // 팝업에서 '지도에서 보기' 버튼 클릭 시 지도 탭으로 이동 + 선택
    window.plpGoToMap = function() {
        if (plpPopupCurrentId === null) return;
        const id = plpPopupCurrentId;
        plpClosePopup();
        if (currentTab === 'map' && typeof window.selectRestaurant === 'function') {
            window.selectRestaurant(id);
        } else {
            window._pendingSelectId = id;
            loadTab('map');
        }
    };

    // 왼쪽 고정 패널(PC 메인 메뉴)의 집/회사 버튼: map-tab.html의 홈 버튼과 같은
    // 방식(getSmartHomeDest/updateHomeBtn)으로 실시간 GPS(window.currentGPSLat/Lng,
    // 지도 탭에서 GPS를 잡을 때마다 미러링됨) 기준 집/회사 중 더 가까운 쪽 아이콘을
    // 보여줌. 지도 탭 안의 home-btn엔 이 전환 로직이 이미 있었는데, 이 왼쪽 패널
    // 버튼은 애초에 정적 🏠로만 박혀 있어서 회사 근처에 있어도 계속 집 아이콘만
    // 나오던 게 원인이었음 — map-tab.html의 placeGPSMarker()에서 GPS를 갱신할
    // 때마다 이 함수도 같이 호출하도록 연결(아래 window.updatePlpHomeBtn 참고).
    window.updatePlpHomeBtn = function() {
        const btn = document.getElementById('plp-home-btn');
        if (!btn) return;
        const savedHomeLoc = localStorage.getItem('woody_home_loc') ? JSON.parse(localStorage.getItem('woody_home_loc')) : null;
        const savedCompanyLoc = localStorage.getItem('woody_company_loc') ? JSON.parse(localStorage.getItem('woody_company_loc')) : null;

        let showCompany = false;
        if (window.currentGPSLat != null && window.currentGPSLng != null) {
            const distHome = savedHomeLoc
                ? plpGetDistanceKm(window.currentGPSLat, window.currentGPSLng, savedHomeLoc.lat, savedHomeLoc.lng)
                : Infinity;
            const distCompany = savedCompanyLoc
                ? plpGetDistanceKm(window.currentGPSLat, window.currentGPSLng, savedCompanyLoc.lat, savedCompanyLoc.lng)
                : Infinity;
            showCompany = distCompany < distHome;
        }
        const houseIcon = '<svg viewBox="0 0 24 24"><path d="M12 3 L20 11 L4 11 Z" fill="#fff"/><rect x="5" y="10.5" width="14" height="10.5" fill="#fff"/><rect x="15" y="2.2" width="2.2" height="5.3" rx="0.3" fill="#fff"/><rect x="7.6" y="13" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/><rect x="13.6" y="13" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/><rect x="7.6" y="17" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/><rect x="13.6" y="17" width="2.8" height="2.8" rx="0.4" fill="var(--primary)"/></svg>';
        const buildingIcon = '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="1.5" fill="#fff"/><rect x="7.7" y="6.4" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="13.7" y="6.4" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="7.7" y="10" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="13.7" y="10" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="7.7" y="13.6" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="13.7" y="13.6" width="2.6" height="2.6" rx="0.4" fill="var(--primary)"/><rect x="10" y="17.2" width="4" height="3.3" rx="0.6" fill="var(--primary)"/></svg>';
        btn.innerHTML = showCompany ? buildingIcon : houseIcon;
    };

    const isMobile = () => window.innerWidth <= 768;
    if (!isMobile()) {
        plpLoadData();
        window.updatePlpHomeBtn();
    }
})();

// 탭 바뀔 때 다크모드 적용 스크립트 실행을 위해 전역 변수로 노출
window.applyAppTheme = function() {
    const theme = localStorage.getItem('woody_app_theme') || 'default';
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
};

// 로고 클릭 시 테마 전환 함수
window.toggleThemeManually = function() {
    const currentTheme = localStorage.getItem('woody_app_theme') || 'default';
    const newTheme = currentTheme === 'dark' ? 'default' : 'dark';
    
    // 1. 앱 전체 테마 (index.html, 각 탭 UI)
    localStorage.setItem('woody_app_theme', newTheme);
    window.applyAppTheme();
    
    // 2. 지도 자체 테마 (map-tab.html 안의 지도 타일)
    // 0: 기본맵, 2: 다크맵
    localStorage.setItem('woody_map_theme', newTheme === 'dark' ? '2' : '0');
    
    // iframe 내부 지도 등도 테마가 즉시 적용되도록 페이지 전체 새로고침
    location.reload();
};

// 전역 즐겨찾기 로직
window.getFavorites = function() {
    try {
        return JSON.parse(localStorage.getItem('woody_favorites') || '[]');
    } catch { return []; }
};

window.toggleFavorite = function(e, id) {
    if(e) e.stopPropagation();
    let favs = window.getFavorites();
    if(favs.includes(id)) {
        favs = favs.filter(f => f !== id);
    } else {
        favs.push(id);
    }
    localStorage.setItem('woody_favorites', JSON.stringify(favs));
    
    // PC 화면 목록 새로고침 (별 즉시 업데이트)
    if(typeof window.plpFilterData === 'function') window.plpFilterData();
    
    // 모바일 지도 화면 목록 새로고침 (별 즉시 업데이트)
    if(typeof window.updateListAndMarkers === 'function') window.updateListAndMarkers();
};

// ✅ 광고 롤링 시스템 (10초마다 슬라이드 전환)
(function() {
    // Image/Ads/ 폴더에 실제로 들어있는 이미지 개수. 예전엔 다음 번호 이미지가
    // 있는지 매번 요청해보고 없으면(404) 처음으로 되돌아가는 방식이라, 마지막
    // 장 다음엔 항상 한 번씩 실패하는 요청이 나가고 콘솔에 에러가 쌓였음.
    // 개수를 알고 있으니 애초에 그 요청 자체를 안 하도록 함.
    const AD_COUNT = 6;
    let adIndex = 1;
    const mobileBg = document.querySelector('#mobile-ad-banner .ad-blur-bg');
    const mobileMain = document.querySelector('#mobile-ad-banner .ad-main-img');
    const pcBg = document.querySelector('#pc-ad-banner .ad-blur-bg');
    const pcMain = document.querySelector('#pc-ad-banner .ad-main-img');

    function updateAds(indexStr) {
        const src = `Image/Ads/ad${indexStr}.jpg`;
        const elements = [mobileBg, mobileMain, pcBg, pcMain].filter(Boolean);

        // 1. 왼쪽으로 슬라이드하며 페이드아웃
        elements.forEach(el => {
            el.style.transition = "opacity 0.4s ease-in, transform 0.4s ease-in";
            el.style.opacity = "0";
            el.style.transform = el.classList.contains('ad-blur-bg') 
                ? "scale(1.1) translateX(-30px)" 
                : "translateX(-30px)";
        });

        // 2. 0.4초 후 소스 변경 및 오른쪽에서 슬라이드인 준비
        setTimeout(() => {
            elements.forEach(el => {
                el.src = src;
                el.style.transition = "none";
                el.style.transform = el.classList.contains('ad-blur-bg') 
                    ? "scale(1.1) translateX(30px)" 
                    : "translateX(30px)";
            });

            // 강제 리플로우 (브라우저가 위치 변경을 인식하게 함)
            void mobileBg.offsetWidth;

            // 3. 다시 가운데로 슬라이드하며 페이드인
            elements.forEach(el => {
                el.style.transition = "opacity 0.4s ease-out, transform 0.4s ease-out";
                el.style.opacity = "1";
                el.style.transform = el.classList.contains('ad-blur-bg') 
                    ? "scale(1.1) translateX(0)" 
                    : "translateX(0)";
            });
        }, 400);
    }

    setInterval(() => {
        adIndex = adIndex < AD_COUNT ? adIndex + 1 : 1;
        const indexStr = adIndex < 10 ? '0' + adIndex : String(adIndex);
        updateAds(indexStr);
    }, 10000);
})();
// --------------------------------------------------

// 초기 로드 시 테마 적용
window.applyAppTheme();
