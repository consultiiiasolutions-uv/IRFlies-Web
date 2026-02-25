# IRFlies-Web Backend

## Buckets
- Models: gs://irflies-uv-models
- Tmp: gs://irflies-uv-tmp

## Subir modelos (ejemplos)
> Ajusta rutas y nombres a tus archivos reales.

### YOLO weights (ejemplo)
gsutil cp ./backend/models/ceratitis/yolo.pt gs://irflies-uv-models/ceratitis/yolo.pt

### Keras classifier (ejemplo)
gsutil cp ./backend/models/ceratitis/classifier.keras gs://irflies-uv-models/ceratitis/classifier.keras
