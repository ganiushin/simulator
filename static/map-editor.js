/**
 * Редактор карты: черные полосы (линия), зоны детекции камеры GREEN / RED (STOP) / RIGHT
 * Размер карты должен совпадать с симулятором (MAP_WIDTH x MAP_HEIGHT).
 */
(function() {
    const MAP_WIDTH = 800;   // размер зоны симуляции (должен совпадать с simulator.js)
    const MAP_HEIGHT = 600;
    const ZONE_RADIUS = 25;
    const LAMP_INFLUENCE_RADIUS = 120; // радиус влияния на фоторезистор (пиксели)

    let canvas, ctx;
    let mapImageData = null;  // только черное/белое (полоса)
    let cameraZones = [];    // { x, y, radius, sign: "GREEN" | "STOP" | "RIGHT" }
    let lamps = [];          // { x, y, radius } — лампочки для фоторезистора
    let ultrasonicObstacles = []; // { x, y, radius } — препятствия для сонара
    let startPosition = null; // { x, y, angle } — начальная позиция робота
    let currentTool = 'pencil';
    let brushSize = 12;
    let isDrawing = false;
    let lastX, lastY;

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = MAP_WIDTH / rect.width;
        const scaleY = MAP_HEIGHT / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
        };
    }

    function initMapImageData() {
        mapImageData = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
        const d = mapImageData.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = 255;
        }
        cameraZones = [];
        lamps = [];
        ultrasonicObstacles = [];
        startPosition = null;
    }

    function drawBlackCircle(cx, cy, r) {
        const d = mapImageData.data;
        for (let y = cy - r; y <= cy + r; y++) {
            for (let x = cx - r; x <= cx + r; x++) {
                if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
                    const idx = (y * MAP_WIDTH + x) * 4;
                    d[idx] = 0;
                    d[idx + 1] = 0;
                    d[idx + 2] = 0;
                    d[idx + 3] = 255;
                }
            }
        }
    }

    function drawLine(x0, y0, x1, y1, r) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const steps = Math.max(dx, dy, 1);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.floor(x0 + (x1 - x0) * t);
            const y = Math.floor(y0 + (y1 - y0) * t);
            drawBlackCircle(x, y, r);
        }
    }

    function drawWhiteCircle(cx, cy, r) {
        const d = mapImageData.data;
        for (let y = cy - r; y <= cy + r; y++) {
            for (let x = cx - r; x <= cx + r; x++) {
                if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) continue;
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
                    const idx = (y * MAP_WIDTH + x) * 4;
                    d[idx] = 255;
                    d[idx + 1] = 255;
                    d[idx + 2] = 255;
                    d[idx + 3] = 255;
                }
            }
        }
    }

    function drawWhiteLine(x0, y0, x1, y1, r) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const steps = Math.max(dx, dy, 1);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.floor(x0 + (x1 - x0) * t);
            const y = Math.floor(y0 + (y1 - y0) * t);
            drawWhiteCircle(x, y, r);
        }
    }

    function eraseAtPoint(px, py) {
        const r = Math.max(1, Math.floor(brushSize / 2));
        drawWhiteCircle(px, py, r);
    }

    function redraw() {
        if (!mapImageData) return;
        ctx.putImageData(mapImageData, 0, 0);
        // Зоны поверх (только для отображения)
        cameraZones.forEach(z => {
            if (z.sign === 'GREEN') {
                ctx.fillStyle = 'rgba(0, 200, 0, 0.4)';
                ctx.strokeStyle = '#00aa00';
            } else if (z.sign === 'STOP') {
                ctx.fillStyle = 'rgba(220, 0, 0, 0.4)';
                ctx.strokeStyle = '#cc0000';
            } else if (z.sign === 'RIGHT') {
                ctx.fillStyle = 'rgba(255, 200, 0, 0.4)';
                ctx.strokeStyle = '#cc9900';
            }
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius || ZONE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            if (z.sign === 'RIGHT') {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('R', z.x, z.y);
            }
        });
        // Лампочки (влияют на фоторезистор)
        lamps.forEach(l => {
            const lx = Number(l.x), ly = Number(l.y), lr = Math.min(20, (l.radius || LAMP_INFLUENCE_RADIUS) / 4);
            if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;
            ctx.fillStyle = '#ffff00';
            ctx.strokeStyle = '#cc9900';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(lx, ly, lr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('L', lx, ly);
        });
        // Препятствия сонара (красные круги)
        ultrasonicObstacles.forEach(obs => {
            const ox = Number(obs.x), oy = Number(obs.y), or = Number(obs.radius) || 30;
            if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
            ctx.fillStyle = 'rgba(220, 0, 0, 0.6)';
            ctx.strokeStyle = '#cc0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ox, oy, or, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', ox, oy);
        });
        // Стартовая позиция робота
        if (startPosition) {
            const a = (startPosition.angle || 90) * Math.PI / 180;
            ctx.save();
            ctx.translate(startPosition.x, startPosition.y);
            ctx.rotate(-a);
            ctx.fillStyle = 'rgba(50, 153, 102, 0.8)';
            ctx.fillRect(-20, -15, 40, 30);
            ctx.strokeStyle = '#006633';
            ctx.lineWidth = 2;
            ctx.strokeRect(-20, -15, 40, 30);
            ctx.restore();
            ctx.fillStyle = '#006633';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('СТАРТ', startPosition.x, startPosition.y - 25);
        }
    }

    function onMouseDown(e) {
        const { x, y } = getCanvasCoords(e);
        if (currentTool === 'pencil') {
            isDrawing = true;
            lastX = x;
            lastY = y;
            const r = Math.max(1, Math.floor(brushSize / 2));
            drawBlackCircle(x, y, r);
            redraw();
        } else if (currentTool === 'eraser') {
            const hitRadius = 30;
            if (startPosition && Math.hypot(x - startPosition.x, y - startPosition.y) < hitRadius) {
                startPosition = null;
                redraw();
                return;
            }
            const zoneIndex = cameraZones.findIndex(z => Math.hypot(x - z.x, y - z.y) < (z.radius || ZONE_RADIUS));
            if (zoneIndex >= 0) {
                cameraZones.splice(zoneIndex, 1);
                redraw();
                return;
            }
            const lampIndex = lamps.findIndex(l => Math.hypot(x - l.x, y - l.y) < 25);
            if (lampIndex >= 0) {
                lamps.splice(lampIndex, 1);
                redraw();
                return;
            }
            const ultrasonicIndex = ultrasonicObstacles.findIndex(obs => Math.hypot(x - obs.x, y - obs.y) < (obs.radius || 30));
            if (ultrasonicIndex >= 0) {
                ultrasonicObstacles.splice(ultrasonicIndex, 1);
                redraw();
                return;
            }
            isDrawing = true;
            lastX = x;
            lastY = y;
            eraseAtPoint(x, y);
            redraw();
        } else if (currentTool === 'green' || currentTool === 'red' || currentTool === 'right') {
            const sign = currentTool === 'green' ? 'GREEN' : currentTool === 'red' ? 'STOP' : 'RIGHT';
            cameraZones.push({ x, y, radius: ZONE_RADIUS, sign });
            redraw();
        } else if (currentTool === 'start') {
            const angleInput = document.getElementById('startAngle');
            const angle = angleInput ? Math.max(0, Math.min(360, parseInt(angleInput.value, 10) || 90)) : 90;
            startPosition = { x, y, angle };
            redraw();
        } else if (currentTool === 'lamp') {
            lamps.push({ x, y, radius: LAMP_INFLUENCE_RADIUS });
            redraw();
        } else if (currentTool === 'ultrasonic') {
            ultrasonicObstacles.push({ x, y, radius: 30 });
            redraw();
        }
    }

    function onMouseMove(e) {
        const { x, y } = getCanvasCoords(e);
        if (currentTool === 'pencil' && isDrawing) {
            const r = Math.max(1, Math.floor(brushSize / 2));
            drawLine(lastX, lastY, x, y, r);
            lastX = x;
            lastY = y;
            redraw();
        } else if (currentTool === 'eraser' && isDrawing) {
            const r = Math.max(1, Math.floor(brushSize / 2));
            drawWhiteLine(lastX, lastY, x, y, r);
            lastX = x;
            lastY = y;
            redraw();
        }
    }

    function onMouseUp() {
        isDrawing = false;
    }

    function onMouseLeave() {
        isDrawing = false;
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('.map-editor-toolbar .tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    function clearEditor() {
        if (!confirm('Очистить всю карту и все зоны?')) return;
        initMapImageData();
        redraw();
    }

    /** Сохранить карту в память и уведомить симулятор (как сейчас) */
    function saveMap() {
        if (!mapImageData) return;
        const imageDataCopy = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
        imageDataCopy.data.set(mapImageData.data);
        window.customMapData = {
            imageData: imageDataCopy,
            cameraZones: cameraZones.map(z => ({ x: z.x, y: z.y, radius: z.radius || ZONE_RADIUS, sign: z.sign })),
            lamps: lamps.map(l => ({ x: l.x, y: l.y, radius: l.radius || LAMP_INFLUENCE_RADIUS })),
            ultrasonicObstacles: ultrasonicObstacles.map(obs => ({ x: obs.x, y: obs.y, radius: obs.radius || 30 })),
            startPosition: startPosition ? { x: startPosition.x, y: startPosition.y, angle: startPosition.angle } : null
        };
        // Останавливаем симулятор, если он запущен, но не удаляем его полностью
        // Это позволит обновить карту при следующем запуске
        if (window.simulator) {
            window.simulator.stop();
            // Обновляем карту в существующем симуляторе, если метод доступен
            if (window.simulator.updateMap && typeof window.simulator.updateMap === 'function') {
                window.simulator.updateMap(window.customMapData);
            } else {
                // Если метод недоступен, пересоздаем симулятор при следующем запуске
                window.simulator = null;
            }
        }
        alert('Карта сохранена! Запустите симулятор — будет использована ваша карта.');
    }

    /** Формат файла карты v1: version, mapWidth, mapHeight, imageDataBase64, cameraZones, startPosition */
    const MAP_FILE_VERSION = 1;
    const defaultMapFileName = 'map_v' + MAP_FILE_VERSION + '_' + new Date().toISOString().slice(0, 10) + '.json';

    function uint8ArrayToBase64(bytes) {
        var binary = '';
        var chunkSize = 8192;
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    function getMapFilePayload() {
        if (!mapImageData) return null;
        var raw = new Uint8Array(mapImageData.data);
        var base64 = uint8ArrayToBase64(raw);
        return {
            version: MAP_FILE_VERSION,
            mapWidth: MAP_WIDTH,
            mapHeight: MAP_HEIGHT,
            imageDataBase64: base64,
            cameraZones: cameraZones.map(z => ({ x: z.x, y: z.y, radius: z.radius || ZONE_RADIUS, sign: z.sign })),
            lamps: lamps.map(l => ({ x: l.x, y: l.y, radius: l.radius || LAMP_INFLUENCE_RADIUS })),
            ultrasonicObstacles: ultrasonicObstacles.map(obs => ({ x: obs.x, y: obs.y, radius: obs.radius || 30 })),
            startPosition: startPosition ? { x: startPosition.x, y: startPosition.y, angle: startPosition.angle } : null
        };
    }

    function saveMapToFile() {
        if (!mapImageData || !ctx) {
            alert('Нет данных карты для сохранения. Сначала нарисуйте карту в редакторе.');
            return;
        }
        var payload, json, blob;
        try {
            payload = getMapFilePayload();
            if (!payload) return;
            json = JSON.stringify(payload, null, 2);
            blob = new Blob([json], { type: 'application/json' });
        } catch (err) {
            alert('Ошибка при подготовке карты: ' + (err.message || String(err)));
            return;
        }
        if (typeof window.showSaveFilePicker === 'function') {
            window.showSaveFilePicker({
                suggestedName: defaultMapFileName,
                types: [{ description: 'Карта симулятора', accept: { 'application/json': ['.json'] } }]
            })
                .then(function(handle) {
                    return handle.createWritable();
                })
                .then(function(writable) {
                    return writable.write(blob).then(function() { return writable.close(); });
                })
                .then(function() {
                    alert('Карта сохранена в выбранный файл.');
                })
                .catch(function(err) {
                    if (err.name !== 'AbortError') {
                        fallbackSaveMap(blob);
                    }
                });
        } else {
            fallbackSaveMap(blob);
        }
    }

    function fallbackSaveMap(blob) {
        const name = prompt('Введите имя файла для сохранения карты:', defaultMapFileName);
        if (name == null || name.trim() === '') return;
        const fileName = name.trim().endsWith('.json') ? name.trim() : name.trim() + '.json';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
        alert('Карта сохранена как «' + fileName + '» (в папку загрузок браузера).');
    }

    function loadMapFromFile(file) {
        if (!file || !file.name) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const payload = JSON.parse(e.target.result);
                const ver = payload.version;
                if (ver !== 1) {
                    alert('Неизвестная версия файла карты: ' + ver + '. Поддерживается версия 1.');
                    return;
                }
                const w = Number(payload.mapWidth) || MAP_WIDTH;
                const h = Number(payload.mapHeight) || MAP_HEIGHT;
                if (w !== MAP_WIDTH || h !== MAP_HEIGHT) {
                    alert('Размер карты в файле (' + w + '×' + h + ') не совпадает с редактором (' + MAP_WIDTH + '×' + MAP_HEIGHT + ').');
                    return;
                }
                const base64 = payload.imageDataBase64;
                if (!base64 || typeof base64 !== 'string') {
                    alert('В файле нет данных изображения карты.');
                    return;
                }
                const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                if (!mapImageData) {
                    mapImageData = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
                }
                const len = Math.min(raw.length, mapImageData.data.length);
                for (let i = 0; i < len; i++) mapImageData.data[i] = raw[i];

                cameraZones = (payload.cameraZones && Array.isArray(payload.cameraZones))
                    ? payload.cameraZones.map(z => ({
                        x: Number(z.x) || 0,
                        y: Number(z.y) || 0,
                        radius: Number(z.radius) > 0 ? Number(z.radius) : ZONE_RADIUS,
                        sign: z.sign === 'GREEN' || z.sign === 'STOP' || z.sign === 'RIGHT' ? z.sign : 'GREEN'
                    }))
                    : [];
                const sp = payload.startPosition;
                startPosition = (sp && typeof sp.x === 'number' && typeof sp.y === 'number')
                    ? { x: sp.x, y: sp.y, angle: Number(sp.angle) || 90 }
                    : null;
                lamps = (payload.lamps && Array.isArray(payload.lamps))
                    ? payload.lamps.map(l => ({
                        x: Number(l.x) || 0,
                        y: Number(l.y) || 0,
                        radius: Number(l.radius) > 0 ? Number(l.radius) : LAMP_INFLUENCE_RADIUS
                    }))
                    : [];
                ultrasonicObstacles = (payload.ultrasonicObstacles && Array.isArray(payload.ultrasonicObstacles))
                    ? payload.ultrasonicObstacles.map(obs => ({
                        x: Number(obs.x) || 0,
                        y: Number(obs.y) || 0,
                        radius: Number(obs.radius) > 0 ? Number(obs.radius) : 30
                    }))
                    : [];

                const imageDataCopy = ctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
                imageDataCopy.data.set(mapImageData.data);
                window.customMapData = {
                    imageData: imageDataCopy,
                    cameraZones: cameraZones.map(z => ({ x: z.x, y: z.y, radius: z.radius || ZONE_RADIUS, sign: z.sign })),
                    lamps: lamps.map(l => ({ x: l.x, y: l.y, radius: l.radius || LAMP_INFLUENCE_RADIUS })),
                    ultrasonicObstacles: ultrasonicObstacles.map(obs => ({ x: obs.x, y: obs.y, radius: obs.radius || 30 })),
                    startPosition: startPosition ? { x: startPosition.x, y: startPosition.y, angle: startPosition.angle } : null
                };
                // Останавливаем симулятор, если он запущен, но не удаляем его полностью
                // Это позволит обновить карту при следующем запуске
                if (window.simulator) {
                    window.simulator.stop();
                    // Обновляем карту в существующем симуляторе, если метод доступен
                    if (window.simulator.updateMap && typeof window.simulator.updateMap === 'function') {
                        window.simulator.updateMap(window.customMapData);
                    } else {
                        // Если метод недоступен, пересоздаем симулятор при следующем запуске
                        window.simulator = null;
                    }
                }
                redraw();
                alert('Карта загружена из файла (версия ' + ver + '). Можно запустить симулятор.');
            } catch (err) {
                alert('Ошибка загрузки карты: ' + (err.message || String(err)));
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    function openEditor() {
        const simContainer = document.getElementById('simulatorContainer');
        if (simContainer) simContainer.classList.remove('show');
        document.getElementById('placeholderCenter')?.classList.add('hide');
        document.getElementById('mapEditorContainer').classList.add('show');
        canvas = document.getElementById('mapEditorCanvas');
        ctx = canvas.getContext('2d');
        if (!mapImageData) {
            initMapImageData();
        }
        redraw();
    }

    function closeEditor() {
        document.getElementById('mapEditorContainer').classList.remove('show');
        const simOpen = document.getElementById('simulatorContainer')?.classList.contains('show');
        if (!simOpen) document.getElementById('placeholderCenter')?.classList.remove('hide');
    }

    function init() {
        document.getElementById('btnMapEditor').addEventListener('click', openEditor);
        document.getElementById('btnEditorClose').addEventListener('click', closeEditor);
        document.getElementById('btnEditorClear').addEventListener('click', clearEditor);
        document.getElementById('btnEditorSave').addEventListener('click', saveMap);
        document.getElementById('btnEditorSaveFile').addEventListener('click', saveMapToFile);
        const loadMapInput = document.getElementById('loadMapInput');
        if (loadMapInput) {
            loadMapInput.addEventListener('change', function() {
                const file = this.files && this.files[0];
                if (file) {
                    loadMapFromFile(file);
                    this.value = '';
                }
            });
        }
        document.getElementById('btnEditorLoadFile').addEventListener('click', function() {
            if (loadMapInput) loadMapInput.click();
        });

        document.querySelectorAll('.map-editor-toolbar .tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => setTool(btn.dataset.tool));
        });

        document.getElementById('brushSize').addEventListener('input', function() {
            brushSize = parseInt(this.value, 10);
            document.getElementById('brushSizeLabel').textContent = brushSize;
        });

        canvas = document.getElementById('mapEditorCanvas');
        if (canvas) {
            ctx = canvas.getContext('2d');
            canvas.addEventListener('mousedown', onMouseDown);
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseup', onMouseUp);
            canvas.addEventListener('mouseleave', onMouseLeave);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
