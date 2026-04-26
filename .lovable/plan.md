
# Prototipo Frontend – Sistema TLO

Prototipo navegable **solo frontend** para presentar al cliente. Sin backend, sin login real, sin base de datos: usa datos de ejemplo (mock) precargados en memoria para demostrar el flujo completo de viajes, rentabilidad y liquidación semanal.

## Marca y diseño

- **Logo TLO** (proporcionado por el cliente) usado en sidebar, header y pantalla de login.
- Identidad **Transportes Ligeros de Occidente**.
- Paleta inspirada en el logo: negro/grafito como color principal, blanco/gris claro de fondo, con acentos en azul acero para acciones y verde/rojo para indicadores de rentabilidad. Ámbar para alertas.
- Layout dashboard con sidebar colapsable, KPIs en tarjetas, tablas con filtros y modales para alta/edición.
- Indicadores visuales: badges de estado de viaje (En curso, Cerrado), márgenes en verde/rojo, mini-gráficos en KPIs.

## Estructura de navegación

Sidebar con logo TLO arriba y secciones:
- Dashboard
- Viajes
- Camiones
- Operadores
- Clientes
- Liquidaciones
- Reportes

## Pantallas del prototipo

### 1. Dashboard
KPIs de la semana: viajes en curso, viajes cerrados, ingresos, costos, utilidad neta, margen %, viajes con rentabilidad negativa. Tabla corta de viajes activos y botones rápidos (Nuevo viaje, Nueva liquidación). Mini gráfico de utilidad por día.

### 2. Camiones
Tabla con: número económico, placas, marca/modelo, año, rendimiento esperado km/l, costo/km referencia, estatus. Modal para alta/edición.

### 3. Operadores
Tabla con: nombre, teléfono, licencia, fecha de ingreso, esquema de comisión (% o monto fijo), estatus. Modal para alta/edición.

### 4. Clientes
Tabla con: razón social, RFC, contacto, teléfono. Modal para alta/edición.

### 5. Viajes (núcleo)
**Listado:** tabla con filtros por estado, operador, camión, cliente y fecha. Columnas: folio, fecha, ruta, operador, camión, tarifa, utilidad, margen %, estatus.

**Crear viaje (modal):** camión, operador, cliente, ruta (origen-destino), fecha y hora de salida, kilometraje inicial, tarifa pactada, viáticos entregados. Queda en estado **En curso**.

**Detalle del viaje** (página con pestañas):
- **Resumen**: datos generales, ruta, fechas, km, estatus.
- **Diesel**: lista de cargas (litros, $/litro, total, ubicación). Botón agregar.
- **Gastos**: lista categorizada (casetas, refacciones, hospedaje, comidas, otros) con check de comprobado/no comprobado.
- **Comisión**: cálculo automático según operador (editable).
- **Cierre**: km final, fecha llegada, número de factura. Botón “Cerrar viaje”.
- **Tarjeta de rentabilidad** siempre visible: Ingreso − Diesel − Gastos − Comisión = Utilidad neta y % margen. KPIs extra: $/km, rendimiento real km/l vs esperado, costo de diesel por km.

### 6. Liquidación semanal
- Selector de operador y rango de semana.
- Tabla de viajes del operador en el periodo (folio, fecha, ruta, km, ingreso, comisión).
- Viáticos: entregado vs comprobado, saldo a favor o en contra.
- Total de comisiones generadas.
- **Neto a pagar** = Comisiones − Saldo de viáticos no comprobados.
- Botones “Cerrar liquidación” y “Exportar PDF” (placeholder visual).

### 7. Reportes
Tabs: rentabilidad por camión, por operador, por cliente/ruta, e histórico de liquidaciones. Tablas con totales y mini gráficos. Botón de exportar (visual).

### 8. Login (mock)
Pantalla decorativa con logo TLO, email/contraseña y selector visual de rol (Admin / Capturista). Al entrar redirige al dashboard, sin validación real.

## Detalles técnicos

- **Stack:** React + Vite + Tailwind + shadcn/ui + react-router-dom. Sin backend.
- **Logo:** copiar a `src/assets/tlo-logo.jpeg` e importar como módulo en sidebar, header y login.
- **Datos:** `src/data/mockData.ts` con arrays realistas de camiones, operadores, clientes, viajes (con gastos/diesel/comisiones) y liquidaciones de ejemplo.
- **Estado:** Context API ligero para reflejar altas/ediciones durante la demo (no persisten al recargar).
- **Cálculos:** funciones helper puras para rentabilidad por viaje, agregados de liquidación y KPIs del dashboard.
- **Rutas:** `/login`, `/`, `/viajes`, `/viajes/:id`, `/camiones`, `/operadores`, `/clientes`, `/liquidaciones`, `/reportes`.

## Entregable

Prototipo navegable end-to-end con logo TLO, datos de ejemplo y flujo completo, listo para mostrar al cliente y validar antes de construir el backend real.
