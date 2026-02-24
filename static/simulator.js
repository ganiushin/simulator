/**
 * Симулятор робота для браузера v4.0
 * Упрощенный синтаксис без async/await и yield
 */

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;

class RobotSimulator {
    constructor(canvasId, scriptContent, customMapData) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.scriptContent = scriptContent;
        this.customMapData = customMapData || null;
        
        this.pyodide = null;
        this.pyodideReady = false;
        
        const centerX = MAP_WIDTH / 2;
        const centerY = MAP_HEIGHT / 2;
        const start = (this.customMapData && this.customMapData.startPosition)
            ? this.customMapData.startPosition
            : { x: centerX, y: MAP_HEIGHT - 115, angle: 90 };
        this.startPosition = { x: start.x, y: start.y, angle: start.angle };
        this.robot = {
            x: start.x,
            y: start.y,
            angle: start.angle,
            leftSpeed: 0,
            rightSpeed: 0
        };
        
        this.sensors = {
            lineLeft: 0,
            lineCenter: 0,
            lineRight: 0,
            ultrasonic: 400,
            photoresistor: 0,
            camera: null,
            leftEncoder: 0,
            rightEncoder: 0
        };
        
        this.running = false;
        this.paused = false;
        this.animationFrame = null;
        this.lastTime = 0;
        this.scriptRunning = false;
        this.shouldStopScript = false;
        this.lastSleepPromise = null;
        
        this.map = {
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            imageData: null
        };
        
        let rawZones = this.customMapData && this.customMapData.cameraZones && Array.isArray(this.customMapData.cameraZones)
            ? this.customMapData.cameraZones
            : [];
        this.cameraZones = rawZones.map(z => ({
            x: Number(z.x) || 0,
            y: Number(z.y) || 0,
            radius: (Number(z.radius) > 0 ? Number(z.radius) : 25),
            sign: z.sign != null ? String(z.sign) : ""
        }));
        
