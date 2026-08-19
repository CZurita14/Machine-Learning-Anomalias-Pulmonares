// --- CONFIGURACIÓN DE API ---
// Para apuntar a otra IP (demo en red local), cambia el valor en localStorage:
//   localStorage.setItem('API_BASE_URL', 'http://192.168.1.15:8000')
// o edita el valor por defecto de abajo.
const API_BASE_URL = localStorage.getItem('API_BASE_URL') || "http://127.0.0.1:8000";

// --- NAVEGACIÓN Y VISTAS ---
function switchView(viewId, navButton) {
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    navButton.classList.add('active');
}

// --- ESCÁNER IA ---
const mainImage = document.getElementById('mainImage');
const placeholderText = document.getElementById('placeholderText');
const btnScan = document.getElementById('btnScan');
const viewerContainer = document.getElementById('viewerContainer');
const fileInput = document.getElementById('fileInput');
const heatmapOverlay = document.getElementById('heatmapOverlay');

// Elementos de UI de Resultados
const statusSpinner = document.getElementById('statusSpinner');
const statusIconDone = document.getElementById('statusIconDone');
const statusTitle = document.getElementById('statusTitle');
const statusDesc = document.getElementById('statusDesc');
const confidenceValue = document.getElementById('confidenceValue');
const confidenceBar = document.getElementById('confidenceBar');
const timeValue = document.getElementById('timeValue');
const timeBar = document.getElementById('timeBar');
const verdictBadge = document.getElementById('verdictBadge');
const verdictTitle = document.getElementById('verdictTitle');
const infoText = document.getElementById('infoText');

let currentImageSrc = null;
let currentFile = null;

function selectImage(src) {
    currentImageSrc = src;
    currentFile = null;
    displayImage(src);
}

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        currentFile = file;
        currentImageSrc = null;
        const reader = new FileReader();
        reader.onload = (e) => displayImage(e.target.result);
        reader.readAsDataURL(file);
    }
});

function displayImage(src) {
    mainImage.src = src;
    mainImage.style.display = 'block';
    placeholderText.style.display = 'none';
    btnScan.disabled = false;
    
    // Activar miniatura
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    document.querySelector('.thumb').classList.add('active');
    document.querySelector('.thumb').style.backgroundImage = `url(${src})`;
    document.querySelector('.thumb').style.backgroundSize = 'cover';
    
    resetResults();
}

function resetResults() {
    heatmapOverlay.style.opacity = '0';
    
    statusSpinner.style.display = 'block';
    statusSpinner.classList.remove('active');
    statusIconDone.style.display = 'none';
    
    statusTitle.innerText = 'Esperando datos...';
    statusDesc.innerText = 'Pendiente de análisis';
    
    confidenceValue.innerText = '--%';
    confidenceBar.style.width = '0%';
    confidenceBar.style.background = '#8b5cf6'; // Purple
    
    timeValue.innerText = '-- ms';
    timeBar.style.width = '0%';
    timeBar.style.background = '#10b981'; // Green
    
    verdictBadge.className = 'badge pending';
    verdictBadge.innerText = 'Pendiente';
    verdictTitle.innerText = 'Preparando modelo de IA...';
    
    infoText.innerText = 'Haz clic en "Iniciar Análisis IA" para procesar la radiografía seleccionada.';
}

async function startScan() {
    if (!currentImageSrc && !currentFile) return;

    btnScan.disabled = true;
    viewerContainer.classList.add('scanning');
    
    statusSpinner.classList.add('active');
    statusTitle.innerText = 'Analizando Radiografía...';
    statusDesc.innerText = 'Ejecutando red neuronal convolucional (CNN)';
    
    verdictBadge.className = 'badge pending';
    verdictBadge.innerText = 'Procesando';
    verdictTitle.innerText = 'Extrayendo características pulmonares...';

    const startTime = performance.now();

    try {
        let response;
        if (currentFile) {
            const formData = new FormData();
            formData.append('file', currentFile);
            response = await fetch(`${API_BASE_URL}/api/analyze-upload`, {
                method: 'POST',
                body: formData
            });
        } else {
            const imageName = currentImageSrc.split('/').pop();
            response = await fetch(`${API_BASE_URL}/api/analyze-sample?image_name=${imageName}`);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.error) {
            throw new Error(data.error || `Error del servidor (status ${response.status})`);
        }

        const elapsed = performance.now() - startTime;
        if (elapsed < 2500) await new Promise(r => setTimeout(r, 2500 - elapsed));

        showResults(data, performance.now() - startTime);

    } catch (error) {
        console.error('Error:', error);
        statusSpinner.classList.remove('active');
        statusIconDone.style.display = 'none';
        statusTitle.innerText = 'Error de análisis';
        statusDesc.innerText = error.message || 'No se pudo contactar al motor de IA';
        verdictBadge.className = 'badge danger';
        verdictBadge.innerText = 'Error';
        verdictTitle.innerText = 'No se pudo completar el análisis';
        infoText.innerText = 'Revisa la conexión con el servidor o intenta con otra imagen.';
        btnScan.disabled = false;
        viewerContainer.classList.remove('scanning');
    }
}

