// SOSupport Emergency Response System - Client-side JavaScript

// ============================================
// Constants
// ============================================

const STORAGE_KEYS = {
    RESOURCES: 'sosupport_resources',
    HISTORY: 'sosupport_history',
    USER: 'sosupport_user'
};

const DEFAULT_RESOURCES = {
    ambulances_108: 5,
    fire_tenders: 3,
    police_pcr: 4,
    ndrf_teams: 2,
    medical_teams: 2
};

const SEVERITY_LABELS = {
    1: 'Minor',
    2: 'Low',
    3: 'Moderate',
    4: 'High',
    5: 'Critical'
};

const INCIDENT_TYPE_LABELS = {
    'traffic_accident': 'Traffic Accident',
    'fire': 'Fire',
    'medical_emergency': 'Medical Emergency',
    'crime': 'Crime',
    'natural_disaster': 'Natural Disaster',
    'unknown': 'Unknown'
};

const RESOURCE_CONFIG = [
    { key: 'ambulances_108', name: '108 Ambulance', icon: '🚑', color: 'red', helpline: '108' },
    { key: 'fire_tenders', name: 'Fire Tender', icon: '🚒', color: 'orange', helpline: '101' },
    { key: 'police_pcr', name: 'Police PCR', icon: '🚔', color: 'blue', helpline: '100/112' },
    { key: 'ndrf_teams', name: 'NDRF Team', icon: '🛡️', color: 'green', helpline: 'NDRF' },
    { key: 'medical_teams', name: 'Medical Team', icon: '👨‍⚕️', color: 'teal', helpline: '104' }
];

const STATUS = {
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed'
};

// ============================================
// Storage Functions
// ============================================

function getResources() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.RESOURCES);
        return stored ? JSON.parse(stored) : { ...DEFAULT_RESOURCES };
    } catch (e) {
        console.error('Error reading resources:', e);
        return { ...DEFAULT_RESOURCES };
    }
}

function saveResources(resources) {
    try {
        localStorage.setItem(STORAGE_KEYS.RESOURCES, JSON.stringify(resources));
        return true;
    } catch (e) {
        console.error('Error saving resources:', e);
        return false;
    }
}

function getHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error reading history:', e);
        return [];
    }
}

function saveHistory(history) {
    try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
        return true;
    } catch (e) {
        console.error('Error saving history:', e);
        return false;
    }
}

function addToHistory(incident) {
    const history = getHistory();
    history.unshift({
        ...incident,
        id: Date.now(),
        timestamp: new Date().toISOString(),
        status: STATUS.IN_PROGRESS // All new incidents start as in_progress
    });
    // Keep only last 100 incidents
    if (history.length > 100) {
        history.pop();
    }
    saveHistory(history);
}

function updateIncidentStatus(id, newStatus) {
    const history = getHistory();
    const incident = history.find(item => item.id === id);
    if (incident) {
        const oldStatus = incident.status;
        incident.status = newStatus;
        
        // If marking as completed, release resources back to pool
        if (newStatus === STATUS.COMPLETED && oldStatus === STATUS.IN_PROGRESS && incident.dispatch) {
            releaseResources(incident.dispatch);
        }
        
        saveHistory(history);
        return true;
    }
    return false;
}

function deleteFromHistory(id) {
    const history = getHistory();
    const incident = history.find(item => item.id === id);
    
    // If deleting an in-progress incident, release its resources
    if (incident && incident.status === STATUS.IN_PROGRESS && incident.dispatch) {
        releaseResources(incident.dispatch);
    }
    
    const filtered = history.filter(item => item.id !== id);
    saveHistory(filtered);
    return filtered;
}

function clearHistory() {
    // Release all resources from in-progress incidents before clearing
    const history = getHistory();
    history.forEach(incident => {
        if (incident.status === STATUS.IN_PROGRESS && incident.dispatch) {
            releaseResources(incident.dispatch);
        }
    });
    saveHistory([]);
}

// ============================================
// Resource Management Functions
// ============================================

