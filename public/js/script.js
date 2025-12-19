const socket = io();

const map = L.map("map").setView([0, 0], 2);

// Add world map
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap"
}).addTo(map);
 if (navigator.geolocation) {
      navigator.geolocation.watchPosition((position) => {
        const { latitude, longitude } = position.coords;
        myLocation = { latitude, longitude };
        socket.emit('send-location', { latitude, longitude });
        updateDistance();
        
        // This will create your own marker if it doesn't exist
        if (!markers[socket.id]) {
           markers[socket.id] = L.marker([latitude, longitude]).addTo(map)
             .bindPopup('You (Device ' + myRole + ')').openPopup();
        } else {
           markers[socket.id].setLatLng([latitude, longitude]);
        }
      }, (err) => {
        // THIS IS THE IMPORTANT PART: It shows the error on the black box
        console.error(err);
        let errorMsg = "Location Error: ";
        if (err.code === 1) errorMsg += "Permission Denied. Check phone settings.";
        else if (err.code === 2) errorMsg += "Position Unavailable (No GPS signal).";
        else if (err.code === 3) errorMsg += "Timed out waiting for GPS.";
        else errorMsg += err.message;
        
        document.getElementById('overlay').textContent = errorMsg;
      }, {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
      });
    } else {
      document.getElementById('overlay').textContent = 'Geolocation not supported';
    }