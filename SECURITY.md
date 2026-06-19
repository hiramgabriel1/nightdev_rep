# Seguridad y Privacidad

## Compromiso

En Nightdev nos tomamos tu privacidad y seguridad muy en serio.

## Datos que manejamos

- **API Keys** (proveedores como Anthropic, OpenAI, etc.) — se almacenan cifradas y solo se usan exclusivamente para procesar tus solicitudes a través del modelo que elegiste.
- **Tokens de Telegram** — solo para la autenticación del bot.
- **Repositorios de GitHub** — solo para subir el código que tú solicites.

## Lo que NO hacemos

- No almacenamos ni inspeccionamos tu código fuente.
- No compartimos tus API keys con terceros.
- No usamos tus datos para entrenar modelos.
- No exponemos tus credenciales en logs o respuestas (están filtradas automáticamente).

## Infraestructura

- Cada usuario corre en un **contenedor Docker aislado**.
- No hay compartición de archivos entre contenedores.
- La comunicación entre el bot y el bridge usa un token de autenticación interno.
- El acceso SSH al servidor está restringido por clave pública.

## Reportar un problema de seguridad

Si encuentras una vulnerabilidad, abre un issue en el repositorio o contacta a los mantenedores directamente.
