(function() {

const NOTICES = [
    {
        id: 6,
        title: "v2.0 업데이트: 랭킹·피드 탭 신설 및 대규모 개편 🏆",
        date: "2026-09-06",
        version: "v2.0",
        preview: "AI 렌즈가 랭킹·피드 탭으로 바뀌고, 점심 룰렛이 실제 데이터 기반으로 새로워졌습니다.",
        changes: [
            { icon: "🏆", text: "AI 렌즈 탭을 랭킹·피드 탭으로 전면 교체 — 인기 맛집 랭킹과 한줄평 피드를 한눈에" },
            { icon: "📍", text: "랭킹 탭에 지역 검색 기능 추가, 현재 위치 기준 자동 선택 지원" },
            { icon: "🎰", text: "점심 룰렛을 실제 맛집 데이터와 연결 — 자동 배치 버튼 또는 휠을 직접 탭해 원하는 가게 입력 가능" },
            { icon: "🗑️", text: "특정 사무실 구조에 맞춰져 있던 커피 룰렛 기능 정리" },
            { icon: "🚀", text: "탭 전환, 지도 마커 이동, 상세정보 열고닫기 속도 개선 — 버벅임 대폭 감소" },
            { icon: "🎨", text: "브랜드명을 \"맛쩜\"으로 변경, 로고와 아이콘도 새롭게 단장" },
            { icon: "🔒", text: "개인정보처리방침 페이지 신설 (설정 탭에서 확인 가능)" },
            { icon: "📖", text: "\"서비스 소개\" 화면 추가" },
            { icon: "📍", text: "지도 마커가 겹쳐서 일부 식당이 안 눌리던 문제 수정" },
            { icon: "🎯", text: "점심 룰렛 자동 배치가 진짜 내 현재 위치 기준으로 동작하도록 수정" },
            { icon: "🏠", text: "왼쪽 메뉴 집/회사 아이콘이 실제 위치에 따라 정확히 표시되도록 수정, 삭제 기능 추가" },
            { icon: "🧭", text: "지도 첫 화면이 내 현재 위치에서 시작하도록 개선" },
            { icon: "✏️", text: "식당 상세정보에서 영업시간·가격·식단표 정보를 직접 제보할 수 있는 기능 추가" },
            { icon: "🧹", text: "주소·이름이 거의 같아 중복으로 보이던 식당 정리" }
        ]
    },
    {
        id: 5,
        title: "v1.4 업데이트: 대규모 편의 기능 추가 및 UI 개선 🎉",
        date: "2026-07-12",
        version: "v1.4",
        preview: "지하철 노선도, 음식점 인기도, 즐겨찾기 등 새로운 기능들과 함께 UI가 대폭 개선되었습니다.",
        changes: [
            { icon: "🎨", text: "메인 화면 UI 디자인 개선 및 사용성 강화" },
            { icon: "🚇", text: "지도 화면 내 지하철 노선도 표시 기능 추가" },
            { icon: "🔥", text: "실시간 인기 맛집을 한눈에! 음식점 인기도 지표 추가" },
            { icon: "⭐", text: "나만의 맛집 리스트를 만들 수 있는 즐겨찾기 기능 도입" },
            { icon: "🚀", text: "부드러운 앱 사용을 위한 전반적인 로딩 최적화 및 성능 개선" },
            { icon: "🍽️", text: "금천구 및 영등포구 지역의 새로운 맛집 데이터 추가" }
        ]
    },
    {
        id: 4,
        title: "v1.3 업데이트: PC 사용성 개선 및 화면 최적화 🚀",
        date: "2026-07-05",
        version: "v1.3",
        preview: "PC 환경에서의 식당 목록 유지 및 정보 표시 방식이 개선되었습니다.",
        changes: [
            { icon: "💻", text: "PC 환경에서 탭을 변경해도 왼쪽 식당 목록이 유지되도록 개선" },
            { icon: "🪟", text: "지도 홈 이외의 탭에서 식당 클릭 시 지도 이동 없이 팝업으로 상세 정보 제공" },
            { icon: "🕒", text: "영업시간 표시를 중식/석식으로 나누어 보기 쉽게 세로 정렬" },
            { icon: "✨", text: "식당 상세 설명이 없을 경우 불필요한 공백을 제거하여 UI를 깔끔하게 정돈" },
            { icon: "🗑️", text: "사용성을 고려하여 불필요한 가격별 필터 기능 제거" }
        ]
    },
    {
        id: 3,
        title: "v1.2 업데이트: 내 위치와 자주 가는 장소 맞춤 기능 강화! 🏠",
        date: "2026-04-01",
        version: "v1.2",
        preview: "GPS 기반 내 위치 확인 및 자주 가는 장소(집/회사) 설정 기능이 추가되었습니다.",
        changes: [
            { icon: "🏠", text: "자주 가는 장소(집/회사) 직접 설정 및 핀 고정 기능 추가" },
            { icon: "🎯", text: "정밀한 위치 지정을 위한 십자선 마커 및 지도 이동 모드 도입" },
            { icon: "🏢", text: "현재 위치에 따라 집/회사로 변하는 스마트 '홈' 버튼" },
            { icon: "🔵", text: "실시간 GPS 기반 현재 위치 확인 및 전용 이동 버튼 추가" }
        ]
    },
    {
        id: 2,
        title: "사용 경험 개선 업데이트 ✨",
        date: "2026-04-01",
        version: "v1.1",
        preview: "설정 화면 등 UI/UX가 개선되었습니다.",
        changes: [
            { icon: "🎨", text: "앱 테마 일관성에 맞춘 설정 탭 디자인 개편" },
            { icon: "📖", text: "기능 설명을 위한 사용 방법 안내 메뉴 고도화" },
            { icon: "✨", text: "AI 렌즈 영양 분석 설명란 추가" }
        ]
    },
    {
        id: 1,
        title: "Woody-Table 서비스 시작 🎉",
        date: "2026-03-13",
        version: "v1.0",
        preview: "Woody-Table이 오픈했습니다!",
        changes: [
            { icon: "🗺️", text: "지도 기반 구내식당 정보 서비스 오픈" },
            { icon: "🤖", text: "AI 렌즈 기능 - 음식 사진으로 칼로리 분석" },
            { icon: "🎰", text: "점심 룰렛 - 오늘 뭐 먹을지 고민 해결" },
            { icon: "💬", text: "음식점별 한줄평 남기기 기능" },
        ]
    }
];

const SCREENS = ['main', 'notice', 'notice-detail', 'inquiry', 'howto', 'system', 'favorite-places', 'locsearch', 'about', 'privacy', 'sources'];

window.showScreen = function(name) {
    SCREENS.forEach(s => {
        const el = document.getElementById(`screen-${s}`);
        if (!el) return;
        if (s === name) {
            el.style.cssText = '';
            if (s !== 'main') el.classList.add('active');
            else el.style.display = 'block';
        } else {
            if (s !== 'main') { el.classList.remove('active'); el.style.display = ''; }
            else el.style.display = 'none';
        }
    });

    if (name === 'notice') renderNoticeList();
    if (name === 'inquiry' && currentInqTab === 'list') loadInquiries();
    if (name === 'system') {
        updateAppThemeUI();
    }
    if (name === 'favorite-places') updateFavoritePlacesUI();
};

// ===== 위치 검색 시스템 =====
let targetLocMode = 'home';
window.openLocationSearch = function(mode) {
    targetLocMode = mode;
    document.getElementById('locsearch-title').innerText = mode === 'home' ? '🏠 집 위치 설정' : '🏢 회사 위치 설정';
    document.getElementById('loc-search-input').value = '';
    document.getElementById('loc-search-results').innerHTML = '';
    showScreen('locsearch');
};

// "자주 가는 장소 설정" 화면의 집/회사 행에 등록 여부를 표시하고, 등록돼
// 있을 때만 삭제 버튼을 보여줌.
function updateFavoritePlacesUI() {
    const homeSub = document.getElementById('homeLocSub');
    const homeDel = document.getElementById('homeLocDeleteBtn');
    const hasHome = !!localStorage.getItem('woody_home_loc');
    if (homeSub) homeSub.textContent = hasHome ? '등록됨 · 탭하면 다시 지정' : '미등록';
    if (homeDel) homeDel.hidden = !hasHome;

    const companySub = document.getElementById('companyLocSub');
    const companyDel = document.getElementById('companyLocDeleteBtn');
    const hasCompany = !!localStorage.getItem('woody_company_loc');
    if (companySub) companySub.textContent = hasCompany ? '등록됨 · 탭하면 다시 지정' : '미등록';
    if (companyDel) companyDel.hidden = !hasCompany;
}

// 저장된 집/회사 위치 삭제. 지도 탭의 마커/거리순 정렬은 localStorage를 매번
// 새로 읽으므로 다음 진입 때 자동으로 반영되고, 왼쪽 고정 패널(index.html)의
// 집/회사 아이콘과 거리순 정렬은 즉시 갱신해줌.
window.deleteSavedLocation = function(mode) {
    const label = mode === 'home' ? '집' : '회사';
    if (!confirm(`저장된 ${label} 위치를 삭제할까요?`)) return;
    localStorage.removeItem(mode === 'home' ? 'woody_home_loc' : 'woody_company_loc');
    updateFavoritePlacesUI();
    if (typeof window.updatePlpHomeBtn === 'function') window.updatePlpHomeBtn();
    if (typeof window.plpFilterData === 'function') window.plpFilterData();
};

window.searchLocation = function() {
    const query = document.getElementById('loc-search-input').value.trim();
    if (!query) return;

    const resEl = document.getElementById('loc-search-results');
    resEl.innerHTML = '<div style="color:var(--settings-sub); font-size:0.85em; text-align:center;">검색 중... ⏳</div>';

    if (!window.naver || !naver.maps || !naver.maps.Service) {
        resEl.innerHTML = '<div style="color:#ef4444; font-size:0.85em; text-align:center;">지도 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.</div>';
        return;
    }

    naver.maps.Service.geocode({ query }, function(status, response) {
        if (status !== naver.maps.Service.Status.OK) {
            resEl.innerHTML = '<div style="color:#ef4444; font-size:0.85em; text-align:center;">검색 중 오류가 발생했습니다.</div>';
            return;
        }

        const items = response.v2.addresses;
        if (!items || items.length === 0) {
            resEl.innerHTML = '<div style="color:#ef4444; font-size:0.85em; text-align:center;">검색 결과가 없습니다.</div>';
            return;
        }

        resEl.innerHTML = items.slice(0, 5).map(item => {
            const label = item.roadAddress || item.jibunAddress;
            return `
            <div class="notice-item" style="padding:12px; margin-bottom:0;" onclick="selectSearchedLocation(${item.y}, ${item.x})">
                <div class="notice-title" style="font-size:0.85em; margin-bottom:0;">${label}</div>
            </div>`;
        }).join('');
    });
};

window.selectSearchedLocation = function(lat, lng) {
    localStorage.setItem('woody_location_picker_mode', targetLocMode);
    localStorage.setItem('woody_picker_search_loc', JSON.stringify({lat: parseFloat(lat), lng: parseFloat(lng)}));
    if (window.loadTab) window.loadTab('map');
};

window.openMapPickerDirectly = function() {
    localStorage.setItem('woody_location_picker_mode', targetLocMode);
    localStorage.removeItem('woody_picker_search_loc');
    if (window.loadTab) window.loadTab('map');
};

// ===== 공지사항 목록 렌더 =====
function renderNoticeList() {
    const container = document.getElementById('notice-list-content');
    if (!container) return;
    // 날짜 기준 최신순 정렬
    const sortedNotices = NOTICES.slice().sort((a,b) => new Date(b.date) - new Date(a.date));
    container.innerHTML = sortedNotices.map(n => `
        <div class="notice-item" onclick="showNoticeDetail(${n.id})">
            <div class="notice-meta">
                <span class="notice-badge">${n.version}</span>
                <span class="notice-date">${n.date}</span>
            </div>
            <div class="notice-title">${n.title}</div>
            <div class="notice-preview">${n.preview}</div>
        </div>
    `).join('');
}

window.showNoticeDetail = function(id) {
    const n = NOTICES.find(x => x.id === id);
    if (!n) return;

    const changesHtml = n.changes.map(c => `
        <div class="change-item">
            <span class="change-item-icon">${c.icon}</span>
            <span class="change-item-text">${c.text}</span>
        </div>
    `).join('');

    document.getElementById('notice-detail-body').innerHTML = `
        <div class="notice-detail-title">${n.title}</div>
        <div class="notice-detail-meta">
            <span class="notice-badge">${n.version}</span>
            <span class="notice-date">${n.date}</span>
        </div>
        <div class="notice-detail-body">${changesHtml}</div>
    `;
    showScreen('notice-detail');
};

// ===== 문의하기 =====
let selectedCategory = null;
let currentInqTab = 'list'; // 15번 기획: 다른 사람 글부터 훑어보는 흐름이 기본이 되도록 "전체 보기"를 기본 탭으로
let allInquiries = [];
let inqNicknameIsRandomPlaceholder = false; // 지금 입력칸 값이 (아직 안 건드린) 랜덤값인지
let currentFilter = 'all';
let unsubscribeInquiries = null;
let db = null;

const COOLDOWN_KEY = 'woody_inquiry_cooldown';
const COOLDOWN_MS = 3 * 60 * 1000; // 3분

const CAT_LABELS = {
    bug:        { label: '🐛 버그 제보',      badge: 'badge-bug' },
    restaurant: { label: '🍜 음식점 정보',    badge: 'badge-restaurant' },
    region:     { label: '📍 지역 추가 요청', badge: 'badge-region' },
    feature:    { label: '✨ 기능 요청',    badge: 'badge-feature' },
};

// Firebase 초기화
async function initFirebase() {
    try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js');
        const { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp }
            = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

        const firebaseConfig = {
            apiKey: "AIzaSyAaMivo3ZBcwS5OjDjXmCo9kZo47t0rZBc",
            authDomain: "woody-table.firebaseapp.com",
            projectId: "woody-table",
            storageBucket: "woody-table.firebasestorage.app",
            messagingSenderId: "640333501525",
            appId: "1:640333501525:web:db00602be7d7e8742c30dc"
        };

        const existingApps = getApps();
        const app = existingApps.find(a => a.name === 'inquiry-app')
            || initializeApp(firebaseConfig, 'inquiry-app');
        db = getFirestore(app);

        window._inqFs = { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp };
    } catch (e) {
        console.error('Firebase init err (inquiry):', e);
    }
}

initFirebase();

// ----- 닉네임 — 14번 한줄평 랜덤 닉네임 시스템 재사용(15번 기획, assets/js/shared.js) -----
// 게시판 특성상 "익명/익명/익명"만 뜨면 어떤 글이 누구 건지 구분이 안 돼서,
// 문의하기도 한줄평과 동일한 형용사+명사 랜덤 닉네임으로 기본값을 채움.
function prefillInquiryNickname() {
    const nickInput = document.getElementById('inq-nickname');
    if (!nickInput) return;
    const saved = localStorage.getItem(CUSTOM_NICK_KEY);
    if (saved) {
        nickInput.value = saved;
        inqNicknameIsRandomPlaceholder = false;
    } else {
        nickInput.value = getSessionRandomNickname();
        inqNicknameIsRandomPlaceholder = true;
    }
}
prefillInquiryNickname();

// 카테고리 선택
window.selectCategory = function(btn) {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCategory = btn.dataset.cat;
};

// 글자수 카운트
window.updateCharCount = function() {
    const len = document.getElementById('inq-content').value.length;
    document.getElementById('char-count').textContent = len;
};

document.getElementById('inq-nickname').addEventListener('focus', function() {
    document.getElementById('screen-inquiry').scrollTo({ top: 0, behavior: 'smooth' });
});

const resumeScreen = localStorage.getItem('woody_setting_resume_screen');
if (resumeScreen) {
    localStorage.removeItem('woody_setting_resume_screen');
    showScreen(resumeScreen);
}

// 탭 전환
window.switchInquiryTab = function(tab) {
    currentInqTab = tab;
    document.getElementById('tab-write').classList.toggle('active', tab === 'write');
    document.getElementById('tab-list').classList.toggle('active', tab === 'list');
    document.getElementById('inquiry-write-panel').style.display = tab === 'write' ? 'block' : 'none';
    document.getElementById('inquiry-list-panel').style.display = tab === 'list' ? 'block' : 'none';
    if (tab === 'list') loadInquiries();
};

// 목록 필터 칩
window.filterInquiries = function(chip) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    renderInquiryList();
};

