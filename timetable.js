// Line configurations
const lineConfig = {
    'A': {
        name: 'Linha A',
        color: '#199FDA',
        terminals: {
            forward: 'Estádio do Dragão',
            backward: 'Senhor de Matosinhos'
        },
        image: 'https://www.metrodoporto.pt/uploads/document/file/416/esta__o_esta_dio_do_drag_o.jpg',
        route_id: 'A'
    },
    'B': {
        name: 'Linha B',
        color: '#C63920',
        terminals: {
            forward: 'Estádio do Dragão',
            backward: 'Póvoa de Varzim'
        },
        image: 'https://www.metrodoporto.pt/uploads/document/file/384/povoa_de_varzim.jpg',
        route_id: 'B'
    },
    'C': {
        name: 'Linha C',
        color: '#A3BE31',
        terminals: {
            forward: 'Campanhã',
            backward: 'ISMAI'
        },
        image: 'https://www.metrodoporto.pt/uploads/document/file/401/ismai.jpg',
        route_id: 'C'
    },
    'D': {
        name: 'Linha D',
        color: '#EBBC14',
        terminals: {
            forward: 'Hospital São João',
            backward: 'Santo Ovídio'
        },
        image: 'https://www.metrodoporto.pt/uploads/document/file/397/santo_ovidio.jpg',
        route_id: 'D'
    },
    'E': {
        name: 'Linha E',
        color: '#736EB0',
        terminals: {
            forward: 'Estádio do Dragão',
            backward: 'Aeroporto'
        },
        image: 'https://www.metrodoporto.pt/uploads/document/file/382/aeroporto.jpg',
        route_id: 'E'
    },
    'F': {
        name: 'Linha F',
        color: '#EE731C',
        terminals: {
            forward: 'Fânzeres',
            backward: 'Senhora da Hora'
        },
        image: 'https://www.metrodoporto.pt/uploads/document/file/391/fanzeres.jpg',
        route_id: 'F'
    }
};

// Current state
let currentLine = 'A';
let currentServiceType = 'U'; // Default to weekday service
let isForward = true;
let stopsData = null;
let tripsData = null;
let stopTimesData = null;
let calendarData = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    loadGTFSData().then(() => {
        selectLine('A');
        updateServiceTypeButtons();
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

// Handle line selection
function selectLine(line) {
    currentLine = line;
    updateHeader();
    loadTimetable();

    // Update active state of line buttons
    document.querySelectorAll('[onclick^="selectLine"]').forEach(button => {
        button.classList.remove('ring-4');
        if (button.textContent.includes(line)) {
            button.classList.add('ring-4');
        }
    });
}

// Toggle direction
function toggleDirection() {
    isForward = !isForward;
    updateHeader();
    loadTimetable();
}

// Update header information
function updateHeader() {
    const config = lineConfig[currentLine];
    const header = document.getElementById('line-header');
    const directionText = document.getElementById('direction-text');
    
    // Update header background
    header.querySelector('.line-header').style.backgroundImage = `url('${config.image}')`;
    
    // Update title and direction
    header.querySelector('h1').textContent = config.name;
    directionText.textContent = `Sentido ${isForward ? config.terminals.forward : config.terminals.backward}`;

    // Update header color theme
    header.style.borderTop = `4px solid ${config.color}`;
}

// Handle service type selection
function selectServiceType(type) {
    currentServiceType = type;
    updateServiceTypeButtons();
    loadTimetable();
}

// Update service type button states
function updateServiceTypeButtons() {
    const types = ['U', 'S', 'DF'];
    types.forEach(type => {
        const button = document.getElementById(`service-${type === 'U' ? 'weekday' : type === 'S' ? 'saturday' : 'sunday'}`);
        if (button) {
            button.classList.toggle('btn-active', currentServiceType === type);
        }
    });
}

// Get trips for current line and direction
function getLineTrips() {
    const config = lineConfig[currentLine];
    const validServiceIds = calendarData
        .filter(cal => cal.service_id.endsWith(currentServiceType))
        .map(cal => cal.service_id);

    return tripsData.filter(trip => 
        trip.route_id === config.route_id && 
        trip.direction_id === (isForward ? '1' : '0') &&
        validServiceIds.includes(trip.service_id)
    );
}

// Get stops for a specific trip
function getTripStops(tripId) {
    return stopTimesData
        .filter(st => st.trip_id === tripId)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence))
        .map(st => {
            const stop = stopsData.find(s => s.stop_id === st.stop_id);
            return {
                ...st,
                stop_name: stop ? stop.stop_name : 'Unknown Stop'
            };
        });
}

