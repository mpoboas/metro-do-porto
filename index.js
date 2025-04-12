// Global state
let stopsData = null;
let tripsData = null;
let stopTimesData = null;
let calendarData = null;
let map = null;
let markers = [];
let polylines = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    loadGTFSData().then(() => {
        populateStationDropdowns();
        setDefaultDateTime();
    });
});

// Load GTFS data
async function loadGTFSData() {
    try {
        // Load stops data
        const stopsResponse = await fetch('data/stops.txt');
        const stopsText = await stopsResponse.text();
        stopsData = parseCSV(stopsText);

        // Load trips data
        const tripsResponse = await fetch('data/trips.txt');
        const tripsText = await tripsResponse.text();
        tripsData = parseCSV(tripsText);

        // Load stop times data
        const stopTimesResponse = await fetch('data/stop_times.txt');
        const stopTimesText = await stopTimesResponse.text();
        stopTimesData = parseCSV(stopTimesText);

        // Load calendar data
        const calendarResponse = await fetch('data/calendar.txt');
        const calendarText = await calendarResponse.text();
        calendarData = parseCSV(calendarText);
    } catch (error) {
        console.error('Error loading GTFS data:', error);
    }
}

// Parse CSV data
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index];
        });
        return obj;
    });
}

// Initialize map
function initializeMap() {
    map = L.map('map').setView([41.15, -8.61], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Populate station dropdowns
function populateStationDropdowns() {
    const originSelect = document.getElementById('origin');
    const destinationSelect = document.getElementById('destination');
    
    // Clear existing options
    originSelect.innerHTML = '<option value="" disabled selected>Selecione a estação</option>';
    destinationSelect.innerHTML = '<option value="" disabled selected>Selecione a estação</option>';
    
    // Add stations
    stopsData.forEach(stop => {
        const option = document.createElement('option');
        option.value = stop.stop_id;
        option.textContent = stop.stop_name;
        
        originSelect.appendChild(option.cloneNode(true));
        destinationSelect.appendChild(option);

        // Add marker to map
        const marker = L.marker([stop.stop_lat, stop.stop_lon])
            .bindPopup(`
                <strong>${stop.stop_name}</strong><br>
                <button onclick="setOrigin('${stop.stop_id}')">Partir daqui</button><br>
                <button onclick="setDestination('${stop.stop_id}')">Chegar aqui</button>
            `);
        markers.push(marker);
        marker.addTo(map);
    });
}

// Set default date and time
function setDefaultDateTime() {
    const now = new Date();
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('time');
    
    // Set date
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // Set time
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${min}`;
}

// Set origin from map
function setOrigin(stopId) {
    document.getElementById('origin').value = stopId;
}

// Set destination from map
function setDestination(stopId) {
    document.getElementById('destination').value = stopId;
}

// Invert origin and destination
function invertStations() {
    const originSelect = document.getElementById('origin');
    const destinationSelect = document.getElementById('destination');
    const tempValue = originSelect.value;
    
    originSelect.value = destinationSelect.value;
    destinationSelect.value = tempValue;
}

// Get service type based on date
function getServiceType(date) {
    const day = date.getDay();
    if (day === 0) return 'DF'; // Sunday
    if (day === 6) return 'S';  // Saturday
    return 'U';                 // Weekday
}

// Find next departures
function findNextDepartures(originId, destinationId, datetime) {
    const serviceType = getServiceType(datetime);
    const validServiceIds = calendarData
        .filter(cal => cal.service_id.endsWith(serviceType))
        .map(cal => cal.service_id);

    // Convert search time to minutes for comparison
    const searchTimeMinutes = datetime.getHours() * 60 + datetime.getMinutes();

    // Get all trips that serve both stations
    const relevantTrips = tripsData.filter(trip => 
        validServiceIds.includes(trip.service_id) &&
        stopTimesData.some(st => st.trip_id === trip.trip_id && st.stop_id === originId) &&
        stopTimesData.some(st => st.trip_id === trip.trip_id && st.stop_id === destinationId)
    );

    // Get departure times for each trip
    const departures = [];
    relevantTrips.forEach(trip => {
        const originStop = stopTimesData.find(st => st.trip_id === trip.trip_id && st.stop_id === originId);
        const destinationStop = stopTimesData.find(st => st.trip_id === trip.trip_id && st.stop_id === destinationId);
        
        if (originStop && destinationStop) {
            // Check if this is a valid sequence (origin comes before destination)
            const originTime = convertToMinutes(originStop.departure_time);
            const destinationTime = convertToMinutes(destinationStop.arrival_time);
            
            if (originTime < destinationTime || (originTime > 1380 && destinationTime < 180)) { // Handle day crossover
                departures.push({
                    tripId: trip.trip_id,
                    departureTime: originStop.departure_time,
                    arrivalTime: destinationStop.arrival_time,
                    route: trip.route_id,
                    timeInMinutes: originTime
                });
            }
        }
    });

    // Sort by departure time and handle wraparound
    departures.sort((a, b) => {
        let timeA = a.timeInMinutes;
        let timeB = b.timeInMinutes;
        
        // Adjust times for comparison with search time
        if (timeA < 180 && searchTimeMinutes > 1260) timeA += 1440; // Add 24h to early morning times
        if (timeB < 180 && searchTimeMinutes > 1260) timeB += 1440;
        
        return timeA - timeB;
    });

    // Filter to show only future departures
    const futureDepartures = departures.filter(dep => {
        let depTime = dep.timeInMinutes;
        if (depTime < 180 && searchTimeMinutes > 1260) depTime += 1440;
        return depTime >= searchTimeMinutes;
    });

    return futureDepartures;
}

// Convert HH:MM:SS to minutes since midnight
function convertToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// Format time for display
function formatTime(time) {
    const [hours, minutes] = time.split(':');
    let displayHours = parseInt(hours);
    if (displayHours >= 24) {
        displayHours -= 24;
    }
    return `${String(displayHours).padStart(2, '0')}:${minutes}`;
}

// Handle form submission
document.getElementById('journey-planner').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const originId = document.getElementById('origin').value;
    const destinationId = document.getElementById('destination').value;
    const dateStr = document.getElementById('date').value;
    const timeStr = document.getElementById('time').value;
    
    const datetime = new Date(`${dateStr}T${timeStr}`);
    const departures = findNextDepartures(originId, destinationId, datetime);
    
    // Display results
    displayResults(departures, originId, destinationId);
});

// Display journey results
function displayResults(departures, originId, destinationId) {
    const resultsDiv = document.getElementById('journey-results');
    const departuresDiv = document.getElementById('next-departures');
    
    resultsDiv.classList.remove('hidden');
    departuresDiv.innerHTML = '';
    
    if (departures.length === 0) {
        departuresDiv.innerHTML = '<div class="alert alert-warning">Não foram encontradas viagens para este percurso.</div>';
        return;
    }

    // Show next 5 departures
    departures.slice(0, 5).forEach(dep => {
        const departureTime = formatTime(dep.departureTime);
        const arrivalTime = formatTime(dep.arrivalTime);
        
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 bg-base-200 rounded-lg';
        div.innerHTML = `
            <div>
                <div class="font-bold">${departureTime} → ${arrivalTime}</div>
                <div class="text-sm opacity-70">Linha ${dep.route}</div>
            </div>
            <div class="badge badge-primary">${calculateDuration(dep.departureTime, dep.arrivalTime)} min</div>
        `;
        departuresDiv.appendChild(div);
    });

    // Update journey stats
    if (departures.length > 0) {
        const firstDeparture = departures[0];
        document.getElementById('journey-time').textContent = 
            `${calculateDuration(firstDeparture.departureTime, firstDeparture.arrivalTime)} min`;
        
        // Calculate and display distance (if you have the data)
        // document.getElementById('journey-distance').textContent = '...';
        
        // Update fare prices (if you have the data)
        // document.getElementById('price-occasional').textContent = '...';
        // document.getElementById('price-subscription').textContent = '...';
    }
}

// Calculate duration between two times
function calculateDuration(startTime, endTime) {
    let startMinutes = convertToMinutes(startTime);
    let endMinutes = convertToMinutes(endTime);
    
    // Handle day crossover
    if (endMinutes < startMinutes) {
        endMinutes += 1440; // Add 24 hours
    }
    
    return endMinutes - startMinutes;
}

// Theme switcher
document.querySelector('.theme-controller').addEventListener('change', function(e) {
    document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
}); 