function showResults(data, timeTaken) {
    viewerContainer.classList.remove('scanning');
    
    statusSpinner.style.display = 'none';
    statusIconDone.style.display = 'block';
    statusTitle.innerText = 'Análisis Completado';
    statusDesc.innerText = 'Resultados listos para revisión médica';

    const confPercent = Math.round(data.confidence * 100);
    confidenceValue.innerText = confPercent + '%';
    
    // Animación de barras
    setTimeout(() => {
        confidenceBar.style.width = confPercent + '%';
        timeBar.style.width = '75%'; // Representación visual
    }, 100);
    
    timeValue.innerText = Math.round(timeTaken) + ' ms';

    if (data.anomaly_detected) {
        verdictBadge.className = 'badge danger';
        verdictBadge.innerText = 'Riesgo Detectado';
        verdictTitle.innerText = data.disease;
        confidenceBar.style.background = '#ef4444'; // Red
        heatmapOverlay.style.opacity = '1';
        infoText.innerText = `Se han detectado patrones anómalos consistentes con ${data.disease}. Se recomienda revisión clínica inmediata.`;
    } else {
        verdictBadge.className = 'badge safe';
        verdictBadge.innerText = 'Normal';
        verdictTitle.innerText = 'Campos pulmonares limpios';
        confidenceBar.style.background = '#10b981'; // Green
        infoText.innerText = 'No se detectaron infiltrados, consolidaciones ni masas anómalas en el análisis radiográfico.';
    }

    btnScan.disabled = false;
    
    // Habilitar botón de Segunda Opinión
    const btnSecondOpinion = document.getElementById('btnSecondOpinion');
    if (btnSecondOpinion) {
        btnSecondOpinion.style.display = 'block';
        btnSecondOpinion.disabled = false;
        // Guardamos la info necesaria en variables globales o data attributes
        if (currentFile) {
            btnSecondOpinion.dataset.imagePath = data.saved_path;
        } else {
            const imageName = currentImageSrc.split('/').pop();
            btnSecondOpinion.dataset.imagePath = imageName;
        }
    }
}

// --- SEGUNDA OPINIÓN (LLM API) ---
let lastGeneratedReport = null;

async function requestSecondOpinion() {
    const btn = document.getElementById('btnSecondOpinion');
    const btnView = document.getElementById('btnViewReport');
    const modalReportContent = document.getElementById('modalReportContent');
    const imagePath = btn.dataset.imagePath;

    if (!imagePath) return;

    btn.disabled = true;
    btn.innerHTML = '⏳ Procesando Segunda Opinión...';
    btnView.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/api/second-opinion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePath })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || 'Error en el análisis de Segunda Opinión');
        }
        
        lastGeneratedReport = data.report;

        // Mostrar reporte en el modal
        if (typeof marked !== 'undefined') {
            modalReportContent.innerHTML = marked.parse(data.report);
        } else {
            modalReportContent.innerHTML = data.report.replace(/\n/g, '<br>');
        }
        
        // Cambiar botón a estado completado y mostrar botón de ver informe
        btn.innerHTML = '✅ Segunda Opinión Completada';
        btnView.style.display = 'block';
        openModal(); // Abrir modal automáticamente la primera vez
    } catch (error) {
        console.error(error);
        alert(`Error: ${error.message}`);
        btn.disabled = false;
        btn.innerHTML = '🩺 Reintentar Segunda Opinión (IA)';
    }
}

