/**
 * Pizarra de Post-its Interactivos (CRUD Completo, Gestos y Firebase)
 */

// 1. Importaciones de módulos de Firebase CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 2. Configuración de tu proyecto Firebase (Sustituye por tus claves)
const firebaseConfig = {
***REMOVED***
  authDomain: "pizarrainteractiva-1fc36.firebaseapp.com",
  projectId: "pizarrainteractiva-1fc36",
  storageBucket: "pizarrainteractiva-1fc36.firebasestorage.app",
  messagingSenderId: "164631583161",
  appId: "1:164631583161:web:828d8bdc237f2262b13e68",
  measurementId: "G-6C1HNQEP0Y"
***REMOVED***

// Inicializar Firebase y Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const postitsRef = collection(db, "posits");

document.addEventListener('DOMContentLoaded', () => {
    // Referencias del DOM
    const canvas = document.getElementById('canvas');
    const fab = document.getElementById('fab');
    
    // Modales
    const noteModal = document.getElementById('note-modal');
    const modalTitle = document.getElementById('modal-title');
    const noteText = document.getElementById('note-text');
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');
    const colorPicker = document.getElementById('color-picker');

    const deleteModal = document.getElementById('delete-modal');
    const deleteCancel = document.getElementById('delete-cancel');
    const deleteConfirm = document.getElementById('delete-confirm');

    // Estado local
    let currentEditingNote = null; // Guardará el elemento del DOM si editamos
    let selectedColor = 'yellow';
    let notePendingDelete = null;

    // ======================================================
    // 3. SINCRONIZACIÓN EN TIEMPO REAL (READ DE FIREBASE)
    // ======================================================
    onSnapshot(postitsRef, (snapshot) => {
        // Limpiamos el lienzo antes de renderizar los cambios
        canvas.innerHTML = '';

        snapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            renderNoteOnCanvas({
                id: docSnapshot.id,
                text: data.texto || data.text || '',
                color: data.color || 'yellow',
                x: data.coordenadaX ?? data.x ?? 100,
                y: data.coordenadaY ?? data.y ?? 100,
                fechaCreacion: data.fechaCreacion
            });
        });
    });

    // ======================================================
    // 4. CREAR (CREATE) Y ACTUALIZAR (UPDATE) EN FIREBASE
    // ======================================================

    // Abrir modal de creación (FAB)
    fab.addEventListener('click', () => {
        currentEditingNote = null;
        modalTitle.textContent = 'Nuevo Post-it';
        noteText.value = '';
        selectedColor = 'yellow';
        updateColorPickerUI();
        noteModal.classList.add('active');
        noteText.focus();
    });

    modalCancel.addEventListener('click', () => {
        noteModal.classList.remove('active');
    });

    // Selección de color en el modal
    colorPicker.addEventListener('click', (e) => {
        const option = e.target.closest('.color-option');
        if (!option) return;
        selectedColor = option.dataset.color;
        updateColorPickerUI();
    });

    function updateColorPickerUI() {
        document.querySelectorAll('.color-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.color === selectedColor);
        });
    }

    // Guardar (Crear o Editar)
    modalSave.addEventListener('click', async () => {
        const textValue = noteText.value.trim();
        if (!textValue) return;

        modalSave.disabled = true;

        try {
            if (currentEditingNote) {
                // ACTUALIZAR (Update) texto y color en Firebase
                const docId = currentEditingNote.dataset.id;
                const noteDocRef = doc(db, "postits", docId);
                
                await updateDoc(noteDocRef, {
                    texto: textValue,
                    color: selectedColor
                });
            } else {
                // CREAR (Create) nueva nota centrada en pantalla
                const posX = Math.round(window.innerWidth / 2 - 80);
                const posY = Math.round(window.innerHeight / 2 - 80);

                await addDoc(postitsRef, {
                    texto: textValue,
                    color: selectedColor,
                    coordenadaX: posX,
                    coordenadaY: posY,
                    fechaCreacion: Date.now()
                });
            }

            noteModal.classList.remove('active');
        } catch (error) {
            console.error("Error al guardar en Firebase:", error);
        } finally {
            modalSave.disabled = false;
        }
    });

    // ======================================================
    // 5. RENDERIZADO Y CONTROLADORES TÁCTILES EN EL DOM
    // ======================================================
    function renderNoteOnCanvas(data) {
        const note = document.createElement('div');
        note.className = `post-it ${data.color}`;
        note.style.left = `${data.x}px`;
        note.style.top = `${data.y}px`;
        note.dataset.id = data.id;

        // Formato de fecha
        const fechaStr = data.fechaCreacion 
            ? new Date(data.fechaCreacion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            : 'Hoy';

        note.innerHTML = `
            <div class="post-it-content">${escapeHTML(data.text)}</div>
            <div class="post-it-footer">${fechaStr}</div>
        `;

        initTouchGestures(note);
        canvas.appendChild(note);
    }

    // Lógica de Gestos Táctiles (Drag, Doble Tap, Swipe)
    function initTouchGestures(note) {
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;
        let isDragging = false;
        let lastTapTime = 0;
        let touchStartTime = 0;
        let deltaX = 0;

        note.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;

            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            initialLeft = note.offsetLeft;
            initialTop = note.offsetTop;

            isDragging = false;
            touchStartTime = Date.now();
            deltaX = 0;

            // Detección de Doble Toque (Update)
            const currentTime = Date.now();
            if (currentTime - lastTapTime < 300 && currentTime - lastTapTime > 0) {
                e.preventDefault();
                openEditModal(note);
                return;
            }
            lastTapTime = currentTime;
        }, { passive: false });

        note.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) return;
            const touch = e.touches[0];
            const moveX = touch.clientX - startX;
            const moveY = touch.clientY - startY;

            if (!isDragging && (Math.abs(moveX) > 8 || Math.abs(moveY) > 8)) {
                isDragging = true;
                note.style.transition = 'none';
                note.style.zIndex = 100;
            }

            if (isDragging) {
                note.style.left = `${initialLeft + moveX}px`;
                note.style.top = `${initialTop + moveY}px`;
                deltaX = moveX;
            }

            e.preventDefault();
        }, { passive: false });

        note.addEventListener('touchend', async () => {
            if (!isDragging) return;

            const elapsedTime = Date.now() - touchStartTime;
            isDragging = false;
            note.style.zIndex = 1;
            note.style.transition = 'transform 0.2s ease, left 0.3s ease, top 0.3s ease';

            // Evaluar Swipe (Borrar)
            if (Math.abs(deltaX) > 90 && elapsedTime < 300) {
                triggerDeleteFlow(note, deltaX);
            } else {
                // Actualizar coordenadas en Firebase tras arrastrar
                const finalX = note.offsetLeft;
                const finalY = note.offsetTop;
                const noteDocRef = doc(db, "postits", note.dataset.id);
                
                try {
                    await updateDoc(noteDocRef, {
                        coordenadaX: finalX,
                        coordenadaY: finalY
                    });
                } catch (err) {
                    console.error("Error al actualizar posición:", err);
                }
            }
        });
    }

    // Abrir modal en modo edición
    function openEditModal(note) {
        currentEditingNote = note;
        modalTitle.textContent = 'Editar Post-it';
        noteText.value = note.querySelector('.post-it-content').textContent;

        const colorClasses = ['yellow', 'pink', 'blue', 'green', 'purple'];
        for (let c of colorClasses) {
            if (note.classList.contains(c)) {
                selectedColor = c;
                break;
            }
        }
        updateColorPickerUI();
        noteModal.classList.add('active');
        noteText.focus();
    }

    // ======================================================
    // 6. BORRAR (DELETE) Y CONFIRMACIÓN
    // ======================================================
    function triggerDeleteFlow(note, direction) {
        notePendingDelete = note;
        const slideDistance = direction > 0 ? window.innerWidth : -window.innerWidth;
        note.style.transform = `translateX(${slideDistance}px) rotate(${direction > 0 ? 15 : -15}deg)`;
        note.style.opacity = '0';
        deleteModal.classList.add('active');
    }

    // Cancelar borrado -> Restitución fluida de la nota
    deleteCancel.addEventListener('click', () => {
        if (notePendingDelete) {
            notePendingDelete.style.transform = 'rotate(0deg)';
            notePendingDelete.style.opacity = '1';
            notePendingDelete = null;
        }
        deleteModal.classList.remove('active');
    });

    // Confirmar borrado -> Eliminar de Firebase
    deleteConfirm.addEventListener('click', async () => {
        if (notePendingDelete) {
            const docId = notePendingDelete.dataset.id;
            deleteModal.classList.remove('active');
            
            try {
                await deleteDoc(doc(db, "postits", docId));
            } catch (err) {
                console.error("Error al eliminar nota:", err);
            } finally {
                notePendingDelete = null;
            }
        }
    });

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});