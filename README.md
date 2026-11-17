# PatrimonioMC — Simulador Monte Carlo de Patrimonio e Inflación

> **Enlaces del proyecto**

**Link:** ` `

**Repositorio en GitHub:** `https://github.com/HunabBohorquez/PatrimonioMC`

> 📝 **Nota:** este proyecto tiene los **mismos archivos** que el repositorio de GitLab
> (`index.html`, `styles.css`, `app.js`, `README.md`). Solo cambia la plataforma de alojamiento.

---

## Descripción del Proyecto
PatrimonioMC es una aplicación de ingeniería financiera *frontend-only* construida estrictamente con Vanilla JavaScript, HTML5 y CSS3. Su propósito es simular el crecimiento patrimonial contrastando modelos clásicos deterministas frente a modelos estocásticos (Monte Carlo) que incorporan variables del mundo real: inflación anual, volatilidad del mercado y riesgo de impago en aportaciones.

## Fórmulas y Matemáticas Implementadas

### 1. Tasa Real Ajustada por Inflación
En la vista determinista, el capital nominal crece por un interés compuesto convencional:
`V_nom = V_prev * (1 + r/12) + Aportación`

Para conocer el **poder adquisitivo real**, se descuenta la inflación capitalizada usando un deflactor de tasa real exacta:
`V_real = V_nom / (1 + inf_mensual)^n`
Donde `inf_mensual = (1 + inf_anual)^(1/12) - 1`

### 2. Método Monte Carlo y Box-Muller
En la vista estocástica, la iteración (5,000 caminos independientes) utiliza rendimientos aleatorios distribuidos normalmente:
`r_estocastico = (Tasa/12) + randn() * (Volatilidad / sqrt(12))`

Dado que `Math.random()` entrega una distribución uniforme, implementamos el algoritmo de **Box-Muller** para transformarla en una campana de Gauss normalizada (µ=0, σ=1):
`Z = sqrt(-2 * ln(U1)) * cos(2 * π * U2)`
Esto permite simular fielmente crisis (caídas de bolsa) o periodos de sobre-rendimiento.

## Instrucciones de Ejecución
1. Descarga o clona la carpeta con los 4 archivos (`index.html`, `styles.css`, `app.js`, `README.md`).
2. Haz doble clic en el archivo `index.html` para abrirlo en cualquier navegador web moderno.
3. No requiere NodeJS, NPM, servidores locales ni conexión a internet (0 dependencias).

## Pruebas Verificables
Para auditar la validez matemática del simulador, hemos bloqueado la semilla estocástica (`seed = 42`) y puedes corroborarlo cargando el preset **"Meta Equipo/Auto 5 años"** (Capital $10,000, Aporte $2,000/mes, Inflación 4.0%).

**Resultados esperados de la prueba (Visibles en pantalla):**
- **Nominal Renta Fija (9.5%):** El valor exacto al final del mes 60 por matemática finita debe ser aproximadamente `$168,915`.
- **Real Renta Fija (9.5% deflactado a 4%):** Debe rondar los `$138,834`.
- **Probabilidad Monte Carlo (Target = 150k Real, Vol=10%, Riesgo Impago=5%):** Con la semilla 42, el cálculo estocástico procesará internamente un target nominal equivalente de ~$182,497. La probabilidad de éxito calculada se estabilizará consistentemente y el sistema ejecutará una búsqueda binaria para sugerir un incremento exacto de aportación para garantizar el 90%.