        this.initMap();
        this.initRobotAPI();
        this.initPyodide();
    }
    
    async initPyodide() {
        if (window.pyodide) {
            this.pyodide = window.pyodide;
            this.pyodideReady = true;
            return;
        }
        
        try {
            console.log('Инициализация Pyodide...');
            this.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
            });
            window.pyodide = this.pyodide;
            this.pyodideReady = true;
            console.log('Pyodide готов!');
        } catch (error) {
            console.error('Ошибка загрузки Pyodide:', error);
            alert('Не удалось загрузить Pyodide. Проверьте интернет соединение.');
        }
    }
    
    initMapRoadPolygon(mapCtx) {
        const cx = MAP_WIDTH / 2, cy = MAP_HEIGHT / 2;
        const k = Math.min(MAP_WIDTH, MAP_HEIGHT) / 600;
        const R_OUTER = Math.round(260 * k);
        const BORDER = Math.round(32 * k);
        const R_INNER = Math.round(110 * k);

        mapCtx.fillStyle = '#000000';
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, R_OUTER, 0, Math.PI * 2);
        mapCtx.fill();

        mapCtx.fillStyle = '#ffffff';
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, R_OUTER - BORDER, 0, Math.PI * 2);
        mapCtx.fill();

        mapCtx.fillStyle = '#000000';
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, R_INNER, 0, Math.PI * 2);
        mapCtx.fill();

        mapCtx.strokeStyle = '#000000';
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, R_INNER, 0, Math.PI * 2);
        mapCtx.stroke();
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, R_OUTER - BORDER, 0, Math.PI * 2);
        mapCtx.stroke();
    }

    initMap() {
        if (this.customMapData && this.customMapData.imageData) {
            this.map.imageData = this.customMapData.imageData;
            return;
        }
        const mapCanvas = document.createElement('canvas');
        mapCanvas.width = MAP_WIDTH;
        mapCanvas.height = MAP_HEIGHT;
        const mapCtx = mapCanvas.getContext('2d');

        mapCtx.fillStyle = '#ffffff';
        mapCtx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

        this.initMapRoadPolygon(mapCtx);

        const lampX = MAP_WIDTH / 2, lampY = Math.round(MAP_HEIGHT * 0.283);
        const k = Math.min(MAP_WIDTH, MAP_HEIGHT) / 600;
        mapCtx.fillStyle = '#ffff00';
        mapCtx.beginPath();
        mapCtx.arc(lampX, lampY, Math.round(14 * k), 0, Math.PI * 2);
        mapCtx.fill();
        mapCtx.strokeStyle = '#333';
        mapCtx.lineWidth = 2;
        mapCtx.stroke();

        this.map.imageData = mapCtx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }
    
    initRobotAPI() {
        const self = this;
        const buttonState = { _pressed: false };
        this.buttonState = buttonState;
        
        this.bot = {
            motors: {
                left_speed: 0,
                right_speed: 0,
                move: (left, right) => {
                    self.robot.leftSpeed = Math.max(-100, Math.min(100, left));
                    self.robot.rightSpeed = Math.max(-100, Math.min(100, right));
                },
                stop: () => {
                    self.robot.leftSpeed = 0;
                    self.robot.rightSpeed = 0;
                }
            },
            button: {
                is_pressed: () => buttonState._pressed
            },
            leds: {
                pixels: [[255,165,0], [255,165,0], [255,165,0], [255,165,0]],
                fill: (color) => {
                    const c = Array.isArray(color) ? color : [color[0], color[1], color[2]];
                    for (let i = 0; i < 4; i++) {
                        self.bot.leds.pixels[i] = c;
                    }
                },
                write: () => {}
            },
            line_left: { read: () => self.sensors.lineLeft },
            line_sensor: { read: () => self.sensors.lineCenter },
            line_right: { read: () => self.sensors.lineRight },
            ultrasonic: { distance_cm: () => self.sensors.ultrasonic },
            photoresistor: { read: () => self.sensors.photoresistor },
            left_encoder: { read: () => Math.round(self.sensors.leftEncoder || 0) },
            right_encoder: { read: () => Math.round(self.sensors.rightEncoder || 0) },
            camera: {
                detect_sign: () => { const v = self.sensors.camera; return v != null ? String(v) : null; }
            },
            sleep: (seconds) => {
                return seconds;
            }
        };
    }
    
    loadScript(content) {
        this.scriptContent = content;
    }
    
    updateMap(customMapData) {
        this.customMapData = customMapData || null;
        
        if (this.customMapData && this.customMapData.imageData) {
            this.map.imageData = this.customMapData.imageData;
        } else {
            this.initMap();
        }
        
        let rawZones = this.customMapData && this.customMapData.cameraZones && Array.isArray(this.customMapData.cameraZones)
            ? this.customMapData.cameraZones
            : [];
        this.cameraZones = rawZones.map(z => ({
            x: Number(z.x) || 0,
            y: Number(z.y) || 0,
            radius: (Number(z.radius) > 0 ? Number(z.radius) : 25),
            sign: z.sign != null ? String(z.sign) : ""
        }));
        
        if (this.customMapData && this.customMapData.startPosition) {
            const start = this.customMapData.startPosition;
            this.startPosition = { x: start.x, y: start.y, angle: start.angle || 90 };
        } else {
            const centerX = MAP_WIDTH / 2;
            const centerY = MAP_HEIGHT / 2;
            this.startPosition = { x: centerX, y: MAP_HEIGHT - 115, angle: 90 };
        }
        
        this.reset();
        
        if (typeof this.draw === 'function') {
            this.draw();
        }
    }
    
    async start() {
        if (this.running) return;
        
        if (this.scriptRunning) {
            let attempts = 0;
            while (this.scriptRunning && attempts < 50) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
            }
            if (this.scriptRunning) {
                this.scriptRunning = false;
            }
        }
        
        if (!this.pyodideReady) {
            await this.initPyodide();
        }
        
        this.running = true;
        this.paused = false;
        this.shouldStopScript = false;
        this.reset();
        this.scriptRunning = false;
        
        this.runScript();
        
        requestAnimationFrame(() => this.animate());
    }
    
    stop() {
        this.running = false;
        this.shouldStopScript = true;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.scriptRunning = false;
        const self = this;
        setTimeout(() => { 
            self.scriptRunning = false;
            self.shouldStopScript = false;
        }, 500);
    }
    
    togglePause() {
        this.paused = !this.paused;
    }
    
    reset() {
        const start = this.startPosition || { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 115, angle: 90 };
        this.robot.x = start.x;
        this.robot.y = start.y;
        this.robot.angle = start.angle;
        this.robot.leftSpeed = 0;
        this.robot.rightSpeed = 0;
        this.sensors.leftEncoder = 0;
        this.sensors.rightEncoder = 0;
    }
    
    async runScript() {
        if (this.scriptRunning) {
            return;
        }
        this.scriptRunning = true;

        const buttonState = this.buttonState || { _pressed: false };
        this.buttonState = buttonState;
        const self = this;
        const botAPI = {
            motors: {
                left_speed: 0,
                right_speed: 0,
                move: (left, right) => {
                    self.robot.leftSpeed = Math.max(-100, Math.min(100, left));
                    self.robot.rightSpeed = Math.max(-100, Math.min(100, right));
                },
                stop: () => {
                    self.robot.leftSpeed = 0;
                    self.robot.rightSpeed = 0;
                }
            },
            button: {
                get _pressed() { return buttonState._pressed; },
                set _pressed(v) { buttonState._pressed = v; },
                is_pressed: () => buttonState._pressed,
                pressButton: () => { buttonState._pressed = true; },
                releaseButton: () => { buttonState._pressed = false; }
            },
            leds: {
                pixels: [[255,165,0], [255,165,0], [255,165,0], [255,165,0]],
                fill: (color) => {
                    const c = Array.isArray(color) ? [...color] : [color[0], color[1], color[2]];
                    for (let i = 0; i < 4; i++) {
                        botAPI.leds.pixels[i] = c;
                    }
                },
                write: () => {}
            },
            line_left: { read: () => self.sensors.lineLeft },
            line_sensor: { read: () => self.sensors.lineCenter },
            line_right: { read: () => self.sensors.lineRight },
            ultrasonic: { distance_cm: () => self.sensors.ultrasonic },
            photoresistor: { read: () => self.sensors.photoresistor },
            left_encoder: { read: () => Math.round(self.sensors.leftEncoder || 0) },
            right_encoder: { read: () => Math.round(self.sensors.rightEncoder || 0) },
            camera: { detect_sign: () => { const v = self.sensors.camera; return v != null ? String(v) : null; } },
            sleep: (seconds) => {
                if (self.shouldStopScript || !self.running) {
                    return Promise.resolve();
                }
                
                const start = Date.now();
                const end = start + seconds * 1000;
                
                const promise = new Promise((resolve) => {
                    const checkInterval = () => {
                        if (self.shouldStopScript || !self.running) {
                            resolve();
                            return;
                        }
                        
                        if (self.paused) {
                            setTimeout(checkInterval, 10);
                            return;
                        }
                        
                        const now = Date.now();
                        if (now >= end) {
                            resolve();
                        } else {
                            setTimeout(checkInterval, Math.min(10, end - now));
                        }
                    };
                    
                    checkInterval();
                });
                
                self.lastSleepPromise = promise;
                return promise;
            }
        };
        this.bot = botAPI;
        window.currentBot = botAPI;

        if (!this.pyodideReady) {
            await this.initPyodide();
        }
        if (!this.pyodideReady) {
            this.scriptRunning = false;
            return;
        }

        try {
            this.pyodide.registerJsModule("bot_api", botAPI);
            
            const pythonWrapper = `
import bot_api

class Bot:
    def __init__(self):
        self.motors = bot_api.motors
        self.button = bot_api.button
        self.leds = bot_api.leds
        self.line_left = bot_api.line_left
        self.line_sensor = bot_api.line_sensor
        self.line_right = bot_api.line_right
        self.ultrasonic = bot_api.ultrasonic
        self.photoresistor = bot_api.photoresistor
        self.left_encoder = bot_api.left_encoder
        self.right_encoder = bot_api.right_encoder
        self.camera = bot_api.camera
        
    def sleep(self, seconds):
        return seconds

bot = Bot()
`;
            
            this.pyodide.runPython(pythonWrapper);
            
            const userScript = this.scriptContent;
            this.pyodide.runPython(userScript);
            
            try {
                const runRobot = this.pyodide.globals.get('run_robot');
                if (runRobot) {
                    console.log('Запуск run_robot...');
                    const self = this;
                    (async () => {
                        try {
                            let isGenerator = false;
                            try {
                                isGenerator = this.pyodide.runPython(`
import inspect
robot_func = run_robot
is_gen = inspect.isgeneratorfunction(robot_func)
is_gen
`);
                            } catch (error) {
                                isGenerator = false;
                            }
                            
                            if (isGenerator) {
                                await this.executeGenerator();
                            } else {
                                await this.pyodide.runPythonAsync(`
import sys

try:
    run_robot(bot)
except KeyboardInterrupt:
    pass
except SystemExit:
    pass
except Exception as e:
    import traceback
    print(f"Ошибка: {e}", file=sys.stderr)
    traceback.print_exc()
`);
                            }
                            
                            console.log('Скрипт завершен');
                            self.scriptRunning = false;
                        } catch (error) {
                            console.error('Ошибка выполнения run_robot:', error);
                            if (!error.message.includes('KeyboardInterrupt') && !error.message.includes('SystemExit')) {
                                alert('Ошибка выполнения: ' + error.message);
                            }
                            self.scriptRunning = false;
                        }
                    })();
                } else {
                    alert('Функция run_robot(bot) не найдена в скрипте!');
                    this.scriptRunning = false;
                }
            } catch (error) {
                console.error('Ошибка запуска run_robot:', error);
                alert('Ошибка: ' + error.message);
                this.scriptRunning = false;
            }
            
        } catch (error) {
            console.error('Ошибка выполнения Python скрипта:', error);
            alert('Ошибка симулятора: ' + (error && error.message ? error.message : String(error)));
            this.scriptRunning = false;
        }
    }
    
    async executeGenerator() {
        const self = this;
        
        try {
            await this.pyodide.runPythonAsync(`
import sys
robot_gen = run_robot(bot)
bot_api._robot_gen = robot_gen
bot_api._gen_continue = True
`);
            
            const stepGenerator = async () => {
                if (!self.running || self.shouldStopScript) {
                    self.scriptRunning = false;
                    return;
                }
                
                try {
                    await self.pyodide.runPythonAsync(`
import sys
try:
    sleep_seconds = next(bot_api._robot_gen)
    bot_api._last_sleep_time = sleep_seconds if isinstance(sleep_seconds, (int, float)) else 0
    bot_api._gen_continue = True
except StopIteration:
    bot_api._gen_continue = False
    bot_api._last_sleep_time = 0
except Exception as e:
    bot_api._gen_continue = False
    import traceback
    print(f"Ошибка: {e}", file=sys.stderr)
    traceback.print_exc()
    raise e
`);
                    
                    const shouldContinue = self.pyodide.runPython('bot_api._gen_continue');
                    
                    if (!shouldContinue) {
                        self.scriptRunning = false;
                        return;
                    }
                    
                    const sleepSeconds = self.pyodide.runPython('bot_api._last_sleep_time');
                    
                    if (typeof sleepSeconds === 'number' && sleepSeconds > 0) {
                        const sleepUntil = Date.now() + sleepSeconds * 1000;
                        
                        await new Promise((resolve) => {
                            const checkInterval = () => {
                                if (self.shouldStopScript || !self.running) {
                                    resolve();
                                    return;
                                }
                                
                                if (self.paused) {
                                    setTimeout(checkInterval, 10);
                                    return;
                                }
                                
                                const now = Date.now();
                                if (now >= sleepUntil) {
                                    resolve();
                                } else {
                                    setTimeout(checkInterval, Math.min(10, sleepUntil - now));
                                }
                            };
                            checkInterval();
                        });
                    }
                    
                    setTimeout(stepGenerator, 0);
                } catch (error) {
                    if (error.message && error.message.includes('StopIteration')) {
                        self.scriptRunning = false;
                    } else {
                        console.error('Ошибка выполнения генератора:', error);
                        throw error;
                    }
                }
            };
            
            await stepGenerator();
            
        } catch (error) {
            console.error('Ошибка выполнения генератора:', error);
            if (!error.message || (!error.message.includes('KeyboardInterrupt') && !error.message.includes('SystemExit'))) {
                alert('Ошибка выполнения: ' + error.message);
            }
            self.scriptRunning = false;
        }
    }
    
    updatePhysics(dt) {
        if (this.paused) return;
        
        const WHEEL_BASE = 40;
        const MAX_SPEED = 50;
        
        const vl = this.robot.leftSpeed;
        const vr = this.robot.rightSpeed;
        
        const v_px = ((vl + vr) / 200.0) * MAX_SPEED;
        const w = ((vr - vl) / 100.0) * (MAX_SPEED / WHEEL_BASE);
        
        this.robot.angle += w * dt * 57.3;
        const rad = this.robot.angle * Math.PI / 180;
        
        this.robot.x += v_px * Math.cos(rad) * dt;
        this.robot.y -= v_px * Math.sin(rad) * dt;
        
        const margin = 20;
        this.robot.x = Math.max(margin, Math.min(MAP_WIDTH - margin, this.robot.x));
        this.robot.y = Math.max(margin, Math.min(MAP_HEIGHT - margin, this.robot.y));
        
        const TICKS_PER_SPEED_SEC = 20;
        this.sensors.leftEncoder = (this.sensors.leftEncoder || 0) + vl * dt * (TICKS_PER_SPEED_SEC / 50);
        this.sensors.rightEncoder = (this.sensors.rightEncoder || 0) + vr * dt * (TICKS_PER_SPEED_SEC / 50);
        
        this.updateSensors();
    }
    
    updateSensors() {
        const x = Math.floor(this.robot.x);
        const y = Math.floor(this.robot.y);
        
        if (this.map.imageData) {
            const data = this.map.imageData.data;
            const checkAt = (worldX, worldY) => {
                let sum = 0, count = 0;
                const cx = Math.floor(worldX);
                const cy = Math.floor(worldY);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const px = cx + dx;
                        const py = cy + dy;
                        if (px < 0 || px >= MAP_WIDTH || py < 0 || py >= MAP_HEIGHT) continue;
                        const idx = (py * MAP_WIDTH + px) * 4;
                        sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                        count++;
                    }
                }
                const brightness = count ? sum / count : 255;
                return brightness < 120 ? 4095 : 0;
            };
            
            const rad = this.robot.angle * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            
            const leftX = this.robot.x + 22 * cos - 12 * sin;
            const leftY = this.robot.y - 22 * sin - 12 * cos;
            this.sensors.lineLeft = checkAt(leftX, leftY);
            
            const centerX = this.robot.x + 22 * cos;
            const centerY = this.robot.y - 22 * sin;
            this.sensors.lineCenter = checkAt(centerX, centerY);
            
            const rightX = this.robot.x + 22 * cos + 12 * sin;
            const rightY = this.robot.y - 22 * sin + 12 * cos;
            this.sensors.lineRight = checkAt(rightX, rightY);
        }
        
        this.sensors.ultrasonic = this.getUltrasonicDistance();
        
        this.sensors.camera = null;
        const rx = this.robot.x, ry = this.robot.y;
        for (const zone of this.cameraZones) {
            const zx = Number(zone.x), zy = Number(zone.y), zr = Number(zone.radius) || 25;
            if (Number.isFinite(zx) && Number.isFinite(zy) && zr > 0 &&
                Math.hypot(rx - zx, ry - zy) < zr) {
                this.sensors.camera = zone.sign != null ? String(zone.sign) : null;
                break;
            }
        }
        
        this.sensors.photoresistor = 0;
        const lampList = this.customMapData && this.customMapData.lamps && Array.isArray(this.customMapData.lamps) && this.customMapData.lamps.length > 0
            ? this.customMapData.lamps
            : [{ x: MAP_WIDTH / 2, y: Math.round(MAP_HEIGHT * 0.283), radius: Math.round(120 * (Math.min(MAP_WIDTH, MAP_HEIGHT) / 600)) }];
        for (const lamp of lampList) {
            const lx = Number(lamp.x), ly = Number(lamp.y), lr = Number(lamp.radius) > 0 ? Number(lamp.radius) : 120;
            if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
            const distToLamp = Math.hypot(this.robot.x - lx, this.robot.y - ly);
            if (distToLamp < lr) {
                const value = Math.floor(4095 * (1 - distToLamp / lr));
                if (value > this.sensors.photoresistor) this.sensors.photoresistor = value;
            }
        }
    }
    
    getUltrasonicDistance() {
        const x = this.robot.x;
        const y = this.robot.y;
        const angle = this.robot.angle * Math.PI / 180;
        const maxDist = 400;
        const stepSize = 3;
        const fov = 25 * Math.PI / 180;
        
        let minDist = maxDist;
        
        const obstacles = this.customMapData && this.customMapData.ultrasonicObstacles && Array.isArray(this.customMapData.ultrasonicObstacles)
            ? this.customMapData.ultrasonicObstacles
            : [];
        
        for (let da = -fov; da <= fov; da += fov / 5) {
            const rayAngle = angle + da;
            const dx = Math.cos(rayAngle);
            const dy = -Math.sin(rayAngle);
            let rayMinDist = maxDist;
            
            for (const obs of obstacles) {
                const ox = Number(obs.x) || 0;
                const oy = Number(obs.y) || 0;
                const or = Number(obs.radius) || 30;
                
                const toObstacleX = ox - x;
                const toObstacleY = oy - y;
                const distToCenter = Math.hypot(toObstacleX, toObstacleY);
                
                const proj = toObstacleX * dx + toObstacleY * dy;
                
                if (proj > 0) {
                    const distToRay = Math.sqrt(distToCenter * distToCenter - proj * proj);
                    
                    if (distToRay <= or) {
                        const distToObstacle = proj - Math.sqrt(or * or - distToRay * distToRay);
                        if (distToObstacle >= 0 && distToObstacle < rayMinDist) {
                            rayMinDist = distToObstacle;
                        }
                    }
                }
            }
            
            if (rayMinDist >= maxDist && this.map.imageData) {
                for (let dist = 0; dist < maxDist; dist += stepSize) {
                    const cx = Math.floor(x + dx * dist);
                    const cy = Math.floor(y + dy * dist);
                    
                    if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) {
                        rayMinDist = Math.min(rayMinDist, dist);
                        break;
                    }
                    
                    const idx = (cy * MAP_WIDTH + cx) * 4;
                    const r = this.map.imageData.data[idx];
                    const g = this.map.imageData.data[idx + 1];
                    const b = this.map.imageData.data[idx + 2];
                    
                    if (r > 150 && g < 100 && b < 100) {
                        rayMinDist = Math.min(rayMinDist, dist);
                        break;
                    }
                }
            }
            
            minDist = Math.min(minDist, rayMinDist);
        }
        
        return minDist;
    }
    
    draw() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        
        if (this.map.imageData) {
            this.ctx.putImageData(this.map.imageData, 0, 0);
        }
        
        if (this.cameraZones && this.cameraZones.length > 0) {
            this.cameraZones.forEach(z => {
                const zx = Number(z.x), zy = Number(z.y), zr = Number(z.radius) || 25;
                if (!Number.isFinite(zx) || !Number.isFinite(zy) || zr <= 0) return;
                if (z.sign === 'GREEN') {
                    this.ctx.fillStyle = 'rgba(0, 200, 0, 0.35)';
                    this.ctx.strokeStyle = '#00aa00';
                } else if (z.sign === 'STOP') {
                    this.ctx.fillStyle = 'rgba(220, 0, 0, 0.35)';
                    this.ctx.strokeStyle = '#cc0000';
                } else if (z.sign === 'RIGHT') {
                    this.ctx.fillStyle = 'rgba(255, 200, 0, 0.35)';
                    this.ctx.strokeStyle = '#cc9900';
                } else {
                    this.ctx.fillStyle = 'rgba(128, 128, 128, 0.35)';
                    this.ctx.strokeStyle = '#666';
                }
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(zx, zy, zr, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                this.ctx.fillStyle = '#000';
                this.ctx.font = 'bold 14px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                const label = z.sign === 'RIGHT' ? 'R' : z.sign === 'STOP' ? 'S' : z.sign === 'GREEN' ? 'G' : z.sign || '?';
                this.ctx.fillText(label, zx, zy);
            });
        }
        
        if (this.customMapData && this.customMapData.ultrasonicObstacles && Array.isArray(this.customMapData.ultrasonicObstacles) && this.customMapData.ultrasonicObstacles.length > 0) {
            this.customMapData.ultrasonicObstacles.forEach(obs => {
                const ox = Number(obs.x), oy = Number(obs.y), or = Number(obs.radius) || 30;
                if (!Number.isFinite(ox) || !Number.isFinite(oy)) return;
                this.ctx.fillStyle = 'rgba(220, 0, 0, 0.5)';
                this.ctx.strokeStyle = '#cc0000';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(ox, oy, or, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                this.ctx.fillStyle = '#fff';
                this.ctx.font = 'bold 14px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('S', ox, oy);
            });
        }
        
        if (this.customMapData && this.customMapData.lamps && Array.isArray(this.customMapData.lamps) && this.customMapData.lamps.length > 0) {
            this.customMapData.lamps.forEach(lamp => {
                const lx = Number(lamp.x), ly = Number(lamp.y), lr = Math.min(18, (Number(lamp.radius) || 120) / 5);
                if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;
                this.ctx.fillStyle = '#ffff00';
                this.ctx.strokeStyle = '#cc9900';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(lx, ly, lr, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            });
        }
        
        this.ctx.strokeStyle = '#e6e6e6';
        this.ctx.lineWidth = 1;
        const gridStepX = MAP_WIDTH > 600 ? Math.round(MAP_WIDTH / 8) : 100;
        const gridStepY = MAP_HEIGHT > 500 ? Math.round(MAP_HEIGHT / 6) : 100;
        for (let i = 0; i <= MAP_WIDTH; i += gridStepX) {
            this.ctx.beginPath();
            this.ctx.moveTo(i, 0);
            this.ctx.lineTo(i, MAP_HEIGHT);
            this.ctx.stroke();
        }
        for (let i = 0; i <= MAP_HEIGHT; i += gridStepY) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i);
            this.ctx.lineTo(MAP_WIDTH, i);
            this.ctx.stroke();
        }
        
        this.drawRobot();
        this.updateSensorPanel();
    }
    
    updateSensorPanel() {
        const el = document.getElementById('sensorPanel');
        if (!el) return;
        const s = this.sensors;
        el.innerHTML = `
            <div class="sensor-panel-title">${this.paused ? '⏸ ПАУЗА' : '▶ РАБОТАЕТ'}</div>
            <div class="sensor-panel-section">Датчики линии</div>
            <div class="sensor-row"><span>Линия L:</span> <strong>${s.lineLeft}</strong></div>
            <div class="sensor-row"><span>Линия C:</span> <strong>${s.lineCenter}</strong></div>
            <div class="sensor-row"><span>Линия R:</span> <strong>${s.lineRight}</strong></div>
            <div class="sensor-panel-section">Расстояние / свет</div>
            <div class="sensor-row"><span>Сонар:</span> <strong>${typeof s.ultrasonic === 'number' ? s.ultrasonic.toFixed(1) : s.ultrasonic} см</strong></div>
            <div class="sensor-row"><span>Фоторезистор:</span> <strong>${s.photoresistor}</strong></div>
            <div class="sensor-panel-section">Энкодеры</div>
            <div class="sensor-row"><span>Левый:</span> <strong>${Math.round(s.leftEncoder ?? 0)}</strong></div>
            <div class="sensor-row"><span>Правый:</span> <strong>${Math.round(s.rightEncoder ?? 0)}</strong></div>
            <div class="sensor-panel-section">Камера</div>
            <div class="sensor-row"><span>Знак:</span> <strong>${s.camera || '—'}</strong></div>
        `;
    }
    
    drawRobot() {
        const x = this.robot.x;
        const y = this.robot.y;
        const angle = this.robot.angle * Math.PI / 180;
        
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(-angle);
        
        this.ctx.fillStyle = '#329966';
        this.ctx.fillRect(-20, -15, 40, 30);

        // Колёса
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(-15, -18, 12, 6);
        this.ctx.fillRect(3, -18, 12, 6);
        this.ctx.fillRect(-15, 12, 12, 6);
        this.ctx.fillRect(3, 12, 12, 6);

        // Кнопка робота на корпусе (по центру зелёного прямоугольника)
        const isPressed = this.buttonState && this.buttonState._pressed;
        const btnRadiusOuter = 7;
        const btnRadiusInner = isPressed ? 4 : 5;
        const btnX = 8;
        const btnY = isPressed ? 0 : 1;

        // Внешний контур кнопки
        this.ctx.beginPath();
        this.ctx.arc(btnX, btnY, btnRadiusOuter, 0, Math.PI * 2);
        this.ctx.fillStyle = isPressed ? '#555555' : '#808080';
        this.ctx.fill();

        // Внутренняя часть кнопки (цвет по состоянию)
        this.ctx.beginPath();
        this.ctx.arc(btnX, btnY - (isPressed ? 1 : 2), btnRadiusInner, 0, Math.PI * 2);
        this.ctx.fillStyle = isPressed ? '#ff5252' : '#ffeb3b';
        this.ctx.fill();

        // Блик на кнопке, чтобы выглядела объёмной
        this.ctx.beginPath();
        this.ctx.arc(btnX - 2, btnY - (isPressed ? 3 : 4), 2, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255,255,255,0.7)';
        this.ctx.fill();
        
        const sensors = [
            {x: 22, y: -12, val: this.sensors.lineLeft},
            {x: 22, y: 0, val: this.sensors.lineCenter},
            {x: 22, y: 12, val: this.sensors.lineRight}
        ];
        
        sensors.forEach(s => {
            this.ctx.fillStyle = s.val > 2000 ? '#ff0000' : '#00ff00';
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        });
        
        const leds = this.bot && this.bot.leds ? this.bot.leds : null;
        if (leds && leds.pixels) {
            for (let i = 0; i < 4; i++) {
                const ledAngle = (150 + i * 20) * Math.PI / 180;
                const ledX = Math.cos(ledAngle) * 12;
                const ledY = -Math.sin(ledAngle) * 12;
                const c = leds.pixels[i];
                const r = (c && c[0] !== undefined) ? c[0] : 0;
                const g = (c && c[1] !== undefined) ? c[1] : 0;
                const b = (c && c[2] !== undefined) ? c[2] : 0;
                this.ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                this.ctx.beginPath();
                this.ctx.arc(ledX, ledY, 3, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        this.ctx.restore();
    }
    
    animate() {
        const now = performance.now();
        const dt = this.lastTime ? (now - this.lastTime) / 1000 : 0.016;
        this.lastTime = now;
        
        this.updatePhysics(dt);
        this.draw();
        
        if (this.running) {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        }
    }
}
