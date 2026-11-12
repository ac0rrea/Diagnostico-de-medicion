# WE ARE · Diagnóstico de medición digital

Prototipo del Nivel 3 para una primera conversación entre Paid Media y Proyectos.

## Mostrar el prototipo

1. Abrir public/index.html en el navegador.
2. Elegir **Cargar ejemplo**. La auditoría, la URL y las evidencias son ficticias.
3. Completar URL, marca y nombre de quien revisa. La plataforma es opcional. La fecha se registra al guardar o generar el informe.
4. Abrir **Cómo hacer un diagnóstico** y revisar los controles. Cada uno tiene un estado y un espacio opcional para una nota o evidencia, con un ejemplo. Abrir el informe, descargarlo o guardarlo en el historial local.

La ficha también se puede completar manualmente con una URL propia. El historial vive en el almacenamiento del navegador y queda separado por origen. La descarga genera un informe HTML independiente, legible en el navegador e imprimible. La derivación se registra en la ficha y en el informe, con campos para responsable, fecha y enlace a Monday.

## GitHub y Netlify

Subir el contenido de esta carpeta a un repositorio de GitHub. En Netlify, importar ese repositorio como proyecto. El archivo netlify.toml ya establece public como carpeta publicada y netlify/functions como carpeta de funciones. No se necesita comando de compilación ni variables de entorno. Para ejecutar el conjunto en desarrollo se puede usar `netlify dev`. Una publicación solo estática habilita el ejemplo y la ficha manual. El escaneo de URLs necesita el despliegue desde el repositorio para incluir la función.

## Alcance del escaneo

La función revisa el HTML público de la URL y hasta dos rutas del mismo origen, priorizando patrones de categoría y producto como en el Estimador WE ARE. Solicita HTTP(S) en puertos estándar, resuelve y fija IP públicas IPv4, vuelve a validar redirecciones y limita tiempo y tamaño. Omite acciones, checkout, autenticación y consultas en el recorrido del sitio. Informa indicios de GA4, GTM, Clarity y Meta Pixel y sus IDs cuando son visibles.

Para Clarity, el escaneo también inspecciona el JavaScript de hasta dos contenedores GTM publicados detectados, mediante el endpoint público de Google. La señal se muestra con su origen. El contenedor puede incluir una etiqueta condicionada por consentimiento, rutas u otras reglas. La inspección no ejecuta JavaScript ni comprueba que la etiqueta se haya activado. Si falta una señal, el aplicativo dirige a la guía de verificación del checklist. Para confirmar ejecución se puede buscar una solicitud de recopilación de Clarity al navegar o revisar el disparo en GTM. Para confirmar recepción, se busca la sesión en Grabaciones del proyecto correspondiente.

Los estados del checklist los completa quien audita. Consentimiento, compras, CAPI y deduplicación requieren controles adicionales.

Para uso con cuentas reales, coordinar el acceso al despliegue y a las evidencias con la agencia. El prototipo guarda las fichas por navegador, no comparte datos con Monday y no incorpora cuentas de usuario. El paso siguiente previsto es integrar sesiones de navegador real y un historial compartido con permisos.

