// ==========================================
// 地理范围圈选应用 - 核心逻辑
// ==========================================

// 全局状态
const state = {
    map: null,           // 高德地图实例
    pins: [],            // 大头针数组 [{ id, marker, lnglat }]
    polygon: null,       // 多边形实例
    savedGroups: [],     // 已保存的坐标组
    currentTab: 'pins',  // 当前 Tab
    pinIdCounter: 0      // 大头针 ID 计数器
};

// ==========================================
// 1. 初始化地图
// ==========================================
function initMap() {
    state.map = new AMap.Map('mapContainer', {
        zoom: 13,
        center: [116.397452, 39.909187], // 默认北京天安门
        mapStyle: 'amap://styles/whitesmoke',
        resizeEnable: true
    });

    // 点击地图添加大头针
    state.map.on('click', (e) => {
        addPin(e.lnglat.getLng(), e.lnglat.getLat());
    });

    // 加载已保存的数据
    loadSavedGroups();

    console.log('✅ 地图初始化完成');
}

// ==========================================
// 2. 大头针管理
// ==========================================

// 添加大头针
function addPin(lng, lat) {
    const id = ++state.pinIdCounter;
    
    // 创建 Marker
    const marker = new AMap.Marker({
        position: [lng, lat],
        draggable: true,
        cursor: 'move',
        label: {
            content: `<div style="background:#3b82f6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;">${id}</div>`,
            direction: 'top',
            offset: new AMap.Pixel(0, -5)
        }
    });

    // 右键删除大头针
    marker.on('rightclick', () => {
        removePin(id);
    });

    // 拖拽更新多边形
    marker.on('dragging', () => {
        const pin = state.pins.find(p => p.id === id);
        if (pin) {
            pin.lnglat = [marker.getPosition().getLng(), marker.getPosition().getLat()];
            updatePolygon();
            renderPinsList();
        }
    });

    state.map.add(marker);

    state.pins.push({
        id: id,
        marker: marker,
        lnglat: [lng, lat]
    });

    updatePolygon();
    renderPinsList();
    showToast(`📌 添加大头针 #${id}`);
}

// 删除大头针
function removePin(id) {
    const index = state.pins.findIndex(p => p.id === id);
    if (index === -1) return;

    const pin = state.pins[index];
    state.map.remove(pin.marker);
    state.pins.splice(index, 1);

    updatePolygon();
    renderPinsList();
    showToast(`🗑️ 已删除大头针 #${id}`);
}

// 清除所有大头针
function clearAllPins() {
    if (state.pins.length === 0) return;
    
    if (!confirm('确定清除所有大头针吗？')) return;

    state.pins.forEach(pin => {
        state.map.remove(pin.marker);
    });
    state.pins = [];

    updatePolygon();
    renderPinsList();
    showToast('🗑️ 已清除所有大头针');
}

// ==========================================
// 3. 多边形管理
// ==========================================

function updatePolygon() {
    // 清除旧多边形
    if (state.polygon) {
        state.map.remove(state.polygon);
        state.polygon = null;
    }

    // 至少需要 3 个点才能画多边形
    if (state.pins.length < 3) return;

    // 按顺时针排序坐标
    const sorted = sortClockwise(state.pins.map(p => p.lnglat));

    // 创建多边形
    state.polygon = new AMap.Polygon({
        path: sorted,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        strokeColor: '#3b82f6',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        strokeStyle: 'solid'
    });

    state.map.add(state.polygon);
}

// 顺时针排序算法
function sortClockwise(coords) {
    if (coords.length <= 2) return coords;

    // 计算中心点
    const cx = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    const cy = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;

    // 按角度排序（顺时针）
    return [...coords].sort((a, b) => {
        const angleA = Math.atan2(a[1] - cy, a[0] - cx);
        const angleB = Math.atan2(b[1] - cy, b[0] - cx);
        return angleB - angleA; // 顺时针
    });
}

// ==========================================
// 4. 搜索定位
// ==========================================

function searchLocation() {
    const input = document.getElementById('searchInput').value.trim();
    if (!input) {
        showToast('⚠️ 请输入地址或坐标');
        return;
    }

    // 检查是否是坐标格式
    const coordMatch = input.match(/^([\d.]+)\s*[,，]\s*([\d.]+)$/);
    if (coordMatch) {
        const lng = parseFloat(coordMatch[1]);
        const lat = parseFloat(coordMatch[2]);
        state.map.setCenter([lng, lat]);
        state.map.setZoom(15);
        showToast(`📍 已定位到坐标 (${lng.toFixed(4)}, ${lat.toFixed(4)})`);
        return;
    }

    // 地址搜索
    const geocoder = new AMap.Geocoder();
    geocoder.getLocation(input, (status, result) => {
        if (status === 'complete' && result.geocodes.length > 0) {
            const geo = result.geocodes[0];
            const lng = geo.location.getLng();
            const lat = geo.location.getLat();
            state.map.setCenter([lng, lat]);
            state.map.setZoom(15);
            showToast(`📍 已定位到: ${geo.formattedAddress}`);
        } else {
            showToast('❌ 未找到该位置');
        }
    });
}

// 回车搜索
document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchLocation();
    }
});

// ==========================================
// 5. 导出 CSV
// ==========================================

