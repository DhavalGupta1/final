import os
import re
import json
import urllib.request
import urllib.parse
from pathlib import Path
from flask import Flask, render_template, request, jsonify, redirect, url_for, make_response
import hashlib
import secrets
from functools import wraps

# WeatherAPI.com API key
WEATHERAPI_KEY = os.environ.get('WEATHERAPI_KEY', '')

# Simple user database (for MVP - in production use proper database)
USERS = {
    'user1': {'password': 'user123', 'role': 'user', 'name': 'Ramesh Kumar'},
    'user2': {'password': 'user123', 'role': 'user', 'name': 'Priya Sharma'},
    'user3': {'password': 'user123', 'role': 'user', 'name': 'Amit Patel'},
    'admin': {'password': 'admin123', 'role': 'admin', 'name': 'Control Room Admin'}
}

# Session storage (for MVP - in production use Redis/database)
SESSIONS = {}

# Try to import ML libraries
try:
    import joblib
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False

# Get the base directory (one level up from api folder)
BASE_DIR = Path(__file__).parent.parent

app = Flask(__name__, 
            template_folder=str(BASE_DIR / 'templates'),
            static_folder=str(BASE_DIR / 'static'),
            static_url_path='/static')

# Model paths
MODELS_DIR = BASE_DIR / 'models'
CLASSIFIER_PATH = MODELS_DIR / 'incident_classifier.pkl'
SEVERITY_PATH = MODELS_DIR / 'severity_predictor.pkl'

# Global model variables
incident_classifier = None
severity_predictor = None
models_loaded = False

def load_models():
    """Load ML models if available"""
    global incident_classifier, severity_predictor, models_loaded
    
    if not ML_AVAILABLE:
        print("ML libraries not available, using mock predictions")
        return False
    
    try:
        if CLASSIFIER_PATH.exists() and SEVERITY_PATH.exists():
            incident_classifier = joblib.load(CLASSIFIER_PATH)
            severity_predictor = joblib.load(SEVERITY_PATH)
            models_loaded = True
            print("ML models loaded successfully")
            return True
        else:
            print(f"Model files not found at {MODELS_DIR}, using mock predictions")
            return False
    except Exception as e:
        print(f"Error loading models: {e}")
        return False

# Load models on startup
load_models()

# Authentication helpers
def get_current_user():
    """Get current user from session token"""
    token = request.cookies.get('session_token')
    if token and token in SESSIONS:
        return SESSIONS[token]
    return None

