# Exportación del modelo a ONNX

Paso offline, requiere Python (ver `requirements.txt` de esta carpeta, separado
del backend Node en runtime).

## Uso

```bash
cd model-export
python -m venv .venv
source .venv/bin/activate   # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
chmod +x export_to_onnx.sh
./export_to_onnx.sh
```

Esto genera `model-export/output/` con (al menos) `model.onnx`, `config.json`
y `preprocessor_config.json`.

## Siguiente paso

Copiar esos 3 archivos a `backend/models/` (ver Task 4, Step 5 del plan de
migración) y trackearlos con Git LFS (`model.onnx` ya está en `.gitattributes`
desde Task 1).