function deductResources(dispatch) {
    const resources = getResources();
    for (const [key, amount] of Object.entries(dispatch)) {
        if (resources[key] !== undefined && amount > 0) {
            resources[key] = Math.max(0, resources[key] - amount);
        }
    }
    saveResources(resources);
    return resources;
}

function releaseResources(dispatch) {
    const resources = getResources();
    for (const [key, amount] of Object.entries(dispatch)) {
        if (resources[key] !== undefined && amount > 0) {
            resources[key] = resources[key] + amount;
        }
    }
    saveResources(resources);
    return resources;
}

function getAvailableResources() {
    const resources = getResources();
    const history = getHistory();
    
    // Calculate resources currently in use by in-progress incidents
    const inUse = {
        ambulances_108: 0,
        fire_tenders: 0,
        police_pcr: 0,
        ndrf_teams: 0,
        medical_teams: 0
    };
    
    history.forEach(incident => {
        if (incident.status === STATUS.IN_PROGRESS && incident.dispatch) {
            for (const [key, amount] of Object.entries(incident.dispatch)) {
                if (inUse[key] !== undefined) {
                    inUse[key] += amount;
                }
            }
        }
    });
    
    // Return available = total - in use
    const available = {};
    for (const key of Object.keys(resources)) {
        available[key] = Math.max(0, resources[key] - inUse[key]);
    }
    
    return available;
}

// ============================================
// Authentication Functions
// ============================================

async function login(username, password) {
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
    }
    
    return data;
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
        console.error('Logout error:', e);
    }
    localStorage.removeItem(STORAGE_KEYS.USER);
    window.location.href = '/';
}

async function getCurrentUser() {
    try {
        const response = await fetch('/api/me');
        const data = await response.json();
        return data.success ? data.user : null;
    } catch (e) {
        return null;
    }
}

// Make logout available globally
window.logout = logout;

// ============================================
// API Functions
// ============================================

async function analyzeIncident(description, weatherCategory = null, location = null) {
    const payload = { description };
    
    // Add weather data if available
    if (weatherCategory) {
        payload.weather_override = weatherCategory;
    }
    if (location) {
        payload.location = location;
    }
    
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
    }
    
    return response.json();
}

async function getDispatchRecommendation(severity, incidentType, availableResources) {
    const response = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            severity,
            incident_type: incidentType,
            available_resources: availableResources
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Dispatch recommendation failed');
    }
    
    return response.json();
}

// Store current weather data
let currentWeatherData = null;

async function fetchWeather() {
    const locationInput = document.getElementById('incident-location');
    const weatherDisplay = document.getElementById('weather-display');
    const fetchBtn = document.getElementById('fetch-weather-btn');
    
    if (!locationInput || !weatherDisplay) return;
    
    const city = locationInput.value.trim();
    if (!city) {
        showNotification('Please enter a city name', 'error');
        return;
    }
    
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<span class="spinner"></span> Fetching...';
    
    try {
        const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch weather');
        }
        
        currentWeatherData = data.weather;
        displayWeather(data.weather);
        weatherDisplay.classList.remove('hidden');
        showNotification(`Weather data loaded for ${data.weather.city}`);
        
    } catch (error) {
        showNotification(error.message, 'error');
        currentWeatherData = null;
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
            </svg>
            Get Weather
        `;
    }
}

function displayWeather(weather) {
    const weatherIcons = {
        'clear': '☀️',
        'rain': '🌧️',
        'snow': '❄️',
        'fog': '🌫️',
        'clouds': '☁️',
        'thunderstorm': '⛈️',
        'drizzle': '🌦️'
    };
    
    const icon = weatherIcons[weather.main] || weatherIcons[weather.category] || '🌤️';
    
    document.getElementById('weather-icon').textContent = icon;
    document.getElementById('weather-city').textContent = `${weather.city}, ${weather.country}`;
    document.getElementById('weather-desc').textContent = weather.description;
    document.getElementById('weather-temp').textContent = `${weather.temperature}°C`;
    document.getElementById('weather-humidity').textContent = `${weather.humidity}%`;
    document.getElementById('weather-wind').textContent = `${weather.wind_speed} km/h`;
    document.getElementById('weather-visibility').textContent = `${weather.visibility} km`;
    document.getElementById('weather-category').value = weather.category;
}

// Make fetchWeather available globally
window.fetchWeather = fetchWeather;

// ============================================
// UI Helper Functions
// ============================================

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function truncateText(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 transform translate-y-full transition-transform duration-300`;
    
    if (type === 'success') {
        notification.classList.add('bg-green-900', 'text-green-100', 'border', 'border-green-700');
    } else if (type === 'error') {
        notification.classList.add('bg-red-900', 'text-red-100', 'border', 'border-red-700');
    } else {
        notification.classList.add('bg-blue-900', 'text-blue-100', 'border', 'border-blue-700');
    }
    
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" class="ml-2 text-current opacity-70 hover:opacity-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.classList.remove('translate-y-full');
    });
    
    setTimeout(() => {
        notification.classList.add('translate-y-full');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ============================================
// Mobile Menu
// ============================================

function initMobileMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    if (!menuToggle || !sidebar || !overlay) return;
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
    });
    
    overlay.addEventListener('click', () => {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    });
}