def login_required(f):
    """Decorator to require login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return redirect('/login')
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return redirect('/login')
        if user.get('role') != 'admin':
            return redirect('/')
        return f(*args, **kwargs)
    return decorated_function

# Feature extraction patterns
WEATHER_PATTERNS = {
    'rain': r'\b(rain|raining|rainy|storm|stormy|precipitation|downpour|drizzle)\b',
    'fog': r'\b(fog|foggy|mist|misty|haze|hazy|visibility)\b',
    'snow': r'\b(snow|snowing|snowy|ice|icy|sleet|blizzard|frost)\b',
    'clear': r'\b(clear|sunny|bright|fair)\b'
}

TRAFFIC_PATTERNS = {
    'high': r'\b(heavy traffic|congested|traffic jam|gridlock|rush hour|backed up)\b',
    'moderate': r'\b(moderate traffic|some traffic|busy)\b',
    'low': r'\b(light traffic|empty road|no traffic|clear road)\b'
}

ROAD_PATTERNS = {
    'highway': r'\b(highway|freeway|interstate|i-\d+|motorway|expressway|turnpike)\b',
    'rural': r'\b(rural|country road|dirt road|farm|remote|isolated)\b',
    'urban': r'\b(urban|city|downtown|street|intersection|avenue|boulevard)\b'
}

INCIDENT_KEYWORDS = {
    'fire': r'\b(fire|flame|burning|smoke|blaze|arson|inferno)\b',
    'accident': r'\b(accident|crash|collision|wreck|hit|rear-end|rollover|vehicle)\b',
    'medical': r'\b(medical|injury|injured|heart|stroke|unconscious|bleeding|wound|ambulance|hospital|pain|hurt)\b',
    'crime': r'\b(crime|robbery|theft|assault|shooting|gun|knife|weapon|attack|suspect|stolen)\b',
    'natural': r'\b(earthquake|flood|tornado|hurricane|wildfire|landslide|tsunami)\b'
}

def extract_features(description: str) -> dict:
    """Extract features from incident description using NLP patterns"""
    text = description.lower()
    
    # Extract weather
    weather = 'clear'
    for condition, pattern in WEATHER_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            weather = condition
            break
    
    # Extract traffic level
    traffic = 'moderate'
    for level, pattern in TRAFFIC_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            traffic = level
            break
    
    # Extract road type
    road_type = 'urban'
    for rtype, pattern in ROAD_PATTERNS.items():
        if re.search(pattern, text, re.IGNORECASE):
            road_type = rtype
            break
    
    # Count injuries mentioned
    injury_matches = re.findall(r'(\d+)\s*(?:people|persons?|victims?|injured|casualties)', text)
    injuries = sum(int(m) for m in injury_matches) if injury_matches else 0
    
    # Check for single injury mentions
    if injuries == 0 and re.search(r'\b(injured|hurt|wounded|victim)\b', text):
        injuries = 1
    
    # Extract incident keywords
    keywords = []
    keyword_flags = {}
    for keyword, pattern in INCIDENT_KEYWORDS.items():
        if re.search(pattern, text, re.IGNORECASE):
            keywords.append(keyword)
            keyword_flags[f'has_{keyword}'] = True
        else:
            keyword_flags[f'has_{keyword}'] = False
    
    return {
        'weather': weather,
        'traffic': traffic,
        'road_type': road_type,
        'injuries': injuries,
        'keywords': keywords,
        **keyword_flags
    }

def encode_features(features: dict) -> list:
    """Encode features for ML model input"""
    weather_map = {'clear': 0, 'rain': 1, 'fog': 2, 'snow': 3}
    traffic_map = {'low': 0, 'moderate': 1, 'high': 2}
    road_map = {'urban': 0, 'highway': 1, 'rural': 2}
    
    return [
        weather_map.get(features['weather'], 0),
        traffic_map.get(features['traffic'], 1),
        road_map.get(features['road_type'], 0),
        features['injuries'],
        1 if features.get('has_fire') else 0,
        1 if features.get('has_accident') else 0,
        1 if features.get('has_medical') else 0,
        1 if features.get('has_crime') else 0,
        1 if features.get('has_natural') else 0,
    ]

def mock_classify_incident(features: dict) -> tuple:
    """Rule-based incident classification when models aren't available"""
    keywords = features.get('keywords', [])
    
    # Priority order for classification
    if 'natural' in keywords:
        return 'natural_disaster', 0.85
    if 'fire' in keywords:
        return 'fire', 0.90
    if 'crime' in keywords:
        return 'crime', 0.88
    if 'accident' in keywords:
        return 'traffic_accident', 0.92
    if 'medical' in keywords:
        return 'medical_emergency', 0.87
    
    # Default based on injuries
    if features['injuries'] > 0:
        return 'medical_emergency', 0.70
    
    return 'unknown', 0.50

def mock_predict_severity(features: dict, incident_type: str) -> tuple:
    """Rule-based severity prediction when models aren't available"""
    base_severity = 2
    
    # Increase severity based on injuries
    if features['injuries'] >= 5:
        base_severity += 2
    elif features['injuries'] >= 2:
        base_severity += 1
    elif features['injuries'] >= 1:
        base_severity += 0.5
    
    # Increase severity based on incident type
    type_modifiers = {
        'natural_disaster': 1.5,
        'fire': 1.0,
        'crime': 0.5,
        'traffic_accident': 0.5,
        'medical_emergency': 0.5
    }
    base_severity += type_modifiers.get(incident_type, 0)
    
    # Weather impact
    if features['weather'] in ['snow', 'fog']:
        base_severity += 0.5
    elif features['weather'] == 'rain':
        base_severity += 0.3
    
    # Traffic impact
    if features['traffic'] == 'high':
        base_severity += 0.3
    
    # Road type impact
    if features['road_type'] == 'highway':
        base_severity += 0.3
    elif features['road_type'] == 'rural':
        base_severity += 0.2
    
    # Clamp severity between 1-5
    severity = max(1, min(5, round(base_severity)))
    confidence = 0.75 + (0.05 * (5 - abs(severity - base_severity)))
    
    return severity, min(confidence, 0.95)

