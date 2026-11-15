# Bald Puppy

Agente de terminal basado en [Qwen Code](https://github.com/QwenLM/qwen-code), con una interfaz inspirada en [Zyn-Old](https://github.com/toZyn/Zyn-Old): panel compacto, fondo oscuro, acento ámbar y metadatos discretos.

## Instalar desde el código

Requiere Node.js 22 o superior y Corepack.

```bash
git clone https://github.com/toZyn/Bald-Puppy.git
cd Bald-Puppy
corepack pnpm install --frozen-lockfile
npm link
bald-puppy
```

La instalación compila y empaqueta el agente. `qwen` sigue disponible como alias. Para desarrollo: `npm run dev`. Para recompilar: `npm run build && npm run bundle`.

Se conservan los proveedores, autenticación, herramientas, permisos, MCP, sesiones, comandos y configuración de Qwen Code. Los ajustes continúan en `~/.qwen`; no se importan configuraciones antiguas de Codex. El tema oscuro predeterminado mantiene la clave `Qwen Dark` para compatibilidad; `/theme` permite cambiarlo. El modo sin colores y el lector de pantalla siguen disponibles.

La interfaz usa el renderizador de Qwen Code para conservar edición Unicode, pegado, streaming y redimensionamiento; no reutiliza el bucle de entrada de Zyn-Old. No se garantiza ausencia total de errores ni compatibilidad Android de todas las dependencias nativas.

## Procedencia

Base: QwenLM/qwen-code, commit `038b60e3099a174395f26ed0d1b501eb04d2302d` (0.27.3). El código anterior de Bald-Puppy queda recuperable en el historial de Git. Se conserva la licencia Apache-2.0 y los avisos del proyecto base. Consulta [la documentación original](README.upstream.md).