function exportCSV() {
    if (state.pins.length === 0) {
        showToast('⚠️ 没有大头针可以导出');
        return;
    }

    // 按顺时针排序
    const sorted = state.pins.length >= 3 
        ? sortClockwise(state.pins.map(p => p.lnglat))
        : state.pins.map(p => p.lnglat);

    // 格式化为要求的格式
    const csvContent = sorted.map(c => `(${c[0]},${c[1]})`).join(',');

    // 创建下载
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `geo-fence-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    // 同时复制到剪贴板
    navigator.clipboard.writeText(csvContent).then(() => {
        showToast('✅ 已导出 CSV 并复制到剪贴板');
    }).catch(() => {
        showToast('✅ 已导出 CSV 文件');
    });
}

// ==========================================
// 6. 保存和加载
// ==========================================

function saveCurrentPins() {
    if (state.pins.length === 0) {
        showToast('⚠️ 没有大头针可以保存');
        return;
    }

    const name = prompt('给这个范围起个名字：', `范围 ${state.savedGroups.length + 1}`);
    if (!name) return;

    const group = {
        id: Date.now(),
        name: name,
        coordinates: state.pins.map(p => [...p.lnglat]),
        createdAt: new Date().toISOString()
    };

    state.savedGroups.push(group);
    localStorage.setItem('geoFenceSaved', JSON.stringify(state.savedGroups));

    renderSavedList();
    showToast(`💾 已保存: ${name}`);
}

function loadSavedGroups() {
    try {
        const saved = localStorage.getItem('geoFenceSaved');
        if (saved) {
            state.savedGroups = JSON.parse(saved);
            renderSavedList();
        }
    } catch (e) {
        console.error('加载保存数据失败:', e);
    }
}

function loadSavedGroup(groupId) {
    const group = state.savedGroups.find(g => g.id === groupId);
    if (!group) return;

    // 清除当前大头针
    state.pins.forEach(pin => state.map.remove(pin.marker));
    state.pins = [];
    state.pinIdCounter = 0;

    // 加载保存的坐标
    group.coordinates.forEach(coord => {
        addPin(coord[0], coord[1]);
    });

    // 自适应视野
    if (state.pins.length > 0) {
        state.map.setFitView();
    }

    switchTab('pins');
    showToast(`📂 已加载: ${group.name}`);
}

function deleteSavedGroup(groupId) {
    if (!confirm('确定删除这个保存的范围吗？')) return;

    state.savedGroups = state.savedGroups.filter(g => g.id !== groupId);
    localStorage.setItem('geoFenceSaved', JSON.stringify(state.savedGroups));

    renderSavedList();
    showToast('🗑️ 已删除保存的范围');
}

// ==========================================
// 7. UI 渲染
// ==========================================

function renderPinsList() {
    const empty = document.getElementById('pinsEmpty');
    const content = document.getElementById('pinsContent');
    const countEl = document.getElementById('pinCount');

    countEl.textContent = state.pins.length;

    if (state.pins.length === 0) {
        empty.classList.remove('hidden');
        content.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = state.pins.map((pin, index) => `
        <div class="pin-item flex items-center justify-between px-4 py-3 border-b border-slate-50" 
             onclick="focusPin(${pin.id})">
            <div class="flex items-center gap-3">
                <span class="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">${index + 1}</span>
                <div>
                    <p class="text-xs font-mono text-slate-700">${pin.lnglat[0].toFixed(6)}</p>
                    <p class="text-xs font-mono text-slate-400">${pin.lnglat[1].toFixed(6)}</p>
                </div>
            </div>
            <button 
                onclick="event.stopPropagation(); removePin(${pin.id})" 
                class="text-red-400 hover:text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded-lg"
            >
                删除
            </button>
        </div>
    `).join('');
}

function renderSavedList() {
    const empty = document.getElementById('savedEmpty');
    const content = document.getElementById('savedContent');
    const countEl = document.getElementById('savedCount');

    countEl.textContent = state.savedGroups.length;

    if (state.savedGroups.length === 0) {
        empty.classList.remove('hidden');
        content.classList.add('hidden');
        return;
    }

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = state.savedGroups.map(group => `
        <div class="saved-item flex items-center justify-between px-4 py-3 border-b border-slate-50" 
             onclick="loadSavedGroup(${group.id})">
            <div>
                <p class="text-sm font-bold text-slate-700">${group.name}</p>
                <p class="text-xs text-slate-400">${group.coordinates.length} 个坐标 · ${new Date(group.createdAt).toLocaleDateString()}</p>
            </div>
            <button 
                onclick="event.stopPropagation(); deleteSavedGroup(${group.id})" 
                class="text-red-400 hover:text-red-600 text-xs px-2 py-1 hover:bg-red-50 rounded-lg"
            >
                删除
            </button>
        </div>
    `).join('');
}

// 聚焦大头针（闪动效果）
function focusPin(id) {
    const pin = state.pins.find(p => p.id === id);
    if (!pin) return;

    // 地图移动到该点
    state.map.setCenter(pin.lnglat);

    // 闪动效果：通过 bounce 动画
    pin.marker.setAnimation('AMAP_ANIMATION_BOUNCE');
    setTimeout(() => {
        pin.marker.setAnimation('AMAP_ANIMATION_NONE');
    }, 1500);
}

// Tab 切换
function switchTab(tab) {
    state.currentTab = tab;

    const tabPins = document.getElementById('tabPins');
    const tabSaved = document.getElementById('tabSaved');
    const pinsList = document.getElementById('pinsList');
    const savedList = document.getElementById('savedList');

    if (tab === 'pins') {
        tabPins.classList.add('active');
        tabSaved.classList.remove('active');
        tabSaved.classList.add('text-slate-400');
        tabPins.classList.remove('text-slate-400');
        pinsList.classList.remove('hidden');
        savedList.classList.add('hidden');
    } else {
        tabSaved.classList.add('active');
        tabPins.classList.remove('active');
        tabPins.classList.add('text-slate-400');
        tabSaved.classList.remove('text-slate-400');
        savedList.classList.remove('hidden');
        pinsList.classList.add('hidden');
    }
}

// Toast 提示
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// ==========================================
// 8. 初始化
// ==========================================
window.onload = function() {
    initMap();
};
