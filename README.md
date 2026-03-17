# 🃏 Poker Plan Pro - Circular Edition

Una aplicación de **Planning Poker** en tiempo real diseñada para equipos modernos que buscan una experiencia interactiva, rápida y divertida. A diferencia de otras herramientas, esta versión posiciona a los jugadores en una **mesa circular** y permite la interacción social mediante emojis y efectos de "zumbido".

![Licencia](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/node.js-%3E%3D14.0.0-emerald)
![Socket.io](https://img.shields.io/badge/realtime-Socket.io-orange)

## ✨ Características Principales

* **📍 Mesa Circular Dinámica:** Los jugadores se posicionan automáticamente alrededor de la mesa mediante cálculos geométricos.
* **🔥 Interacción Social:** Sistema de "proyectiles" de emojis. Haz clic en la carta de un compañero para lanzarle un emoji.
* **📳 Efecto Zumbido:** Si un usuario recibe más de 8 emojis seguidos, su pantalla vibrará (solo para él).
* **📂 CSV Optimizado para LLMs:** Exporta el historial de toda la sesión (múltiples rondas) en un formato listo para ser analizado por ChatGPT o Claude.
* **🏠 Sistema de Salas:** Crea salas únicas simplemente compartiendo una URL (ej: `tu-app.com/?room=equipo-alfa`).
* **🌓 Interfaz Dark Mode:** Estética limpia y moderna usando Tailwind CSS.

## 🚀 Instalación Rápida

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/tu-usuario/poker-plan-circular.git](https://github.com/tu-usuario/poker-plan-circular.git)
    cd poker-plan-circular
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Iniciar el servidor:**
    ```bash
    npm start
    ```

4.  **Abrir en el navegador:**
    Ve a `http://localhost:3000`

## 🛠️ Stack Tecnológico

* **Backend:** [Node.js](https://nodejs.org/) con [Express](https://expressjs.com/).
* **Real-time:** [Socket.io](https://socket.io/) para la sincronización de votos y eventos.
* **Frontend:** HTML5, JavaScript (ES6+) y [Tailwind CSS](https://tailwindcss.com/) para los estilos.
* **Animaciones:** CSS Keyframes y cálculos trigonométricos para la disposición circular.

## 📊 Formato de Exportación (CSV)

El archivo generado permite realizar retrospectivas profundas:
| Ronda | Tarea | Jugador | Voto |
| :--- | :--- | :--- | :--- |
| 1 | JIRA-101 | Ana | 5 |
| 1 | JIRA-101 | Pedro | 8 |
| 2 | JIRA-102 | Ana | 3 |

## 🌐 Despliegue (Hosting Gratis)

Este proyecto está optimizado para funcionar en **Render**, **Railway** o **Fly.io**:

1.  Sube tu código a un repositorio de GitHub.
2.  Conecta el repo a **Render.com** (Web Service).
3.  Comando de Build: `npm install`
4.  Comando de Start: `npm start`
5.  *Nota: Asegúrate de que la variable de entorno `PORT` esté disponible (ya configurado en el código).*

---
Creado con ❤️ para equipos que odian las reuniones aburridas.