// ============================================
// Login Page Functions
// ============================================

function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorDiv = document.getElementById('login-error');
        
        if (!username || !password) {
            errorDiv.textContent = 'Please enter username and password';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Logging in...';
        errorDiv.classList.add('hidden');
        
        try {
            const result = await login(username, password);
            
            if (result.success) {
                showNotification(`Welcome, ${result.user.name}!`);
                window.location.href = '/';
            } else {
                errorDiv.textContent = result.error || 'Invalid username or password';
                errorDiv.classList.remove('hidden');
            }
        } catch (error) {
            errorDiv.textContent = 'Login failed. Please try again.';
            errorDiv.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Login';
        }
    });
}

// ============================================
// Dashboard Page Functions
// ============================================

function initDashboard() {
    const form = document.getElementById('incident-form');
    const descriptionInput = document.getElementById('incident-description');
    const locationInput = document.getElementById('incident-location');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsSection = document.getElementById('results-section');
    
    if (!form) return;
    
    // Display current available resources
    updateResourceDisplay();
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const description = descriptionInput.value.trim();
        if (!description) {
            showNotification('Please enter incident description', 'error');
            return;
        }
        
        const location = locationInput ? locationInput.value.trim() : null;
        const weatherCategory = currentWeatherData ? currentWeatherData.category : null;
        
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing...';
        
        try {
            const analysisResult = await analyzeIncident(description, weatherCategory, location);
            
            if (!analysisResult.success) {
                throw new Error(analysisResult.error);
            }
            
            const analysis = analysisResult.analysis;
            
            // Get available resources (not already in use)
            const availableResources = getAvailableResources();
            const dispatchResult = await getDispatchRecommendation(
                analysis.severity,
                analysis.incident_type,
                availableResources
            );
            
            displayAnalysisResults(analysis);
            displayDispatchResults(dispatchResult);
            
            resultsSection.classList.add('visible');
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Get current user for history
            const user = await getCurrentUser();
            
            // Add to history with in_progress status
            addToHistory({
                description,
                incident_type: analysis.incident_type,
                severity: analysis.severity,
                features: analysis.features,
                dispatch: dispatchResult.recommendation,
                reported_by: user ? user.name : 'Anonymous'
            });
            
            // Update resource display
            updateResourceDisplay();
            
            showNotification('Incident reported! Status: In Progress');
            
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                Report Incident
            `;
        }
    });
}

function updateResourceDisplay() {
    const resourceStatusEl = document.getElementById('resource-status');
    if (!resourceStatusEl) return;
    
    const available = getAvailableResources();
    const total = getResources();
    
    resourceStatusEl.innerHTML = RESOURCE_CONFIG.map(resource => {
        const avail = available[resource.key] || 0;
        const tot = total[resource.key] || 0;
        const inUse = tot - avail;
        return `
            <div class="flex items-center justify-between p-2 bg-slate-800 rounded">
                <span class="text-sm">${resource.icon} ${resource.name}</span>
                <span class="text-sm font-mono">
                    <span class="text-green-400">${avail}</span>/<span class="text-slate-400">${tot}</span>
                    ${inUse > 0 ? `<span class="text-yellow-400 text-xs ml-1">(${inUse} in use)</span>` : ''}
                </span>
            </div>
        `;
    }).join('');
}

function displayAnalysisResults(analysis) {
    const featuresContainer = document.getElementById('extracted-features');
    if (featuresContainer) {
        featuresContainer.innerHTML = `
            <div class="feature-tag">
                <span class="label">Weather:</span>
                <span class="value">${analysis.features.weather}</span>
            </div>
            <div class="feature-tag">
                <span class="label">Traffic:</span>
                <span class="value">${analysis.features.traffic}</span>
            </div>
            <div class="feature-tag">
                <span class="label">Road:</span>
                <span class="value">${analysis.features.road_type}</span>
            </div>
            <div class="feature-tag">
                <span class="label">Injuries:</span>
                <span class="value">${analysis.features.injuries}</span>
            </div>
            ${analysis.features.keywords.map(k => `
                <div class="feature-tag badge-blue">
                    <span class="value">${k}</span>
                </div>
            `).join('')}
        `;
    }
    
    const typeElement = document.getElementById('incident-type');
    const typeConfidence = document.getElementById('type-confidence');
    if (typeElement) {
        typeElement.textContent = INCIDENT_TYPE_LABELS[analysis.incident_type] || analysis.incident_type;
    }
    if (typeConfidence) {
        const confidence = Math.round(analysis.incident_type_confidence * 100);
        typeConfidence.innerHTML = `
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${confidence}%"></div>
            </div>
            <span class="confidence-value">${confidence}%</span>
        `;
    }
    
    const severityBadge = document.getElementById('severity-badge');
    const severityMeter = document.getElementById('severity-meter');
    const severityConfidence = document.getElementById('severity-confidence');
    
    if (severityBadge) {
        severityBadge.className = `severity-badge severity-${analysis.severity}`;
        severityBadge.textContent = `${SEVERITY_LABELS[analysis.severity]} (${analysis.severity}/5)`;
    }
    
    if (severityMeter) {
        severityMeter.innerHTML = [1, 2, 3, 4, 5].map(level => `
            <div class="severity-meter-bar ${level <= analysis.severity ? `active-${analysis.severity}` : ''}"></div>
        `).join('');
    }
    
    if (severityConfidence) {
        const confidence = Math.round(analysis.severity_confidence * 100);
        severityConfidence.innerHTML = `
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${confidence}%"></div>
            </div>
            <span class="confidence-value">${confidence}%</span>
        `;
    }
}

function displayDispatchResults(dispatchResult) {
    const dispatchGrid = document.getElementById('dispatch-grid');
    const rationaleElement = document.getElementById('dispatch-rationale');
    const warningsContainer = document.getElementById('dispatch-warnings');
    
    if (dispatchGrid) {
        dispatchGrid.innerHTML = RESOURCE_CONFIG.map(resource => {
            const count = dispatchResult.recommendation[resource.key] || 0;
            return `
                <div class="dispatch-card ${count > 0 ? 'needed' : ''}">
                    <div class="icon">${resource.icon}</div>
                    <div class="name">${resource.name}</div>
                    <div class="count">${count}</div>
                    <div class="helpline text-xs text-slate-500">Dial: ${resource.helpline}</div>
                </div>
            `;
        }).join('');
    }
    
    if (rationaleElement) {
        rationaleElement.textContent = dispatchResult.rationale;
    }
    
    if (warningsContainer) {
        if (dispatchResult.warnings && dispatchResult.warnings.length > 0) {
            warningsContainer.innerHTML = dispatchResult.warnings.map(warning => `
                <div class="warning-box">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <span>${warning}</span>
                </div>
            `).join('');
            warningsContainer.classList.remove('hidden');
        } else {
            warningsContainer.classList.add('hidden');
        }
    }
}

// ============================================
// Resources Page Functions
// ============================================

function initResources() {
    const resourcesContainer = document.getElementById('resources-container');
    const saveBtn = document.getElementById('save-resources-btn');
    const resetBtn = document.getElementById('reset-resources-btn');
    
    if (!resourcesContainer) return;
    
    const resources = getResources();
    renderResourceInputs(resources);
    
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const inputs = resourcesContainer.querySelectorAll('input[type="number"]');
            const newResources = {};
            
            inputs.forEach(input => {
                newResources[input.dataset.resource] = parseInt(input.value) || 0;
            });
            
            if (saveResources(newResources)) {
                showNotification('Resources saved successfully');
            } else {
                showNotification('Failed to save resources', 'error');
            }
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset all resources to defaults?')) {
                saveResources(DEFAULT_RESOURCES);
                renderResourceInputs(DEFAULT_RESOURCES);
                showNotification('Resources reset to defaults');
            }
        });
    }
}

function renderResourceInputs(resources) {
    const container = document.getElementById('resources-container');
    if (!container) return;
    
    const available = getAvailableResources();
    
    container.innerHTML = RESOURCE_CONFIG.map(resource => {
        const total = resources[resource.key] || 0;
        const avail = available[resource.key] || 0;
        const inUse = total - avail;
        
        return `
            <div class="resource-card">
                <div class="resource-icon ${resource.key}">
                    ${resource.icon}
                </div>
                <div class="resource-name">${resource.name}</div>
                <div class="resource-helpline text-xs text-blue-400 mt-1">Helpline: ${resource.helpline}</div>
                ${inUse > 0 ? `<div class="text-xs text-yellow-400 mt-1">${inUse} currently deployed</div>` : ''}
                <div class="number-input mt-3">
                    <button type="button" onclick="decrementResource('${resource.key}')" aria-label="Decrease ${resource.name}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
                        </svg>
                    </button>
                    <input 
                        type="number" 
                        id="resource-${resource.key}"
                        data-resource="${resource.key}"
                        value="${total}"
                        min="0"
                        max="99"
                        aria-label="${resource.name} count"
                    >
                    <button type="button" onclick="incrementResource('${resource.key}')" aria-label="Increase ${resource.name}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function incrementResource(key) {
    const input = document.getElementById(`resource-${key}`);
    if (input && input.value < 99) {
        input.value = parseInt(input.value) + 1;
        autoSaveResource(key, input.value);
    }
}

function decrementResource(key) {
    const input = document.getElementById(`resource-${key}`);
    if (input && input.value > 0) {
        input.value = parseInt(input.value) - 1;
        autoSaveResource(key, input.value);
    }
}

function autoSaveResource(key, value) {
    const resources = getResources();
    resources[key] = parseInt(value) || 0;
    saveResources(resources);
}

// Make functions globally available
window.incrementResource = incrementResource;
window.decrementResource = decrementResource;

// ============================================
// History Page Functions
// ============================================

function initHistory() {
    renderHistory();
    
    const clearBtn = document.getElementById('clear-history-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all incident history? This will release all resources from in-progress incidents.')) {
                clearHistory();
                renderHistory();
                showNotification('History cleared');
            }
        });
    }
}