// Get unique stops for the current line and direction
function getLineStops() {
    const trips = getLineTrips();
    if (trips.length === 0) return [];

    // Use the first trip to get the stop sequence
    const firstTripStops = getTripStops(trips[0].trip_id);
    return firstTripStops;
}

// Get departure times for a specific stop
function getStopTimes(stopId) {
    const trips = getLineTrips();
    
    return stopTimesData
        .filter(st => 
            st.stop_id === stopId && 
            trips.some(trip => trip.trip_id === st.trip_id)
        )
        .map(st => ({
            displayTime: formatDisplayTime(st.departure_time),
            sortTime: st.departure_time // Keep original 24/25 format for sorting
        }))
        .sort((a, b) => {
            // Sort based on the original time format (keeping 24:XX and 25:XX)
            const [hoursA] = a.sortTime.split(':').map(Number);
            const [hoursB] = b.sortTime.split(':').map(Number);
            if (hoursA !== hoursB) return hoursA - hoursB;
            
            // If hours are equal, compare minutes
            const [, minutesA] = a.sortTime.split(':').map(Number);
            const [, minutesB] = b.sortTime.split(':').map(Number);
            return minutesA - minutesB;
        })
        .map(t => t.displayTime);
}

// Format time for display (convert 24:XX and 25:XX to 00:XX and 01:XX)
function formatDisplayTime(time) {
    const [hours, minutes] = time.split(':').map(Number);
    let displayHours = hours;
    if (hours >= 24) {
        displayHours = hours - 24;
    }
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Load timetable data
function loadTimetable() {
    const tableBody = document.getElementById('timetable-body');
    tableBody.innerHTML = '';

    if (!stopsData || !tripsData || !stopTimesData) {
        console.error('GTFS data not loaded yet');
        return;
    }

    const stops = getLineStops();
    
    // Get all times for the first stop to determine the number of columns needed
    const firstStopTimes = stops.length > 0 ? getStopTimes(stops[0].stop_id) : [];
    const numColumns = firstStopTimes.length;

    // Update the header to show the correct number of columns
    updateTableHeader(numColumns);

    // Add rows for each stop
    stops.forEach(stop => {
        const times = getStopTimes(stop.stop_id);
        addStationRow(stop.stop_name, times, numColumns);
    });
}

// Update table header
function updateTableHeader(numColumns) {
    const thead = document.querySelector('table thead tr');
    thead.innerHTML = ''; // Clear existing header

    // Add station column header
    const stationHeader = document.createElement('th');
    stationHeader.className = 'station-column';
    stationHeader.textContent = 'Estação';
    thead.appendChild(stationHeader);

    // Add individual time column headers
    for (let i = 0; i < numColumns; i++) {
        const timeHeader = document.createElement('th');
        timeHeader.className = 'text-center time-cell';
        timeHeader.textContent = '';
        thead.appendChild(timeHeader);
    }
}

// Add a row to the timetable
function addStationRow(stationName, times, numColumns) {
    const tableBody = document.getElementById('timetable-body');
    const row = document.createElement('tr');
    
    // Add station name
    const stationCell = document.createElement('td');
    stationCell.className = 'station-column font-medium';
    stationCell.textContent = stationName;
    row.appendChild(stationCell);

    // Add times
    if (times.length === 0) {
        const timeCell = document.createElement('td');
        timeCell.className = 'text-center time-cell';
        timeCell.textContent = 'Sem horários disponíveis';
        timeCell.colSpan = numColumns;
        row.appendChild(timeCell);
    } else {
        times.forEach(time => {
            const timeCell = document.createElement('td');
            timeCell.className = 'text-center time-cell';
            timeCell.textContent = time;
            row.appendChild(timeCell);
        });
    }

    tableBody.appendChild(row);
}

// Theme switcher
document.querySelector('.theme-controller').addEventListener('change', function(e) {
    document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
}); 