const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// This tells the server to look for index.html and script.js inside the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let deviceA = null; 
let deviceB = null; 

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  if (!deviceA) {
    deviceA = socket.id;
    socket.emit('assign-role', 'A');
    console.log(socket.id + ' assigned as Device A');
  } else if (!deviceB) {
    deviceB = socket.id;
    socket.emit('assign-role', 'B');
    console.log(socket.id + ' assigned as Device B');
  } else {
    socket.emit('assign-role', 'spectator');
  }

  socket.on('send-location', (data) => {
    io.emit('receive-location', { id: socket.id, ...data });
  });

  socket.on('disconnect', () => {
    if (socket.id === deviceA) {
      deviceA = null;
      console.log('Device A disconnected');
    }
    if (socket.id === deviceB) {
      deviceB = null;
      console.log('Device B disconnected');
    }
    io.emit('user-disconnected', socket.id);
  });
});

const PORT = 8000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});