async function renderHistory() {
    const container = document.getElementById('history-container');
    const emptyState = document.getElementById('empty-state');
    const statsContainer = document.getElementById('history-stats');
    
    if (!container) return;
    
    const history = getHistory();
    const user = await getCurrentUser();
    const isAdmin = user && user.role === 'admin';
    
    if (history.length === 0) {
        container.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        if (statsContainer) statsContainer.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    if (statsContainer) statsContainer.classList.remove('hidden');
    
    // Calculate stats
    const inProgress = history.filter(i => i.status === STATUS.IN_PROGRESS).length;
    const completed = history.filter(i => i.status === STATUS.COMPLETED).length;
    const bySeverity = {};
    history.forEach(i => {
        bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    });
    
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="label">Total Incidents</div>
                <div class="value">${history.length}</div>
            </div>
            <div class="stat-card">
                <div class="label">In Progress</div>
                <div class="value text-yellow-400">${inProgress}</div>
            </div>
            <div class="stat-card">
                <div class="label">Completed</div>
                <div class="value text-green-400">${completed}</div>
            </div>
            <div class="stat-card">
                <div class="label">Critical (5)</div>
                <div class="value text-red-400">${bySeverity[5] || 0}</div>
            </div>
            <div class="stat-card">
                <div class="label">High (4)</div>
                <div class="value text-orange-400">${bySeverity[4] || 0}</div>
            </div>
        `;
    }
    
    container.innerHTML = history.map(incident => `
        <div class="history-card ${incident.status === STATUS.IN_PROGRESS ? 'border-l-4 border-yellow-500' : 'border-l-4 border-green-500'}">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <span class="severity-badge severity-${incident.severity}">${SEVERITY_LABELS[incident.severity]}</span>
                    <span class="text-xs px-2 py-1 rounded ${incident.status === STATUS.IN_PROGRESS ? 'bg-yellow-900/50 text-yellow-300' : 'bg-green-900/50 text-green-300'}">
                        ${incident.status === STATUS.IN_PROGRESS ? 'In Progress' : 'Completed'}
                    </span>
                </div>
                <span class="text-xs text-slate-400">${formatDate(incident.timestamp)}</span>
            </div>
            <p class="text-sm text-slate-300 mb-2">${truncateText(incident.description, 150)}</p>
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-xs text-slate-400">
                    <span class="px-2 py-1 bg-slate-700 rounded">${INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type}</span>
                    ${incident.reported_by ? `<span>By: ${incident.reported_by}</span>` : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="viewIncidentDetails(${incident.id})" class="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
                        View Details
                    </button>
                    ${isAdmin && incident.status === STATUS.IN_PROGRESS ? `
                        <button onclick="markIncidentComplete(${incident.id})" class="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 rounded transition-colors">
                            Mark Complete
                        </button>
                    ` : ''}
                    ${isAdmin ? `
                        <button onclick="deleteIncident(${incident.id})" class="text-xs px-3 py-1 bg-red-900/50 hover:bg-red-800 rounded transition-colors text-red-300">
                            Delete
                        </button>
                    ` : ''}
                </div>
            </div>
            ${incident.dispatch ? `
                <div class="mt-3 pt-3 border-t border-slate-700">
                    <div class="text-xs text-slate-400 mb-2">Resources Allocated:</div>
                    <div class="flex flex-wrap gap-2">
                        ${RESOURCE_CONFIG.map(r => {
                            const count = incident.dispatch[r.key] || 0;
                            if (count === 0) return '';
                            return `<span class="text-xs px-2 py-1 bg-slate-700 rounded">${r.icon} ${r.name}: ${count}</span>`;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function viewIncidentDetails(id) {
    const history = getHistory();
    const incident = history.find(item => item.id === id);
    
    if (!incident) return;
    
    const modal = document.getElementById('incident-modal');
    if (!modal) return;
    
    // Update modal content
    const timestampEl = document.getElementById('modal-timestamp');
    const descriptionEl = document.getElementById('modal-description');
    const typeEl = document.getElementById('modal-type');
    const severityEl = document.getElementById('modal-severity');
    const statusEl = document.getElementById('modal-status');
    const featuresEl = document.getElementById('modal-features');
    const dispatchEl = document.getElementById('modal-dispatch');
    
    if (timestampEl) timestampEl.textContent = formatDate(incident.timestamp);
    if (descriptionEl) descriptionEl.textContent = incident.description;
    if (typeEl) typeEl.textContent = INCIDENT_TYPE_LABELS[incident.incident_type] || incident.incident_type;
    
    if (severityEl) {
        severityEl.className = `severity-badge severity-${incident.severity}`;
        severityEl.textContent = `${SEVERITY_LABELS[incident.severity]} (${incident.severity}/5)`;
    }
    
    if (statusEl) {
        statusEl.className = `text-xs px-2 py-1 rounded ${incident.status === STATUS.IN_PROGRESS ? 'bg-yellow-900/50 text-yellow-300' : 'bg-green-900/50 text-green-300'}`;
        statusEl.textContent = incident.status === STATUS.IN_PROGRESS ? 'In Progress' : 'Completed';
    }
    
    if (featuresEl && incident.features) {
        featuresEl.innerHTML = `
            <div class="feature-tag"><span class="label">Weather:</span> <span class="value">${incident.features.weather}</span></div>
            <div class="feature-tag"><span class="label">Traffic:</span> <span class="value">${incident.features.traffic}</span></div>
            <div class="feature-tag"><span class="label">Road:</span> <span class="value">${incident.features.road_type}</span></div>
            <div class="feature-tag"><span class="label">Injuries:</span> <span class="value">${incident.features.injuries}</span></div>
            ${incident.features.keywords ? incident.features.keywords.map(k => `<div class="feature-tag badge-blue"><span class="value">${k}</span></div>`).join('') : ''}
        `;
    }
    
    if (dispatchEl && incident.dispatch) {
        dispatchEl.innerHTML = `
            <div class="text-center p-2 bg-slate-800 rounded"><p class="text-lg font-bold text-red-400">${incident.dispatch.ambulances_108 || 0}</p><p class="text-xs text-slate-400">108 Ambulance</p></div>
            <div class="text-center p-2 bg-slate-800 rounded"><p class="text-lg font-bold text-orange-400">${incident.dispatch.fire_tenders || 0}</p><p class="text-xs text-slate-400">Fire Tender</p></div>
            <div class="text-center p-2 bg-slate-800 rounded"><p class="text-lg font-bold text-blue-400">${incident.dispatch.police_pcr || 0}</p><p class="text-xs text-slate-400">Police PCR</p></div>
            <div class="text-center p-2 bg-slate-800 rounded"><p class="text-lg font-bold text-green-400">${incident.dispatch.ndrf_teams || 0}</p><p class="text-xs text-slate-400">NDRF</p></div>
            <div class="text-center p-2 bg-slate-800 rounded"><p class="text-lg font-bold text-teal-400">${incident.dispatch.medical_teams || 0}</p><p class="text-xs text-slate-400">Medical</p></div>
        `;
    }
    
    modal.classList.add('active');
}

async function markIncidentComplete(id) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        showNotification('Only admin can mark incidents as complete', 'error');
        return;
    }
    
    if (confirm('Mark this incident as complete? This will release the allocated resources.')) {
        if (updateIncidentStatus(id, STATUS.COMPLETED)) {
            showNotification('Incident marked as complete. Resources released.');
            renderHistory();
        } else {
            showNotification('Failed to update incident', 'error');
        }
    }
}

async function deleteIncident(id) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
        showNotification('Only admin can delete incidents', 'error');
        return;
    }
    
    if (confirm('Delete this incident? If in progress, resources will be released.')) {
        deleteFromHistory(id);
        showNotification('Incident deleted');
        renderHistory();
    }
}

function closeModal() {
    const modal = document.getElementById('incident-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Make functions globally available
window.viewIncidentDetails = viewIncidentDetails;
window.markIncidentComplete = markIncidentComplete;
window.deleteIncident = deleteIncident;
window.closeModal = closeModal;

// ============================================
// Initialize on Page Load
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    
    // Initialize page-specific functionality
    const path = window.location.pathname;
    
    if (path === '/login') {
        initLogin();
    } else if (path === '/' || path === '/dashboard') {
        initDashboard();
    } else if (path === '/resources') {
        initResources();
    } else if (path === '/history') {
        initHistory();
    }
});