// Firebase 목록 로드
function loadInquiries() {
    const container = document.getElementById('inq-list-container');
    container.innerHTML = '<div class="inquiry-loading">불러오는 중... ⏳</div>';

    if (!db || !window._inqFs) {
        setTimeout(loadInquiries, 800);
        return;
    }

    if (unsubscribeInquiries) unsubscribeInquiries();

    const { collection, query, orderBy, limit, onSnapshot } = window._inqFs;
    const q = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'), limit(50));

    unsubscribeInquiries = onSnapshot(q, (snapshot) => {
        allInquiries = [];
        snapshot.forEach(doc => allInquiries.push({ id: doc.id, ...doc.data() }));
        renderInquiryList();
    }, (err) => {
        console.error('Inquiry fetch error:', err);
        container.innerHTML = '<div class="inquiry-empty">목록을 불러오지 못했습니다. 😢</div>';
    });
}

function renderInquiryList() {
    const filtered = currentFilter === 'all'
        ? allInquiries
        : allInquiries.filter(i => i.category === currentFilter);

    document.getElementById('inq-list-count').textContent = `총 ${filtered.length}건`;

    const container = document.getElementById('inq-list-container');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="inquiry-empty">아직 문의가 없어요. 첫 번째 문의를 남겨주세요! ✍️</div>';
        return;
    }

    container.innerHTML = filtered.map(item => {
        const cat = CAT_LABELS[item.category] || { label: item.category, badge: '' };
        let dateStr = '';
        if (item.createdAt) {
            const d = item.createdAt.toDate();
            dateStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }
        const nickname = escapeHtml(item.nickname || '익명');
        const content = escapeHtml(item.content || '');
        // 답글은 앱 안에 작성 UI가 없음 — tools/reply-inquiry.js(관리자 전용
        // Admin SDK 스크립트)로만 달 수 있고, 여기선 읽기 전용으로만 표시(15번 기획)
        const replyHtml = item.reply ? `
                <div class="inquiry-reply">
                    <span class="inquiry-reply-badge">🧑‍💻 답변</span>
                    <div class="inquiry-reply-text">${escapeHtml(item.reply)}</div>
                </div>
        ` : '';
        return `
            <div class="inquiry-card">
                <div class="inquiry-card-top">
                    <span class="category-badge ${cat.badge}">${cat.label}</span>
                    <span class="inquiry-nickname">${nickname}</span>
                    <span class="inquiry-date">${dateStr}</span>
                </div>
                <div class="inquiry-content">${content}</div>
                ${replyHtml}
            </div>
        `;
    }).join('');
}