def get_dispatch_recommendation(severity: int, incident_type: str, available_resources: dict) -> dict:
    """Generate dispatch recommendations based on severity and incident type - Minimal resource allocation"""
    
    # Base recommendations by severity (reduced allocations)
    base_recommendations = {
        1: {'ambulances_108': 0, 'fire_tenders': 0, 'police_pcr': 0, 'ndrf_teams': 0, 'medical_teams': 0},
        2: {'ambulances_108': 1, 'fire_tenders': 0, 'police_pcr': 0, 'ndrf_teams': 0, 'medical_teams': 0},
        3: {'ambulances_108': 1, 'fire_tenders': 0, 'police_pcr': 1, 'ndrf_teams': 0, 'medical_teams': 0},
        4: {'ambulances_108': 1, 'fire_tenders': 1, 'police_pcr': 1, 'ndrf_teams': 0, 'medical_teams': 0},
        5: {'ambulances_108': 2, 'fire_tenders': 1, 'police_pcr': 1, 'ndrf_teams': 1, 'medical_teams': 1},
    }
    
    recommendation = base_recommendations.get(severity, base_recommendations[3]).copy()
    
    # Adjust based on incident type (smaller increments)
    if incident_type == 'fire':
        recommendation['fire_tenders'] = min(recommendation['fire_tenders'] + 1, 2)
    elif incident_type == 'traffic_accident':
        recommendation['police_pcr'] = min(recommendation['police_pcr'] + 1, 2)
    elif incident_type == 'medical_emergency':
        recommendation['ambulances_108'] = min(recommendation['ambulances_108'] + 1, 2)
    elif incident_type == 'crime':
        recommendation['police_pcr'] = min(recommendation['police_pcr'] + 1, 2)
    elif incident_type == 'natural_disaster':
        recommendation['ndrf_teams'] = min(recommendation['ndrf_teams'] + 1, 2)
    
    # Indian resource name mapping for warnings
    resource_names = {
        'ambulances_108': '108 Ambulance',
        'fire_tenders': 'Fire Tender (Daman Seva)',
        'police_pcr': 'Police PCR Van',
        'ndrf_teams': 'NDRF Team',
        'medical_teams': 'Medical Team'
    }
    
    # Check against available resources and generate warnings
    warnings = []
    for resource, needed in recommendation.items():
        available = available_resources.get(resource, 0)
        if needed > available:
            warnings.append(f"Insufficient {resource_names.get(resource, resource)}: need {needed}, have {available}")
            recommendation[resource] = available
    
    # Generate rationale in Indian context
    incident_desc = incident_type.replace('_', ' ').title()
    rationale_parts = [f"Severity {severity} {incident_desc} - Coordinated response from Indian Emergency Services required."]
    
    if recommendation['ambulances_108'] > 0:
        rationale_parts.append(f"Dispatching {recommendation['ambulances_108']} 108 Ambulance(s) for emergency medical response.")
    if recommendation['fire_tenders'] > 0:
        rationale_parts.append(f"Deploying {recommendation['fire_tenders']} Fire Tender(s) from Fire Daman Seva.")
    if recommendation['police_pcr'] > 0:
        rationale_parts.append(f"Alerting {recommendation['police_pcr']} Police PCR Van(s) via Dial 112.")
    if recommendation['ndrf_teams'] > 0:
        rationale_parts.append(f"Requesting {recommendation['ndrf_teams']} NDRF Team(s) for disaster response.")
    if recommendation['medical_teams'] > 0:
        rationale_parts.append(f"Mobilizing {recommendation['medical_teams']} specialized Medical Team(s) from nearby Government Hospital.")
    
    return {
        'recommendation': recommendation,
        'warnings': warnings,
        'rationale': ' '.join(rationale_parts)
    }

# Page Routes
@app.route('/login', methods=['GET'])
def login_page():
    """Render the login page"""
    user = get_current_user()
    if user:
        return redirect('/')
    return render_template('login.html')

