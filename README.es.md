# TimeMapper

[English](README.md) | [繁體中文](README.zh-TW.md) | **Español**

Una extensión de Chrome para comparar la hora en varios husos horarios. Haz clic en las ciudades del mapa mundial y alinea sus días en una línea de tiempo de 24 horas para encontrar un momento que le sirva a todos.

---

## Instalación

1. Descarga o clona este repositorio.
2. Abre Chrome y entra en `chrome://extensions/`.
3. Activa el **Modo desarrollador** en la esquina superior derecha.
4. Haz clic en **Cargar descomprimida** y selecciona la carpeta raíz del repositorio.
5. Haz clic en el icono de TimeMapper en la barra de herramientas de Chrome.

---

## Cómo se usa

**Elige ciudades** — haz clic en cualquier marcador del mapa mundial para añadir esa ciudad a la línea de tiempo; vuelve a hacer clic para quitarla. La primera vez que abras la ventana ya estarán seleccionadas Tokio, Nueva York, Los Ángeles y tu hora local.

**Abre la lista de ciudades** — el botón 🏙️ de la barra superior te permite buscar cualquier ciudad por nombre, revisar y reordenar tu lista actual, cambiar el máximo de ciudades, cargar un conjunto de ejemplo o borrarlo todo.

**Lee la línea de tiempo** — cada fila es el día de 24 horas de una ciudad y la **línea actual** vertical marca este preciso momento. La celda de las `00` también muestra la fecha, para que veas dónde cambia el día.

**Compara un momento concreto** — haz clic en cualquier parte de la línea de tiempo para colocar una línea de alineación (hasta cuatro). Arrástrala para moverla o pulsa su `[x]` para quitarla. Cada fila muestra a qué hora es ese momento en esa ciudad.

**Usa el mapa** — el mapa puede sombrear la zona nocturna actual, dibujar las líneas de cada hora y mostrar una burbuja con la hora sobre cada ciudad seleccionada. El panel del mapa se puede plegar si solo quieres la línea de tiempo.

---

## Ajustes

Haz clic en el botón ⚙ de la barra superior para abrir la página de ajustes:

| Sección | Qué puedes hacer |
| --- | --- |
| **Ajustes de idioma** | Cambia la interfaz entre 繁體中文, English y Español. |
| **Ajustes del minimapa** | Activa o desactiva la zona nocturna, las líneas de hora y las burbujas de hora; ajusta los desplazamientos de longitud/latitud, la escala de ancho/alto y el desplazamiento vertical; restablece los valores predeterminados. |
| **Ajustes de periodos** | Elige la referencia de la línea actual (la hora local del navegador o la de la primera ciudad) y define el rango horario y los colores de fondo y de texto de tres periodos resaltados. Por defecto son 08–17, 18–23 y 00–07. |
| **Apariencia** | Tema automático, oscuro o claro. Automático sigue la preferencia del sistema. |

Tus ciudades, periodos y la calibración del mapa se guardan en el `localStorage` del navegador y se restauran la próxima vez que abras la ventana.

---

## Una ciudad que no está en el mapa

Búscala en la lista de ciudades. Los resultados vienen de la [API de geocodificación de Open-Meteo](https://geocoding-api.open-meteo.com/), así que buscar requiere conexión a internet. La ciudad que elijas se coloca en el mapa con sus propias coordenadas y se recuerda para la próxima vez.

Para añadir una ciudad permanentemente a la lista integrada, edita `cityCatalog` en `src/shared/cities.js`. Las constantes que convierten longitud/latitud en una posición del mapa están documentadas en el bloque `PROJECTION`, al principio de `src/shared/config.js`.

---

## Comprobar las traducciones

`node tools/check-i18n.mjs` comprueba que los diccionarios de `src/shared/i18n.js` sigan cubriendo todas las cadenas que usan las páginas. Ejecútalo después de añadir una cadena, un idioma o una ciudad.
