// Global state
let stopsData = null;
let tripsData = null;
let stopTimesData = null;
let calendarData = null;
let map = null;
let markers = [];
let polylines = [];
let currentLinePolyline = null;

// Line configurations
const lineConfigs = {
    'A': { color: '#199FDA', terminals: ['Dragão', 'Matosinhos'] },
    'B': { color: '#C63920', terminals: ['Dragão', 'Póvoa'] },
    'C': { color: '#A3BE31', terminals: ['Campanhã', 'ISMAI'] },
    'D': { color: '#EBBC14', terminals: ['S. João', 'St. Ovídio'] },
    'E': { color: '#736EB0', terminals: ['Dragão', 'Aeroporto'] },
    'F': { color: '#EE731C', terminals: ['Fânzeres', 'Sra. Hora'] }
};

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    loadGTFSData().then(() => {
        populateStationDropdowns();
        setDefaultDateTime();
        initializeLineCards();
    });
});

// Initialize line cards
function initializeLineCards() {
    document.querySelectorAll('.card').forEach(card => {
        const lineText = card.querySelector('h3')?.textContent;
        if (lineText && lineText.startsWith('Linha ')) {
            const line = lineText.split(' ')[1];
            card.addEventListener('click', () => showLine(line));
        }
    });
}

// Show line on map
function showLine(line) {
    // Clear existing line if any
    if (currentLinePolyline) {
        map.removeLayer(currentLinePolyline);
    }

    // Get all trips for this line
    const lineTrips = tripsData.filter(trip => trip.route_id === line);
    if (lineTrips.length === 0) return;

    // Get the first trip to get the sequence of stops
    const firstTrip = lineTrips[0];
    const stopSequence = stopTimesData
        .filter(st => st.trip_id === firstTrip.trip_id)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

    // Get coordinates for each stop
    const coordinates = stopSequence.map(st => {
        const stop = stopsData.find(s => s.stop_id === st.stop_id);
        return [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)];
    });

    // Create and add the polyline
    const config = lineConfigs[line];
    currentLinePolyline = L.polyline(coordinates, {
        color: config.color,
        weight: 4,
        opacity: 0.8
    }).addTo(map);

    // Fit map to show the entire line
    map.fitBounds(currentLinePolyline.getBounds(), { padding: [50, 50] });
}

// Show trip path on map
function showTripPath(tripId, originId, destinationId) {
    // Clear existing polylines
    polylines.forEach(line => map.removeLayer(line));
    polylines = [];

    // Get all stops for this trip between origin and destination
    const tripStops = stopTimesData
        .filter(st => st.trip_id === tripId)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

    // Find start and end indices
    const originIndex = tripStops.findIndex(st => st.stop_id === originId);
    const destinationIndex = tripStops.findIndex(st => st.stop_id === destinationId);

    if (originIndex === -1 || destinationIndex === -1) return;

    // Get the relevant section of stops
    const relevantStops = tripStops.slice(
        Math.min(originIndex, destinationIndex),
        Math.max(originIndex, destinationIndex) + 1
    );

    // Get coordinates for the path
    const coordinates = relevantStops.map(st => {
        const stop = stopsData.find(s => s.stop_id === st.stop_id);
        return [parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)];
    });

    // Get the line color from the trip
    const trip = tripsData.find(t => t.trip_id === tripId);
    const lineColor = lineConfigs[trip.route_id]?.color || '#570df8';

    // Create and add the polyline
    const tripPath = L.polyline(coordinates, {
        color: lineColor,
        weight: 5,
        opacity: 0.8
    }).addTo(map);
    polylines.push(tripPath);

    // Fit map to show the entire path
    map.fitBounds(tripPath.getBounds(), { padding: [50, 50] });
}

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
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    const originDropdown = document.getElementById('origin-dropdown');
    const destinationDropdown = document.getElementById('destination-dropdown');
    
    // Create sorted station names array
    const stationNames = stopsData
        .map(stop => stop.stop_name)
        .sort((a, b) => a.localeCompare(b, 'pt'));

    // Setup dropdowns
    setupDropdown(originInput, originDropdown, stationNames);
    setupDropdown(destinationInput, destinationDropdown, stationNames);

    // Add markers to map
    stopsData.forEach(stop => {
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

// Setup dropdown functionality
function setupDropdown(input, dropdown, items) {
    let selectedIndex = -1;
    let filteredItems = items;

    // Function to update dropdown content
    function updateDropdown(filterText = '') {
        dropdown.innerHTML = '';
        filteredItems = items.filter(item => 
            item.toLowerCase().includes(filterText.toLowerCase())
        );

        filteredItems.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `dropdown-item ${index === selectedIndex ? 'selected' : ''}`;
            div.textContent = item;
            div.onclick = () => {
                input.value = item;
                hideDropdown();
                input.dispatchEvent(new Event('change'));
            };
            dropdown.appendChild(div);
        });

        if (filteredItems.length > 0) {
            showDropdown();
        } else {
            hideDropdown();
        }
    }

    // Show dropdown
    function showDropdown() {
        dropdown.classList.remove('hidden');
    }

    // Hide dropdown
    function hideDropdown() {
        dropdown.classList.add('hidden');
        selectedIndex = -1;
    }

    // Input event listeners
    input.addEventListener('input', (e) => {
        selectedIndex = -1;
        updateDropdown(e.target.value);
    });

    input.addEventListener('focus', () => {
        updateDropdown(input.value);
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
        if (filteredItems.length === 0) return;

        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1);
                updateDropdown(input.value);
                break;
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateDropdown(input.value);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0) {
                    input.value = filteredItems[selectedIndex];
                    hideDropdown();
                    input.dispatchEvent(new Event('change'));
                }
                break;
            case 'Escape':
                hideDropdown();
                break;
        }
    });

    // Handle click outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });

    // Validate on change
    input.addEventListener('change', function() {
        const value = this.value;
        const isValid = items.includes(value);
        if (!isValid) {
            this.setCustomValidity('Por favor, selecione uma estação válida da lista.');
        } else {
            this.setCustomValidity('');
        }
    });
}