@app.route('/api/login', methods=['POST'])
def api_login():
    """Handle login API"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip().lower()
        password = data.get('password', '')
        
        if username in USERS and USERS[username]['password'] == password:
            # Create session token
            token = secrets.token_hex(32)
            SESSIONS[token] = {
                'username': username,
                'role': USERS[username]['role'],
                'name': USERS[username]['name']
            }
            
            response = make_response(jsonify({
                'success': True,
                'user': {
                    'username': username,
                    'role': USERS[username]['role'],
                    'name': USERS[username]['name']
                }
            }))
            response.set_cookie('session_token', token, httponly=True, samesite='Lax', max_age=86400)
            return response
        else:
            return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def api_logout():
    """Handle logout"""
    token = request.cookies.get('session_token')
    if token and token in SESSIONS:
        del SESSIONS[token]
    
    response = make_response(jsonify({'success': True}))
    response.delete_cookie('session_token')
    return response

@app.route('/api/me')
def api_me():
    """Get current user info"""
    user = get_current_user()
    if user:
        return jsonify({'success': True, 'user': user})
    return jsonify({'success': False, 'user': None})

@app.route('/')
def dashboard():
    """Render the main dashboard page - Open to everyone"""
    user = get_current_user()
    return render_template('dashboard.html', models_loaded=models_loaded, user=user)

@app.route('/resources')
@admin_required
def resources():
    """Render the resource management page - Admin only"""
    user = get_current_user()
    return render_template('resources.html', user=user)

@app.route('/history')
def history():
    """Render the incident history page - Open to everyone"""
    user = get_current_user()
    return render_template('history.html', user=user)

# API Routes
@app.route('/api/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'models_loaded': models_loaded,
        'ml_available': ML_AVAILABLE
    })

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Analyze incident description and return classification and severity"""
    try:
        data = request.get_json()
        description = data.get('description', '')
        weather_override = data.get('weather_override', None)
        location = data.get('location', None)
        
        if not description or len(description.strip()) < 10:
            return jsonify({
                'success': False,
                'error': 'Please provide a detailed incident description (at least 10 characters)'
            }), 400
        
        # Extract features from description
        features = extract_features(description)
        
        # Override weather if provided from API
        if weather_override and weather_override in ['clear', 'rain', 'fog', 'snow']:
            features['weather'] = weather_override
        
        # Add location to features if provided
        if location:
            features['location'] = location
        
        # Classify incident and predict severity
        if models_loaded and incident_classifier and severity_predictor:
            # Use ML models
            encoded = np.array([encode_features(features)])
            
            incident_type = incident_classifier.predict(encoded)[0]
            type_proba = incident_classifier.predict_proba(encoded).max()
            
            severity = int(severity_predictor.predict(encoded)[0])
            severity_proba = severity_predictor.predict_proba(encoded).max() if hasattr(severity_predictor, 'predict_proba') else 0.85
        else:
            # Use mock predictions
            incident_type, type_proba = mock_classify_incident(features)
            severity, severity_proba = mock_predict_severity(features, incident_type)
        
        return jsonify({
            'success': True,
            'analysis': {
                'features': {
                    'weather': features['weather'],
                    'traffic': features['traffic'],
                    'road_type': features['road_type'],
                    'injuries': features['injuries'],
                    'keywords': features['keywords']
                },
                'incident_type': incident_type,
                'incident_type_confidence': round(type_proba, 2),
                'severity': severity,
                'severity_confidence': round(severity_proba, 2)
            },
            'models_loaded': models_loaded
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """Fetch weather data from WeatherAPI.com"""
    try:
        city = request.args.get('city', '')
        
        if not city:
            return jsonify({'success': False, 'error': 'City name is required'}), 400
        
        if not WEATHERAPI_KEY:
            return jsonify({'success': False, 'error': 'Weather API key not configured'}), 500
        
        # Build API URL for WeatherAPI.com
        encoded_city = urllib.parse.quote(city)
        url = f"http://api.weatherapi.com/v1/current.json?key={WEATHERAPI_KEY}&q={encoded_city}&aqi=no"
        
        # Fetch weather data
        req = urllib.request.Request(url, headers={'User-Agent': 'SOSupport/1.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        # Extract relevant weather info from WeatherAPI.com response
        current = data.get('current', {})
        location = data.get('location', {})
        condition = current.get('condition', {})
        
        weather_text = condition.get('text', 'Clear').lower()
        temp = current.get('temp_c', 0)
        humidity = current.get('humidity', 0)
        wind_speed = current.get('wind_kph', 0)
        visibility = current.get('vis_km', 10)
        
        # Map to our weather categories based on condition text
        weather_category = 'clear'
        weather_main = 'clear'
        
        if any(word in weather_text for word in ['rain', 'drizzle', 'shower', 'thundery']):
            weather_category = 'rain'
            weather_main = 'rain'
        elif any(word in weather_text for word in ['snow', 'sleet', 'blizzard', 'ice']):
            weather_category = 'snow'
            weather_main = 'snow'
        elif any(word in weather_text for word in ['fog', 'mist', 'haze', 'overcast']):
            weather_category = 'fog'
            weather_main = 'fog'
        elif any(word in weather_text for word in ['cloud', 'cloudy', 'partly']):
            weather_main = 'clouds'
            if visibility < 5:
                weather_category = 'fog'
        elif any(word in weather_text for word in ['sunny', 'clear']):
            weather_category = 'clear'
            weather_main = 'clear'
        
        return jsonify({
            'success': True,
            'weather': {
                'city': location.get('name', city),
                'country': location.get('country', ''),
                'category': weather_category,
                'main': weather_main,
                'description': condition.get('text', 'Clear'),
                'temperature': round(temp, 1),
                'humidity': humidity,
                'wind_speed': round(wind_speed, 1),
                'visibility': round(visibility, 1)
            }
        })
        
    except urllib.error.HTTPError as e:
        if e.code == 400:
            return jsonify({'success': False, 'error': 'City not found'}), 404
        return jsonify({'success': False, 'error': f'Weather API error: {e.code}'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/dispatch', methods=['POST'])
def dispatch():
    """Generate dispatch recommendations"""
    try:
        data = request.get_json()
        severity = data.get('severity', 3)
        incident_type = data.get('incident_type', 'unknown')
        available_resources = data.get('available_resources', {
            'ambulances': 5,
            'fire_trucks': 3,
            'police': 4,
            'drones': 2,
            'medical_teams': 2
        })
        
        result = get_dispatch_recommendation(severity, incident_type, available_resources)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
