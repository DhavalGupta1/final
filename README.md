```markdown
# SOSupport - Emergency Response System

An AI-powered emergency incident analysis and resource coordination platform designed to help emergency response teams analyze incidents, allocate resources efficiently, and provide real-time guidance to people at emergency scenes.

## Features

- **Incident Reporting**: Users can report emergencies with detailed descriptions
- **AI-Powered Analysis**: Automatic classification of incident type (fire, traffic accident, medical emergency, crime, natural disaster)
- **Severity Prediction**: ML-based severity assessment (1-5 scale) using trained scikit-learn models
- **Smart Resource Dispatch**: Intelligent allocation of emergency resources based on incident severity and type
- **Real-Time Weather Integration**: Fetches current weather conditions via WeatherAPI.com to factor into emergency response
- **Resource Management**: Admin dashboard to configure and monitor available emergency units
- **Incident History**: Track all reported incidents with status (In Progress/Completed)
- **Role-Based Access**: Public incident reporting with admin-only resource management

## Tech Stack

- **Backend**: Flask (Python)
- **Frontend**: Jinja2 Templates, Tailwind CSS, Vanilla JavaScript
- **ML Models**: scikit-learn (.pkl files for classification and severity prediction)
- **APIs**: WeatherAPI.com for weather data
- **Deployment**: Vercel (Serverless Python)

## Project Structure

```

├── api/
│   └── index.py          # Flask application with all routes and ML logic
├── templates/
│   ├── base.html         # Base template with navigation
│   ├── login.html        # Admin login page
│   ├── dashboard.html    # Main incident reporting dashboard
│   ├── resources.html    # Resource management (admin only)
│   └── history.html      # Incident history viewer
├── static/
│   ├── css/
│   │   └── styles.css    # Custom styles
│   └── js/
│       └── app.js        # Frontend JavaScript logic
├── models/
│   ├── incident_classifier.pkl    # Trained incident type classifier
│   └── severity_predictor.pkl     # Trained severity predictor
├── requirements.txt
└── vercel.json

```plaintext

## Installation

### Prerequisites

- Python 3.9+
- pip

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/sossupport.git
   cd sossupport
```

2. Install dependencies:

```shellscript
pip install -r requirements.txt
```


3. Set environment variables:

```shellscript
export WEATHERAPI_KEY=your_weatherapi_key
```


4. Run the development server:

```shellscript
cd api && python index.py
```


5. Open [http://localhost:5000](http://localhost:5000) in your browser


### Deploy to Vercel

1. Install Vercel CLI:

```shellscript
npm install -g vercel
```


2. Deploy:

```shellscript
vercel
```


3. Set environment variables in Vercel dashboard:

1. `WEATHERAPI_KEY` - Get from [weatherapi.com](https://www.weatherapi.com/)





## Environment Variables

| Variable | Description | Required
|-----|-----|-----
| `WEATHERAPI_KEY` | WeatherAPI.com API key for weather data | Yes


## ML Models

The system supports pre-trained scikit-learn models for incident classification and severity prediction. Place your `.pkl` files in the `models/` directory:

- `incident_classifier.pkl` - Classifies incident type
- `severity_predictor.pkl` - Predicts severity (1-5)


**Expected Feature Input:**

```python
[weather, traffic, road_type, injuries, has_fire, has_accident, has_medical, has_crime, has_natural]
```

If models are not provided, the system falls back to rule-based analysis.

## User Roles

### Public Users

- Report incidents from the Dashboard
- View incident history
- See dispatch recommendations


### Admin

- All public user capabilities
- Access Resource Management page
- Configure available emergency units
- Mark incidents as completed (releases allocated resources)


**Default Admin Credentials:**

- Username: `admin`
- Password: `admin123`


**Sample User Credentials:**

- Username: `user1` / Password: `user123`
- Username: `user2` / Password: `user123`


## API Endpoints

| Endpoint | Method | Description
|-----|-----|-----
| `/` | GET | Dashboard page
| `/login` | GET | Login page
| `/resources` | GET | Resource management (admin only)
| `/history` | GET | Incident history
| `/api/login` | POST | Authenticate user
| `/api/logout` | POST | Logout user
| `/api/me` | GET | Get current user info
| `/api/analyze` | POST | Analyze incident description
| `/api/dispatch` | POST | Get dispatch recommendations
| `/api/weather` | GET | Fetch weather by city


## Emergency Resources

The system manages five types of emergency resources:

- **108 Ambulance** - Emergency medical response
- **Fire Tenders** - Fire suppression and rescue
- **Police PCR** - Law enforcement and traffic control
- **NDRF Teams** - National Disaster Response Force
- **Medical Teams** - Specialized medical support


## Screenshots

### Dashboard

Report incidents with automatic weather fetching and AI-powered analysis.

### Resource Management

Configure available emergency units (admin only).

### Incident History

Track all incidents with status and completion controls.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
