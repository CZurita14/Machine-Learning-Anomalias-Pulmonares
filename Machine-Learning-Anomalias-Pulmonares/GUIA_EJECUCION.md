# 🚀 Guía de Ejecución y Conexión Remota (API)

Este documento detalla los pasos exactos para levantar el sistema con su nueva Arquitectura Cliente-Servidor (Desacoplada) y cómo realizar la demostración conectando múltiples computadoras a una misma Inteligencia Artificial.

---

## 🖥️ Rol 1: La Computadora Servidor (Anfitriona)
Esta es la computadora más potente que ejecutará el Motor de Inteligencia Artificial (Backend).

### Paso 1: Averiguar la Dirección IP
Para que otras computadoras se conecten, necesitas saber la IP local de este equipo.
1. Abre la terminal (`cmd` o `powershell`).
2. Escribe el comando: `ipconfig`
3. Busca la línea que dice **"Dirección IPv4"**. (Ejemplo: `192.168.1.15`). Anota este número, será tu IP de servidor.

### Paso 2: Encender el Servidor de IA
1. Abre la terminal y navega hasta la carpeta del Backend de tu proyecto:
   ```bash
   cd "Proyecto Machine Learning\backend"
   ```
2. Instala las dependencias si es la primera vez (`npm install`) y confirma que exista un archivo `.env` (puedes copiarlo desde `.env.example`).
3. Levanta el servidor escribiendo el siguiente comando:
   ```bash
   npm run dev
   ```
   (Esto ejecuta `tsx watch src/server.ts`: TypeScript corre directo, sin paso de compilación, y el servidor se reinicia solo si editas el código.)
4. Verás un mensaje que dice: `API ejecutándose y escuchando en todas las interfaces: http://0.0.0.0:8000`. 
**¡El motor de IA ya está activo y esperando conexiones!** No cierres esta terminal.

---

## 💻 Rol 2: La Computadora Cliente (Visitante)
Esta es la computadora (o computadoras) desde la cual harás la presentación visual, usarás el Dashboard y subirás las radiografías.

### Paso 1: Configurar la conexión
1. En esta computadora, solo necesitas tener la carpeta `frontend/`.
2. Abre `frontend/index.html` en el navegador (ver Paso 2) y abre la consola de desarrollador (`F12` o Ctrl+Shift+I → pestaña "Console").
3. Escribe el siguiente comando en la consola, reemplazando la IP por la **Dirección IP del Servidor** que anotaste en el paso anterior, y presiona Enter:
   ```javascript
   localStorage.setItem('API_BASE_URL', 'http://192.168.1.15:8000')
   ```
4. Recarga la página (`F5`). El frontend ya no usará la IP por defecto (`127.0.0.1`) sino la que acabas de guardar en `localStorage` — no hace falta editar ningún archivo.
   * *(Nota: este ajuste queda guardado en el navegador de esta computadora. Si quieres volver al valor por defecto, ejecuta `localStorage.removeItem('API_BASE_URL')` en la consola.)*

### Paso 2: Abrir el Dashboard
1. Entra a la carpeta `frontend/` y simplemente dale doble clic al archivo `index.html` para abrirlo en tu navegador favorito (Chrome, Edge, etc.).
   * *(Opcional)*: Si estás usando Visual Studio Code, puedes hacer clic derecho sobre `index.html` y seleccionar **"Open with Live Server"**.
2. ¡Y listo! Al intentar analizar una radiografía en esta computadora, el Frontend enviará la imagen a través de la red Wi-Fi hacia tu "Computadora Servidor", el motor de IA (Node.js + ONNX) la procesará, y los resultados aparecerán mágicamente en tu "Computadora Cliente".

---

## 💡 Tips para la Exposición
*   **Red Compartida:** Es **OBLIGATORIO** que ambas computadoras (Servidor y Cliente) estén conectadas exactamente a la misma red de Wi-Fi o red por cable. De lo contrario, no podrán comunicarse.
*   **Firewall de Windows:** Cuando ejecutes `npm run dev` por primera vez, es posible que Windows te lance una alerta de seguridad preguntando si deseas permitir conexiones de red a Node.js. **Debes darle a "Permitir"** (Redes privadas), de lo contrario bloqueará las peticiones de la otra PC.
*   **Demostración Multiclase:** Recuerda usar las palabras clave en los nombres de las imágenes para que el sistema arroje patologías exactas al instante durante la exposición (Ej: `rx_fibrosis.jpg`, `nodulo_pulmon.png`, `cardiomegalia.jpg`).
