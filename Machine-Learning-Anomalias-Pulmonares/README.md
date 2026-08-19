# MedAI Scanner - Sistema de Machine Learning para Anomalías Pulmonares

Este proyecto es una plataforma web integral que utiliza Inteligencia Artificial (específicamente un modelo de Deep Learning de visión computacional) para el análisis de radiografías de tórax.

## ✨ Novedades de la Última Versión (v2.0)
*   **Inferencia 100% Real:** Se ha eliminado por completo la lógica "hardcodeada" y heurística basada en nombres de archivos. Toda imagen subida es procesada por el tensor matemático del modelo.
*   **Muestras Automatizadas:** Las imágenes de muestra de la galería ahora son procesadas en tiempo real por el modelo (se lee su binario localmente y se pasa por la red neuronal) en lugar de arrojar números pre-calculados o aleatorios.
*   **Desacoplamiento Total:** El backend en Node.js ahora es completamente autónomo y no depende de los scripts de exportación de Python ni de assets compartidos.

## 🧠 Modelos de Machine Learning Utilizados

Actualmente, el sistema utiliza el siguiente modelo de clasificación de imágenes:

*   **Modelo Principal:** `nickmuchi/vit-finetuned-chest-xray-pneumonia`
*   **Arquitectura:** Vision Transformer (ViT) de Google.
*   **Tipo de Tarea:** Clasificación Binaria (Image Classification) + Simulación Multiclase.
*   **Funcionamiento Real:** Este modelo divide la radiografía en múltiples "parches" y utiliza mecanismos de atención (Self-Attention) para detectar opacidades asociadas a una Neumonía. Todas las imágenes (cargas y muestras) son procesadas en tiempo real por este motor de inferencia, sin lógicas simuladas ni atajos hardcodeados.
## 🏗️ Arquitectura del Sistema (Desacoplada)

El sistema ha sido estructurado siguiendo el patrón Cliente-Servidor. El Backend (API de IA) y el Frontend (UI) viven en entornos separados y se comunican vía REST.

```text
Proyecto Machine Learning/
├── backend/                  <-- Servidor de IA (Node.js / TypeScript / Express)
│   ├── src/                  <-- Código fuente (server.ts, routes/, controllers/, services/, ...)
│   ├── models/               <-- Modelo exportado a ONNX (model.onnx, config.json, preprocessor_config.json)
│   ├── uploads/              <-- Almacenamiento local de radiografías subidas (gitignored)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                 <-- Interfaz de Usuario Visual (Dashboard)
│   ├── index.html            <-- Vista estática
│   ├── style.css
│   └── app.js                <-- Cliente Fetch API
│
├── model-export/              <-- Herramienta offline (Python) para exportar el modelo HF a ONNX
├── legacy-python-backend/     <-- Backend original en FastAPI, archivado (ya no se ejecuta)
│
└── README.md
```

## 🛠️ Stack Tecnológico y Librerías

El sistema está dividido en dos partes principales:

### 1. Backend (Motor de IA - `/backend`)
Escrito completamente en TypeScript (ejecutado directamente con `tsx`, sin paso de build), actúa como una API independiente que recibe las imágenes, las procesa y ejecuta el modelo de IA localmente vía ONNX, devolviendo JSON estructurados.
*   **Express 4:** Levantado con `host="0.0.0.0"`, lo que permite consumirlo desde cualquier otra computadora en la misma red local.
*   **onnxruntime-node:** Motor de inferencia que corre el modelo ViT ya exportado a formato ONNX (`backend/models/model.onnx`), sin depender de Python ni de PyTorch en tiempo de ejecución.
*   **sharp:** Librería de procesamiento de imágenes (basada en libvips) que decodifica, redimensiona y normaliza las radiografías subidas antes de pasarlas al modelo — es el equivalente de Pillow en este stack.
*   **Zod:** Validación de esquemas de entrada/salida de la API.
*   **Multer:** Middleware de Express para procesar la subida de archivos (multipart/form-data), validando tipo MIME y tamaño.
*   **cors / dotenv:** Configuración de CORS y variables de entorno.

> Nota: la exportación del modelo de Hugging Face a ONNX es un paso *offline*, hecho una sola vez con Python (`optimum-cli`) y vive en `model-export/` — no forma parte del backend en ejecución. El backend original en FastAPI/PyTorch quedó archivado en `legacy-python-backend/` y ya no se usa.

### 2. Frontend (Interfaz SaaS UI)
Una interfaz de usuario moderna diseñada con estándares SaaS médicos.
*   **HTML5 & Vanilla CSS3:** Diseño responsivo con sistema de "Modo Oscuro", variables CSS para el cambio rápido de temas, y layouts de CSS Grid/Flexbox.
*   **Vanilla JavaScript (ES6+):** 
    *   **Visor Radiológico:** Modificación de imágenes en tiempo real mediante filtros CSS (`brightness`, `contrast`, `invert`) aplicados directamente sobre el Canvas/DOM.
    *   **Fetch API:** Envío asíncrono de imágenes al servidor backend (Express).
    *   **Simulación NLP (Casos Clínicos):** Emulación de procesamiento de Lenguaje Natural para extraer texto de PDFs.
    *   **Botón de Chatbot:** Algoritmo básico de coincidencia de palabras clave (Keywords matching) para sugerencias médicas de urgencia.

## 🚀 Flujo de Ejecución

1. El usuario sube una radiografía mediante la interfaz web (Drag & Drop o seleccionando archivo).
2. JavaScript envía la imagen binaria vía POST al endpoint `/api/analyze-upload` de Express.
3. Multer valida el tipo MIME y el tamaño del archivo, y lo entrega en memoria al controlador.
4. `sharp` preprocesa la imagen (redimensiona y normaliza replicando el comportamiento de `ViTImageProcessor`, con los parámetros leídos en tiempo real desde `backend/models/preprocessor_config.json`).
5. `onnxruntime-node` ejecuta el modelo ONNX (`backend/models/model.onnx`) sobre el tensor preprocesado; se aplica softmax sobre los logits y la etiqueta se resuelve contra el `id2label` de `backend/models/config.json` (Ej. `PNEUMONIA: 98%`).
6. El backend devuelve un JSON estructurado.
7. El frontend actualiza la interfaz, mostrando las barras de progreso, alertas de riesgo (rojo o verde) y el porcentaje de confianza del modelo.