// Funciones del Modal
function openModal() {
    document.getElementById('reportModal').style.display = 'flex';
}
function closeModal() {
    document.getElementById('reportModal').style.display = 'none';
}

function loadCaseIntoChat() {
    if (!lastGeneratedReport) {
        showNotification("No hay ningún informe generado todavía.");
        return;
    }

    closeModal();
    
    // Cambiar a la vista de chat
    const chatNavBtn = document.querySelector('.nav-item[onclick="switchView(\'chatView\', this)"]');
    if (chatNavBtn) {
        switchView('chatView', chatNavBtn);
    }
    
    // Limpiar historial de chat para enfocarse en este paciente
    chatHistory = [];
    document.getElementById('chatMessages').innerHTML = '';
    
    // Inyectar el reporte como contexto del sistema (oculto para el usuario visualmente, o mostrado como un mensaje inicial)
    chatHistory.push({ 
        role: 'system', 
        content: `A continuación se presenta el informe médico (Segunda Opinión) generado sobre la radiografía actual del paciente. Utiliza esta información como contexto base para responder a todas las preguntas del médico. Informe:\n\n${lastGeneratedReport}`
    });
    
    // Añadir mensaje de bienvenida del bot indicando que ya tiene el contexto
    const botIntroMessage = "He cargado el informe radiológico del paciente actual en mi memoria. ¿Qué dudas tienes sobre los hallazgos o el posible tratamiento?";
    appendMessage(botIntroMessage, 'bot');
    chatHistory.push({ role: 'assistant', content: botIntroMessage });
    
    showNotification("Contexto del paciente cargado en el chat.");
}

// --- CHATBOT MÉDICO ---
let chatHistory = [];

function handleChatKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    appendMessage(message, 'user');
    chatHistory.push({ role: 'user', content: message });
    input.value = '';
    
    // Deshabilitar input temporalmente
    input.disabled = true;
    
    // Add typing indicator
    const typingId = Date.now().toString();
    appendMessage('Escribiendo...', 'bot', typingId);

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory })
        });
        
        const data = await response.json();
        
        // Remover typing indicator
        removeMessage(typingId);
        
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Error de conexión con la IA');
        }
        
        let aiText = data.response;
        appendMessage(aiText, 'bot');
        chatHistory.push({ role: 'assistant', content: aiText });
        
    } catch (err) {
        removeMessage(typingId);
        appendMessage('⚠️ Error: No se pudo conectar con el Asistente IA. ' + err.message, 'bot');
        // Remove the failed user message from history so it can be retried
        chatHistory.pop();
    } finally {
        input.disabled = false;
        input.focus();
    }
}