// Set default date and time
function setDefaultDateTime() {
    const now = new Date();
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('time');
    
    // Set date (yyyy-mm-dd)
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // Set time (HH:mm)
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hh}:${min}`;
}

// Set origin from map
function setOrigin(stopId) {
    const originInput = document.getElementById('origin');
    const station = stopsData.find(stop => stop.stop_id === stopId);
    if (station) {
        originInput.value = station.stop_name;
    }
}

// Set destination from map
function setDestination(stopId) {
    const destinationInput = document.getElementById('destination');
    const station = stopsData.find(stop => stop.stop_id === stopId);
    if (station) {
        destinationInput.value = station.stop_name;
    }
}

// Invert origin and destination
function invertStations() {
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    const tempValue = originInput.value;
    
    originInput.value = destinationInput.value;
    destinationInput.value = tempValue;
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
    
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    
    // Find station IDs from selected names
    const originStation = stopsData.find(stop => stop.stop_name === originInput.value);
    const destinationStation = stopsData.find(stop => stop.stop_name === destinationInput.value);
    
    if (!originStation || !destinationStation) {
        alert('Por favor, selecione estações válidas.');
        return;
    }
    
    const dateStr = document.getElementById('date').value;
    const timeStr = document.getElementById('time').value;
    
    const datetime = new Date(`${dateStr}T${timeStr}`);
    const departures = findNextDepartures(originStation.stop_id, destinationStation.stop_id, datetime);
    
    // Display results
    displayResults(departures, originStation.stop_id, destinationStation.stop_id);
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
        div.className = 'flex justify-between items-center p-2 bg-base-200 rounded-lg cursor-pointer hover:bg-base-300';
        div.onclick = () => showTripPath(dep.tripId, originId, destinationId);
        div.innerHTML = `
            <div>
                <div class="font-bold">${departureTime} → ${arrivalTime}</div>
                <div class="text-sm opacity-70">Linha ${dep.route}</div>
            </div>
            <div class="badge badge-primary">${calculateDuration(dep.departureTime, dep.arrivalTime)} min</div>
        `;
        departuresDiv.appendChild(div);
    });

    // Show the first trip's path by default
    if (departures.length > 0) {
        showTripPath(departures[0].tripId, originId, destinationId);
        
        document.getElementById('journey-time').textContent = 
            `${calculateDuration(departures[0].departureTime, departures[0].arrivalTime)} min`;
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