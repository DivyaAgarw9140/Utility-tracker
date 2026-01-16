const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const fs = require('fs'); // <--- NODE.JS FILE SYSTEM MODULE
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- SETUP LOGGING FOLDER ---
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR); // Create "logs" folder if it doesn't exist
}

// --- GLOBAL MEMORY ---
let lastLocations = {}; 
let safetyTimers = {};
let dangerZones = []; // <--- SERVER SIDE DANGER DATABASE

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/track', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- FEATURE: REPORT DANGER API ---
app.post('/api/report-danger', (req, res) => {
    const { lat, lng, type } = req.body;
    // Add to server memory
    dangerZones.push({ lat, lng, type, time: Date.now() });
    console.log(`⚠️ NEW DANGER REPORTED: ${type} at ${lat}, ${lng}`);
    
    // Broadcast marker to everyone so they see it on map
    io.emit('new-hazard', { lat, lng, type });
    res.json({ status: 'reported', count: dangerZones.length });
});

// --- FEATURE: SAFE TIMER API ---
app.post('/api/start-timer', (req, res) => {
    const { socketId, minutes } = req.body;
    if (safetyTimers[socketId]) clearTimeout(safetyTimers[socketId]);
    
    // Server-side logging
    logEvent(socketId, `TIMER_START: ${minutes} mins`);

    safetyTimers[socketId] = setTimeout(() => {
        logEvent(socketId, `TIMER_EXPIRED: SOS TRIGGERED`);
        io.emit('timer-alert', { id: socketId, msg: 'User Failed to Check-In!' }); 
    }, minutes * 60000);

    res.json({ status: 'started' });
});

app.post('/api/stop-timer', (req, res) => {
    const { socketId } = req.body;
    if (safetyTimers[socketId]) {
        clearTimeout(safetyTimers[socketId]);
        delete safetyTimers[socketId];
        logEvent(socketId, `TIMER_STOPPED: SAFE`);
        res.json({ status: 'stopped' });
    } else {
        res.json({ status: 'no_timer' });
    }
});

// --- HELPER: BLACK BOX RECORDER ---
function logEvent(id, message) {
    const date = new Date().toISOString();
    const logLine = `[${date}] ${message}\n`;
    // Appends data to a file named after the socket ID
    fs.appendFile(path.join(LOG_DIR, `${id}.txt`), logLine, (err) => {
        if (err) console.error("Log Error:", err);
    });
}

// --- HELPER: SERVER-SIDE DISTANCE CALC ---
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2)*Math.sin(Δφ/2) + Math.cos(φ1)*Math.cos(φ2) * Math.sin(Δλ/2)*Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    logEvent(socket.id, "SESSION_STARTED");

    // 1. Send existing locations & Dangers to new user
    socket.emit('sync-dangers', dangerZones); // <--- Sync hazards
    Object.keys(lastLocations).forEach((id) => {
        if (id !== socket.id) socket.emit('receive-location', { id, ...lastLocations[id] });
    });

    // 2. Handle Location Updates + SERVER SIDE GEOFENCING
    socket.on('send-location', (data) => {
        lastLocations[socket.id] = data;
        
        // A. Black Box Logging
        logEvent(socket.id, `LOC: ${data.lat}, ${data.lng} | BAT: ${data.status || 'OK'}`);

        // B. Danger Zone Check (Server Logic)
        dangerZones.forEach(zone => {
            const dist = getDistance(data.lat, data.lng, zone.lat, zone.lng);
            if(dist < 100) { // If closer than 100 meters
                // Emit warning specifically to this user
                socket.emit('danger-proximity', { type: zone.type, dist: Math.round(dist) });
            }
        });

        io.emit('receive-location', { id: socket.id, ...data });
    });

    // 3. SOS
    socket.on('signal-sos', () => {
        console.log(`🚨 SOS FROM ${socket.id}`);
        logEvent(socket.id, `!!! SOS SIGNAL TRIGGERED !!!`);
        socket.broadcast.emit('receive-sos', socket.id);
    });

    // 4. Private Rooms
    socket.on('join-session', (room) => socket.join(room));
    socket.on('send-private-location', (data) => socket.to(data.roomId).emit('receive-private-location', data));

    socket.on('disconnect', () => {
        logEvent(socket.id, "DISCONNECTED");
        delete lastLocations[socket.id];
        io.emit('user-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));