function appendMessage(text, sender, id = null) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    if (id) messageDiv.id = `msg-${id}`;
    
    // Si tenemos marked (markdown parse) lo usamos para la respuesta del bot
    if (sender === 'bot' && typeof marked !== 'undefined' && text !== 'Escribiendo...') {
        messageDiv.innerHTML = marked.parse(text);
        // Ajustar el espaciado de markdown en el chat
        messageDiv.style.lineHeight = '1.4';
    } else {
        messageDiv.innerHTML = `<p>${text}</p>`;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeMessage(id) {
    const msg = document.getElementById(`msg-${id}`);
    if (msg) msg.remove();
}

// --- INTERACTIVIDAD EXTRA (Botones de Header y Herramientas) ---

function toggleSidebar() {
    const sidebar = document.getElementById('appSidebar');
    sidebar.classList.toggle('collapsed');
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    const themeIcon = document.getElementById('themeIcon');
    
    if (isDark) {
        // Icono de Luna
        themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    } else {
        // Icono de Sol
        themeIcon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
    }
}

function showNotification(message = "Sistema actualizado y listo.") {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${message}`;
    
    container.appendChild(toast);
    
    // Auto-eliminar después de 3s
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Filtros de Imagen para el Visor (Herramientas laterales)
let currentFilters = { brightness: 1, contrast: 1, invert: 0, scale: 1 };

function applyFilter(type, btnElement) {
    if (!currentImageSrc && !currentFile) {
        return showNotification('Seleccione un paciente o suba una radiografía primero.');
    }
    
    const img = document.getElementById('mainImage');
    const icons = document.querySelectorAll('.tool-icon');
    
    if (type === 'reset') {
        currentFilters = { brightness: 1, contrast: 1, invert: 0, scale: 1 };
        icons.forEach(i => i.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');
    } else {
        // Quitar el estado activo del botón de reset
        icons[0].classList.remove('active');
        
        if (type === 'brightness') currentFilters.brightness += 0.2;
        if (type === 'contrast') currentFilters.contrast += 0.2;
        if (type === 'invert') currentFilters.invert = currentFilters.invert === 0 ? 1 : 0;
        if (type === 'zoom-in') {
            currentFilters.scale += 0.3;
            if (currentFilters.scale > 3.0) currentFilters.scale = 3.0; // max zoom
        }
        if (type === 'zoom-out') {
            currentFilters.scale -= 0.3;
            if (currentFilters.scale < 0.5) currentFilters.scale = 0.5; // min zoom
        }
    }
    
    img.style.filter = `brightness(${currentFilters.brightness}) contrast(${currentFilters.contrast}) invert(${currentFilters.invert})`;
    img.style.transform = `scale(${currentFilters.scale})`;
}

// --- SIMULACIÓN DE EXTRACCIÓN DE CASOS DESDE PDF ---
const mockCases = [
    { tag: 'safe', label: 'Seguimiento', title: 'Fibrosis Pulmonar Temprana', desc: 'Paciente de 45 años con tos seca persistente. Zonas de vidrio esmerilado periféricas detectadas en bases pulmonares.', treatment: 'Pruebas de función pulmonar. Evitar exposición a alérgenos/polvos. Monitoreo semestral.' },
    { tag: 'danger', label: 'Urgencia', title: 'Neumotórax Espontáneo', desc: 'Paciente de 30 años con dolor torácico súbito y disnea severa. Ausencia de trama vascular en el hemitórax derecho.', treatment: 'Descompresión con aguja inmediata y colocación de tubo pleural.' },
    { tag: 'warning', label: 'Observación', title: 'Nódulo Pulmonar Solitario', desc: 'Hallazgo incidental de nódulo espiculado de 1.5 cm en lóbulo superior izquierdo en chequeo de rutina. Paciente exfumador.', treatment: 'Se sugiere TAC de alta resolución y biopsia guiada para descartar malignidad.' },
    { tag: 'danger', label: 'Protocolo Infeccioso', title: 'Tuberculosis Activa', desc: 'Paciente con tos productiva y hemoptisis de 3 semanas. Múltiples cavitaciones apicales bilaterales evidentes.', treatment: 'Aislamiento respiratorio inmediato. Iniciar esquema DOTS (Isoniazida, Rifampicina).' },
    { tag: 'safe', label: 'Alta Médica', title: 'Bronquitis Aguda Resuelta', desc: 'Radiografía de tórax limpia, sin consolidaciones, masas ni derrames. Engrosamiento bronquial leve.', treatment: 'Tratamiento sintomático ambulatorio. Reposo e hidratación. Puede volver al trabajo.' }
];

function handlePDFUpload(input) {
    if (!input.files || input.files.length === 0) return;
    
    const fileName = input.files[0].name;
    input.value = ''; // Resetear input para poder volver a subir
    
    showNotification(`⏳ Analizando documento "${fileName}" con modelo NLP...`);
    
    // Simular el tiempo de extracción de datos del PDF
    setTimeout(() => {
        // Extraer un caso aleatorio de nuestra base de datos simulada
        const randomCase = mockCases[Math.floor(Math.random() * mockCases.length)];
        
        // Crear la tarjeta HTML
        const newCard = document.createElement('div');
        newCard.className = 'case-card';
        newCard.style.animation = 'fadeIn 0.5s ease-out';
        newCard.style.border = '2px solid var(--primary)'; // Resaltar como nuevo
        
        newCard.innerHTML = `
            <div class="case-tag ${randomCase.tag}">${randomCase.label} (Extraído)</div>
            <h3>${randomCase.title}</h3>
            <p>${randomCase.desc}</p>
            <hr>
            <p><strong>Tratamiento detectado:</strong> ${randomCase.treatment}</p>
        `;
        
        // Añadir la tarjeta a la cuadrícula de casos (al principio de la lista)
        const grid = document.getElementById('casesGrid');
        grid.insertBefore(newCard, grid.firstChild);
        
        showNotification('✅ Caso clínico extraído exitosamente del documento.');
    }, 2800);
}