// 글 등록
window.submitInquiry = async function() {
    const msg = document.getElementById('inq-msg');

    if (!selectedCategory) { msg.textContent = '카테고리를 선택해 주세요.'; return; }
    const nickname = document.getElementById('inq-nickname').value.trim();
    const content = document.getElementById('inq-content').value.trim();
    if (!nickname) { msg.textContent = '닉네임을 입력해 주세요.'; return; }
    if (!content) { msg.textContent = '내용을 입력해 주세요.'; return; }
    if (content.length > 200) { msg.textContent = '내용은 200자 이내로 작성해 주세요.'; return; }

    // 쿨다운 체크
    const lastTime = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0');
    const now = Date.now();
    if (now - lastTime < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - (now - lastTime)) / 1000);
        const m = remaining >= 60 ? `${Math.floor(remaining/60)}분 ${remaining%60}초` : `${remaining}초`;
        msg.textContent = `⏳ ${m} 후에 다시 작성할 수 있어요.`;
        return;
    }

    if (!db || !window._inqFs) { msg.textContent = 'DB 연결 중입니다. 잠시 후 다시 시도해 주세요.'; return; }

    const btn = document.getElementById('inq-submit-btn');
    btn.disabled = true;
    msg.textContent = '등록 중...';
    msg.className = 'cooldown-msg';

    try {
        // 지금 불러와져 있는 최근 문의 목록(allInquiries) 안에서만 겹침 체크 —
        // 한줄평과 동일한 원칙(15번 기획), 추가 Firestore 조회 없음
        const finalNickname = dedupeNickname(nickname, allInquiries.map(i => i.nickname || '익명'));

        const { collection, addDoc, serverTimestamp } = window._inqFs;
        await addDoc(collection(db, 'inquiries'), {
            category: selectedCategory,
            nickname: finalNickname,
            content,
            createdAt: serverTimestamp()
        });

        localStorage.setItem(COOLDOWN_KEY, String(now));
        document.getElementById('inq-content').value = '';
        updateCharCount();
        selectedCategory = null;
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));

        // 랜덤으로 채워졌던 닉네임을 직접 고쳐서 제출했다면, 그걸 "내 닉네임"으로
        // 기억해뒀다가 다음 방문부턴 랜덤 대신 계속 이 닉네임을 씀(한줄평과 동일 패턴)
        if (inqNicknameIsRandomPlaceholder && nickname !== getSessionRandomNickname()) {
            localStorage.setItem(CUSTOM_NICK_KEY, nickname);
            inqNicknameIsRandomPlaceholder = false;
        } else if (!inqNicknameIsRandomPlaceholder && nickname !== localStorage.getItem(CUSTOM_NICK_KEY)) {
            localStorage.setItem(CUSTOM_NICK_KEY, nickname);
        }

        msg.textContent = '✅ 문의가 등록되었습니다!';
        msg.className = 'cooldown-msg success-msg';
        setTimeout(() => { msg.textContent = ''; msg.className = 'cooldown-msg'; }, 3000);
    } catch (e) {
        console.error('Inquiry addDoc error:', e);
        msg.textContent = '오류가 발생했습니다. 다시 시도해 주세요.';
    } finally {
        btn.disabled = false;
    }
};

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Enter 키 제출 방지 (textarea)
document.getElementById('inq-content')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
});

function updateAppThemeUI() {
    const theme = localStorage.getItem('woody_app_theme') || 'default';
    document.getElementById('app-theme-default').classList.toggle('selected', theme === 'default');
    document.getElementById('app-theme-dark').classList.toggle('selected', theme === 'dark');
}

window.setGlobalAppTheme = function(theme) {
    localStorage.setItem('woody_app_theme', theme);
    if (window.applyAppTheme) {
        window.applyAppTheme();
    }
    updateAppThemeUI();
    
    // 앱 테마와 지도 테마 동기화 (default -> 0, dark -> 1)
    const mapThemeIndex = theme === 'dark' ? 1 : 0;
    localStorage.setItem('woody_map_theme', mapThemeIndex);
    if (window.setMapTheme) {
        window.setMapTheme(mapThemeIndex);
    }
};

// 초기 화면
showScreen('main');
updateAppThemeUI();
})();
