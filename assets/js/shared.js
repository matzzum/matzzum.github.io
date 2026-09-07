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
