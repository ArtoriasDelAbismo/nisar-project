# NISAR project

Camp Sentinel es un prototipo de apoyo a decisiones para monitorear campamentos y sitios de personas desplazadas con imágenes de radar reales del satélite NISAR (NASA-ISRO). Cubre dos regiones: la franja costera de Gaza y la red de centros colectivos de Lviv, en Ucrania.

> Es un prototipo. No es un sistema oficial de alerta temprana ni de emergencias.

## Qué es real y qué es simulado

| Real | Simulado |
| --- | --- |
| Imágenes de radar NISAR de 20 m | Polígonos de sectores |
| Cambio de radar entre pasadas | Población, refugios e instalaciones |
| Mediciones de cambio por sector y registro de cambios | Índices de riesgo, pronósticos y alertas |
| Fechas, órbitas y calidad de las pasadas | Demografía y línea de tiempo de desplazamiento |
| Catálogo y vistas rápidas de la NASA en vivo | Conexiones con otras fuentes (DEM, clima, HDX, DTM, ACNUR) |

Las mediciones de radar son reales, pero los sectores donde se calculan son simulados. Sirven para saber dónde mirar, no para sacar conclusiones sobre un campamento concreto. Tampoco alimentan los índices de riesgo.

## Funciones

- **Explorador de mapas:** imagen de radar, mapa de cambio y vista rápida amplia de NISAR, con línea de tiempo de pasadas, comparación deslizante, capas ajustables y detalle por sector.
- **Registro de cambios:** sectores donde cambió al menos el 1% del área, con el porcentaje más brillante y más oscuro.
- **Cambio de radar por pasada:** gráfico con el promedio de área cambiada en cada región.
- **Riesgos y alertas:** índices transparentes para inundación, helada, calor extremo y viento, con pesos configurables, reglas y ciclo de vida de alertas (datos simulados).
- **Sitios y demografía:** desglose por sector, matriz de instalaciones, exportación a CSV y perfiles de población (datos simulados).
- **Fuentes de datos:** catálogo de fuentes que aclara cuáles son reales.
- **Idiomas:** inglés y español. El selector también ofrece árabe y ucraniano, pero esos idiomas todavía no tienen traducción.

## Datos NISAR

El pipeline de `pipeline/` usa productos GCOV de nivel 2, en banda L y polarizaciones HH y HV. Lee de cada archivo solo la zona de interés, compara pasadas de la misma órbita y escribe los resultados en `public/data/nisar/`.

Los datos actuales son:

| Región | Pasadas | Período | Órbitas | Resolución de imagen |
| --- | --- | --- | --- | --- |
| Gaza | 9 | 1 sep. a 22 oct. de 2026 | 100 y 151 | 20 m |
| Lviv | 12 | 14 sep. a 20 oct. de 2026 | 22, 28, 100 y 123 | Unos 70 m (reducida) |

El método, los controles de calidad y sus límites están en [`pipeline/README.md`](pipeline/README.md).

## Cómo correrlo

Necesitás Node.js y npm:

```sh
npm install
npm run dev
```

Para las pruebas de la app:

```sh
npm test
```

Para actualizar los datos NISAR necesitás una cuenta de Earthdata Login y Python. Los pasos están en [`pipeline/README.md`](pipeline/README.md).

## Publicación

El sitio se publica en Netlify con la configuración de `netlify.toml`. Los datos NISAR ya están en el repositorio, así que el build no necesita Python ni credenciales de Earthdata.

## Tecnología

- App: TanStack Start, React, TypeScript, Tailwind CSS y MapLibre.
- Pipeline: Python, h5py, NumPy, SciPy y earthaccess.
