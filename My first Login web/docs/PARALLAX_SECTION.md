# ParallaxSection — guía completa

Este documento describe cómo usar y personalizar el componente `ParallaxSection` de este proyecto. `ParallaxSection` aplica un efecto parallax a secciones normales de la página basándose en la posición de scroll, con soporte para múltiples "capas" internas que se mueven a velocidades diferentes.

## Características principales

- Scroll-driven: calcula el progreso (0..1) según la posición de la sección respecto al viewport.
- Multi-layer: detecta elementos hijos con el atributo `data-parallax-depth` (valor 0..1) y aplica transform/opacidad por capa.
- Performance: usa `IntersectionObserver` para evitar trabajo cuando la sección está fuera de la vista y `requestAnimationFrame` para actualizaciones suaves.
- Exposición CSS: el contenedor exporta la variable CSS `--parallax-progress` que puedes usar en tus estilos (fondos, filtros, positions).

## API / Props

- `maxTranslate?: number` — Distancia máxima de translateY en px (por defecto 80). El cálculo por capa multiplica este valor por `depth`.
- `fade?: boolean` — Si `true` aplica cambios de opacidad basados en el progreso (por defecto `true`).
- `className?: string`, `style?: CSSProperties` — Props habituales.

## Estructura recomendada

Coloca elementos dentro de `ParallaxSection` y añade `data-parallax-depth` en cada capa para controlar su velocidad. 0 = movimiento mínimo, 1 = movimiento máximo (más cercano al observador).

Ejemplo:

```tsx
<ParallaxSection maxTranslate={80} fade>
  <section>
    {/* capa de fondo - mueve poco */}
    <div data-parallax-depth="0.2" className="parallax-layer">Fondo</div>

    {/* contenido central - mueve medio */}
    <div data-parallax-depth="0.5" className="parallax-layer">Contenido</div>

    {/* primer plano - mueve más */}
    <div data-parallax-depth="0.9" className="parallax-layer">Primer plano</div>
  </section>
</ParallaxSection>
```

### Notas de profundidad

- Usa valores entre 0 y 1. Valores menores producen movimiento más sutil.
- Si una capa debe permanecer fija, usa `data-parallax-depth="0"`.

## Usar la variable CSS `--parallax-progress`

`ParallaxSection` escribe la variable `--parallax-progress` en el elemento contenedor. Puedes enlazar esta variable en CSS para mover background-position, ajustar filtros o animar otros estilos.

Ejemplo en CSS:

```css
.hero-bg {
  background-position: center calc(50% + (var(--parallax-progress, 0) * 40px));
  filter: blur(calc(6px * (1 - var(--parallax-progress, 1))));
}
```

## Buenas prácticas de rendimiento

- Evita transformar propiedades que provoquen repaints costosos; `transform` y `opacity` son las mejores opciones.
- Mantén `will-change: transform, opacity` en elementos que se actualizan frecuentemente para mejorar el rendimiento (pero quítalo si la sección ya no se anima).
- Usa imágenes optimizadas y sprites en capas de fondo.
- Para muchas secciones en la página: reducimos trabajo gracias al `IntersectionObserver` que evita actualizaciones cuando la sección no está visible.

## Ejemplos avanzados

- Sincronizar con `LetterGlitch`: si usas un canvas o efecto que también tiene `--parallax-progress`, puedes leerlo desde CSS o usar `onProgress` (si deseas) y sincronizar programáticamente.
- Añadir profundidad en 3 capas: fondo (0.15), medios (0.45) y primer plano (0.9) produce un efecto realista.

## Recomendaciones de diseño

- Usa `maxTranslate` entre 40 y 120 px según tamaño de sección.
- En móviles reduce movimiento (o desactiva) para evitar mareos: usa media queries y ajusta `maxTranslate` o `fade`.

## Troubleshooting

- Si no ves movimiento:
  - Asegúrate que la sección está en el flujo del documento (no con `position: fixed` que la aísle del cálculo del viewport).
  - Comprueba que los elementos hijos tienen `data-parallax-depth` y que sus estilos no sobreescriben `transform`.

- Si notas saltos:
  - Verifica que no haya otras librerías que manejen `transform` en los mismos elementos.
  - Prueba reducir la frecuencia de `requestAnimationFrame` o simplificar transformaciones.

## Migraciones y compatibilidad

- `ParallaxSection` usa APIs web modernas (IntersectionObserver y requestAnimationFrame). Es compatible con la mayoría de navegadores modernos. Para navegadores muy antiguos, considera un fallback con `position: sticky` y `background-attachment: fixed`.

---

Si quieres, genero ejemplos listos para copiar (cards con depth, imágenes de fondo por capas, etc.), o adapto `LetterGlitch` para leer `--parallax-progress` y sincronizar efectos. ¿Qué prefieres primero?
