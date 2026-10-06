# Launcher para tu servidor de Minecraft 1.21.1

Instala solo Java, Fabric, tus mods, tu resource pack y tus shaders. Cuando tú cambias algo, a los jugadores se les actualiza solo al darle a **Jugar**.
Funciona con cuentas **premium** (Microsoft) y **no premium** (solo el nombre).

## Cómo funciona

```
Tú metes archivos en  servidor-archivos/   ──►  GitHub (gratis)  ──►  el launcher los baja solo
 mods/  resourcepacks/  shaderpacks/  config/
```

El launcher compara lo que hay en el PC del jugador con la lista del servidor (`manifest.json`): descarga lo nuevo, actualiza lo que cambió y borra lo que quitaste.

---

## PASO 1. Cambia 3 datos

Abre `launcher/launcher.config.json` y cambia:

| Campo | Qué poner |
|---|---|
| `name` | El nombre de tu launcher (sale en la ventana) |
| `serverIp` | La IP de tu servidor. Con ella, el botón Jugar entra directo al server |
| `manifestUrl` | `https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/servidor-archivos/manifest.json` (cambia TU_USUARIO y TU_REPO) |

Opcional: en `links` pon tu Discord o web (con `https://`) y salen botones.
Si cambias `dataFolder` (carpeta donde guarda datos) y `productName` en `launcher/package.json`, queda con tu marca.

## PASO 2. Sube todo a GitHub

1. Crea un repositorio **público** en github.com (por ejemplo `mi-launcher`).
2. Sube **el contenido** de esta carpeta (no la carpeta en sí): `.github`, `herramientas`, `launcher`, `servidor-archivos`, etc.
3. Ve a la pestaña **Actions** y activa los workflows si te lo pide.

## PASO 3. Consigue el .exe (sin instalar nada)

1. En GitHub: **Actions → Compilar launcher → Run workflow**.
2. Espera unos 3 minutos. Al terminar, entra a la ejecución y baja **launcher-windows** (un zip).
3. Dentro hay dos archivos:
   - `NovaLauncher-portable.exe`: un solo archivo, se ejecuta sin instalar.
   - `NovaLauncher-instalador.exe`: se instala con acceso directo.

Para tener un enlace fijo de descarga para tus jugadores, sube una etiqueta (`v1`, `v2`...) y el .exe aparecerá en **Releases**.

> Windows puede avisar "Windows protegió su PC" porque el .exe no está firmado. Se pulsa **Más información → Ejecutar de todas formas**. Firmarlo cuesta dinero; para un servidor privado no hace falta.

Alternativa sin GitHub: instala Node.js y ejecuta `3-COMPILAR-LAUNCHER-LOCAL.bat`.

## PASO 4. Mete tus mods, resource pack y shaders

Todo va dentro de `servidor-archivos/`:

- **Mods**: archivos `.jar` de **Fabric** para 1.21.1 en `mods/`.
  Para bajar lo básico automáticamente (Fabric API, Sodium e Iris, que se necesitan para shaders), ejecuta `1-DESCARGAR-MODS-BASICOS.bat` (requiere Node.js). Para otros: `node herramientas/descargar-basicos.js lithium modmenu`.
- **Resource pack**: el `.zip` en `resourcepacks/`.
- **Shaders**: el `.zip` en `shaderpacks/`.
- **Config** (opcional): archivos de configuración que quieras forzar.

Para que el resource pack y los shaders **se activen solos**, abre `servidor-archivos/ajustes.json` y escribe el nombre exacto del archivo:

```json
"apply": { "resourcePack": "MiPack.zip", "shaderPack": "MiShader.zip" }
```

Se activan la primera vez que cambian; luego el jugador puede elegir otros si quiere.

En `ajustes.json` también puedes poner las **novedades** que salen en el launcher, y `serverIp` si algún día cambias de IP sin recompilar.

## PASO 5. Publicar cambios (siempre igual)

1. Cambia, agrega o borra archivos en `servidor-archivos/`.
2. Súbelos a GitHub. Una tarea automática actualiza `manifest.json` sola.
3. Los jugadores solo abren el launcher y le dan a **Jugar**.

Sin GitHub: ejecuta `2-ACTUALIZAR-LISTA-DE-ARCHIVOS.bat` y sube la carpeta a tu hosting; usa `node herramientas/generar-manifest.js --base https://tu-hosting.com/archivos/`.

Límites de GitHub: por la web, 25 MB por archivo; con Git, 100 MB. Si tu resource pack es más grande, usa Git, o alójalo en otro hosting con `--base`.

---

## Lo que ven los jugadores

1. Abren el launcher.
2. **No premium**: escriben su nombre. **Premium**: inician sesión con Microsoft una sola vez.
3. Pulsan **Jugar**. La primera vez baja Java 21, Fabric, Minecraft y tus archivos (unos minutos); después entra en segundos y conecta directo al servidor.

En **Ajustes** (el engranaje) eligen la memoria RAM, abren la carpeta del juego y pueden reparar la instalación.

## Notas importantes

- **No premium**: tu servidor debe tener `online-mode=false` en `server.properties`. Sin eso, solo entran cuentas premium. Con no premium no se ven skins.
- **Mods**: la carpeta `mods` está en modo estricto: el launcher borra cualquier mod que no esté en tu lista. Para desactivarlo, quita `"mods"` de `strict` en `ajustes.json`.
- **Fabric**: usa siempre mods de Fabric, no de Forge/NeoForge.
- Los datos del launcher (juego, Java, registro) quedan en `%APPDATA%\NombreDeTuCarpeta`. Si algo falla, ahí está `launcher.log`.
- El launcher compilado es para **Windows 64 bits**.
