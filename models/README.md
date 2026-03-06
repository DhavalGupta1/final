# ML Models Directory

Place your pre-trained scikit-learn model files here:

## Required Files

- `incident_classifier.pkl` - Classifies incident type (traffic_accident, fire, medical, crime, natural_disaster)
- `severity_predictor.pkl` - Predicts severity level (1-5)

## Expected Model Input

Models should accept a feature array with the following structure:

```python
features = [
    weather_encoded,      # 0=clear, 1=rain, 2=fog, 3=snow
    traffic_encoded,      # 0=low, 1=moderate, 2=high
    road_type_encoded,    # 0=urban, 1=highway, 2=rural
    injuries,             # Integer count of injuries mentioned
    has_fire,             # 0 or 1
    has_accident,         # 0 or 1
    has_medical,          # 0 or 1
    has_crime,            # 0 or 1
    has_natural           # 0 or 1
]
```

## Expected Model Output

- **Incident Classifier**: Returns class label (string) and class probabilities
- **Severity Predictor**: Returns integer severity (1-5) and confidence score

If models are not present, the system will use rule-based mock predictions.
