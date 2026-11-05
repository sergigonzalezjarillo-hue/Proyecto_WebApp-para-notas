/**
 * Pizarra de Post-its Interactivos (CRUD Completo, Gestos y Firebase)
 * Funciona con ratón y con táctil (Pointer Events).
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

// 2. Configuración de tu proyecto Firebase
import { firebaseConfig } from "./firebase_config.js";

// Inicializar Firebase y Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Nombre de la colección: UNO SOLO para todo el archivo
const COLECCION = "postits";
const postitsRef = collection(db, COLECCION);

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
    let currentEditingNote = null; // Elemento del DOM si estamos editando
    let selectedColor = 'yellow';
    let notePendingDelete = null;

   
    // 3. SINCRONIZACIÓN EN TIEMPO REAL (READ DE FIREBASE)
    
    onSnapshot(
        postitsRef,
        (snapshot) => {
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
        },
        (error) => {
            // Si Firestore falla (reglas, red...) lo veremos en consola
            console.error("Error al leer de Firebase:", error);
        }
    );

    
    // 4. CREAR (CREATE) Y ACTUALIZAR (UPDATE) EN FIREBASE
   

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
                const noteDocRef = doc(db, COLECCION, docId);

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

    
    // 5. RENDERIZADO Y GESTOS (RATÓN + TÁCTIL)
   
    function renderNoteOnCanvas(data) {
        const note = document.createElement('div');
        note.className = `post-it ${data.color}`;
        note.style.left = `${data.x}px`;
        note.style.top = `${data.y}px`;
        note.dataset.id = data.id;

        // Formato de fecha: "Mon 13, 9:43"
        let fechaStr = 'Hoy';

        if (data.fechaCreacion) {
            const fecha = new Date(data.fechaCreacion);
            const dia = fecha.toLocaleDateString('en-US', { weekday: 'short' }); // Mon
            const numero = fecha.getDate();                                      // 13
            const horas = fecha.getHours();                                      // 9
            const minutos = String(fecha.getMinutes()).padStart(2, '0');         // 43

            fechaStr = `${dia} ${numero}, ${horas}:${minutos}`;
        }

        note.innerHTML = `
            <div class="post-it-content">${escapeHTML(data.text)}</div>
            <div class="post-it-footer">${fechaStr}</div>
        `;

        initGestures(note);
        canvas.appendChild(note);
    }

    // Guarda la posición actual de una nota en Firebase
    async function savePosition(note) {
        try {
            await updateDoc(doc(db, COLECCION, note.dataset.id), {
                coordenadaX: note.offsetLeft,
                coordenadaY: note.offsetTop
            });
        } catch (err) {
            console.error("Error al actualizar posición:", err);
        }
    }

    // Gestos: arrastrar, doble toque/clic (editar) y swipe rápido (borrar)
    function initGestures(note) {
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;
        let isPressed = false;
        let isDragging = false;
        let lastTapTime = 0;
        let touchStartTime = 0;
        let deltaX = 0, deltaY = 0;

        note.addEventListener('pointerdown', (e) => {
            // Solo botón principal del ratón (o un dedo / lápiz)
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            isPressed = true;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = note.offsetLeft;
            initialTop = note.offsetTop;
            touchStartTime = Date.now();
            deltaX = 0;
            deltaY = 0;

            // Detección de doble toque / doble clic (Update)
            const currentTime = Date.now();
            if (currentTime - lastTapTime < 300 && currentTime - lastTapTime > 0) {
                isPressed = false;
                lastTapTime = 0;
                openEditModal(note);
                return;
            }
            lastTapTime = currentTime;

            // Seguimos al puntero aunque salga de la nota
            note.setPointerCapture(e.pointerId);
        });

        note.addEventListener('pointermove', (e) => {
            if (!isPressed) return;

            const moveX = e.clientX - startX;
            const moveY = e.clientY - startY;

            if (!isDragging && (Math.abs(moveX) > 8 || Math.abs(moveY) > 8)) {
                isDragging = true;
                note.style.transition = 'none';
                note.style.zIndex = 100;
            }

            if (isDragging) {
                note.style.left = `${initialLeft + moveX}px`;
                note.style.top = `${initialTop + moveY}px`;
                deltaX = moveX;
                deltaY = moveY;
            }
        });

        note.addEventListener('pointerup', async () => {
            if (!isPressed) return;
            isPressed = false;
            if (!isDragging) return;

            const elapsedTime = Date.now() - touchStartTime;
            isDragging = false;
            note.style.zIndex = 1;
            note.style.transition = 'transform 0.2s ease, left 0.3s ease, top 0.3s ease';

            // Swipe horizontal rápido -> flujo de borrado
            if (Math.abs(deltaX) > 90 && Math.abs(deltaY) < 60 && elapsedTime < 500) {
                triggerDeleteFlow(note, deltaX);
            } else {
                // Guardar la nueva posición tras arrastrar
                await savePosition(note);
            }
        });

        // Si el sistema cancela el gesto, soltamos la nota donde esté
        note.addEventListener('pointercancel', () => {
            isPressed = false;
            isDragging = false;
            note.style.zIndex = 1;
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

   
    // 6. BORRAR (DELETE) Y CONFIRMACIÓN
   
    function triggerDeleteFlow(note, direction) {
        notePendingDelete = note;
        const slideDistance = direction > 0 ? window.innerWidth : -window.innerWidth;
        note.style.transform = `translateX(${slideDistance}px) rotate(${direction > 0 ? 15 : -15}deg)`;
        note.style.opacity = '0';
        deleteModal.classList.add('active');
    }

    // Cancelar borrado -> la nota vuelve y se guarda donde quedó
    deleteCancel.addEventListener('click', async () => {
        if (notePendingDelete) {
            const note = notePendingDelete;
            notePendingDelete = null;
            note.style.transform = 'rotate(0deg)';
            note.style.opacity = '1';
            await savePosition(note);
        }
        deleteModal.classList.remove('active');
    });

    // Confirmar borrado -> Eliminar de Firebase
    deleteConfirm.addEventListener('click', async () => {
        if (notePendingDelete) {
            const docId = notePendingDelete.dataset.id;
            deleteModal.classList.remove('active');

            try {
                await deleteDoc(doc(db, COLECCION, docId));
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