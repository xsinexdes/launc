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
  Los mods de rendimiento, Fabric API y Sodium **ya los instala el launcher** desde la lista `modrinth` de `ajustes.json`. Los `.bat` `1-DESCARGAR-MODS-RENDIMIENTO` y `1b-DESCARGAR-MODS-ESTILO-OPTIFINE` solo sirven si prefieres bajar los `.jar` y subirlos tú. Para otros mods: `node herramientas/descargar-basicos.js lithium modmenu`. Si lo ejecutas otra vez, reemplaza las versiones viejas por las nuevas.
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

## Cielos personalizados (mod CustomSkyboxes)

Ya viene todo metido:
- El mod `customskyboxes-mc1_21_1-1_0_3_1.jar` está en `servidor-archivos/mods/` y el launcher se lo instala a todos.
- El resource pack **Nova-Cielos.zip** (en `servidor-archivos/resourcepacks/`) trae el cielo rojo apocalíptico y el eclipse, y se activa solo la primera vez que el jugador abre el launcher.
- El **plugin** `servidor/plugins/CustomSkyboxesPlugin-1_0_2.jar` **no va en el launcher**: cópialo a la carpeta `plugins` de tu servidor. Es el que permite cambiar el cielo con comandos. Los comandos están en `servidor/LEEME-PLUGIN.txt`. Ejemplos (como OP):

```
/customskyboxesplugin set @a sky cielo-rojo-apocaliptico
/customskyboxesplugin set @a sky eclipse-total-estatico
/customskyboxesplugin clear @a all
```

Para agregar más cielos, mete tus imágenes dentro de `Nova-Cielos.zip`, en `assets/customskyboxes/sky/` (o `day_sky`, `night_sky`, `sun`, `moon`, `clouds`...), sube el zip y ejecuta `/customskyboxesplugin reload @a`.

> El mod dice "todos los derechos reservados". Si tu repositorio es público, cualquiera puede bajarlo. Si el mod no es tuyo, lo correcto es pedir permiso a su autor.

## Mods base: los instala el launcher solo

En `servidor-archivos/ajustes.json` hay una lista `"modrinth"` con Fabric API, Sodium, Iris y los mods de rendimiento. **Cada jugador los descarga de Modrinth al darle a Jugar** (siempre la versión más nueva para 1.21.1, con sus dependencias), así que no tienes que subirlos tú. Para agregar otro, escribe su nombre de Modrinth en esa lista (el nombre de la dirección: modrinth.com/mod/**zoomify**). No pongas el mismo mod también en la carpeta `mods`.

Los mods que tú pongas en `servidor-archivos/mods/` (como el de cielos) se instalan además de esos.

## Servidor de pruebas

Dentro del launcher, en **Ajustes → Servidor de pruebas**, escribe la IP de tu servidor de pruebas (por ejemplo `127.0.0.1:25565`). Queda añadido en Multijugador dentro de Minecraft y aparece un botón **Servidor de pruebas** para entrar directo. Minecraft además siempre trae su propio botón "Añadir servidor" en Multijugador.

## Lo que no entra: el mapa "Smaash Gulag"

El zip de Gulag es un mapa hecho para **Minecraft 1.21.8 con NeoForge**. Su datapack usa el formato de la 1.21.8 y su resource pack usa modelos de objetos que **no existen en la 1.21.1**, así que no puede funcionar en este launcher ni en un servidor 1.21.1. Para usarlo necesitas un servidor 1.21.8, o que su autor lo adapte a 1.21.1.

## Probar sin tener el servidor listo

Mientras tu servidor no exista o `serverIp` siga siendo `play.tuservidor.com`, el botón **Jugar** abre el **menú de Minecraft** en vez de intentar conectar. Así puedes revisar que los mods, el resource pack y los shaders funcionan.

Debajo del botón Jugar hay una fila **Probar sin servidor**:
- **Menú**: abre Minecraft sin conectarse a ningún servidor.
- **Un botón por cada mundo de prueba** (por ejemplo "Prueba"): abre Minecraft y entra directo a ese mundo.

Cuando pones tu IP real, el servidor ya aparece **añadido en Multijugador** dentro de Minecraft, sin que el jugador escriba nada, y **Jugar** entra directo.

### Mundos de prueba

1. En Minecraft crea un mundo **Plano en Creativo** llamado `Prueba`.
2. Copia su carpeta desde `%APPDATA%\NovaLauncher\minecraft\saves\Prueba` a `servidor-archivos/mundos/Prueba` (debe tener `level.dat` dentro).
3. Súbelo a GitHub. A todos los jugadores les aparece como botón y en su lista de mundos.

Los mundos se instalan **una sola vez**: si el jugador ya lo tiene, el launcher no toca su progreso ni lo borra.

## Rendimiento: lo que el launcher hace solo

- **Detecta el PC** del jugador (RAM y núcleos) y elige el perfil **Modesto**, **Equilibrado** o **Alto**. El jugador puede cambiarlo en Ajustes.
- **Memoria automática**: asigna la RAM justa para mods y shaders según el PC (2 GB en PCs de 4 GB, hasta 8 GB en PCs grandes).
- **Parámetros de Java afinados** por perfil (recolector de basura G1 ajustado, o ZGC generacional en PCs potentes), y una caché de clases para que Minecraft abra más rápido desde la segunda vez.
- **Ajustes del juego** (distancia de render, partículas, nubes, FPS) según el perfil, aplicados la primera vez; después el jugador los puede cambiar.
- **Descargas rápidas**: 16 conexiones a la vez para Minecraft y 6 para tus archivos. Revisar los mods en cada inicio tarda milisegundos porque no recalcula lo que no cambió.
- **El propio launcher es ligero**: carga cada parte solo cuando hace falta, usa poca memoria y **pausa sus animaciones mientras juegas**.

## ¿Y OptiFine?

OptiFine **no se puede incluir** por dos razones:
1. Su licencia prohíbe redistribuirlo (solo se puede bajar de optifine.net), así que no puedo meterlo en el launcher ni en tu GitHub.
2. No funciona con los mods de Fabric, que es lo que usa este launcher.

En su lugar, el paquete `optifine` instala los mods que hacen lo mismo y rinden más: **Sodium** (FPS), **Iris** (shaders; abre los shaders de OptiFine), **Zoomify** (zoom), **Continuity** (texturas conectadas), **Entity Texture Features / Entity Model Features** (modelos y texturas de entidades), **LambDynamicLights** (luz dinámica), **CIT Resewn / OptiGUI** (items y menús personalizados) y los de rendimiento (Lithium, FerriteCore, ImmediatelyFast, ModernFix, Entity Culling, More Culling y Dynamic FPS).

## Lo que ven los jugadores

1. Abren el launcher.
2. **No premium**: escriben su nombre. **Premium**: inician sesión con Microsoft una sola vez.
3. Pulsan **Jugar**. La primera vez baja Java 21, Fabric, Minecraft y tus archivos (unos minutos); después entra en segundos y conecta directo al servidor.

En **Ajustes** (el engranaje) eligen el perfil de rendimiento y la memoria RAM, abren la carpeta del juego y pueden reparar la instalación.

## Notas importantes

- **No premium**: tu servidor debe tener `online-mode=false` en `server.properties`. Sin eso, solo entran cuentas premium. Con no premium no se ven skins.
- **Mods**: la carpeta `mods` está en modo estricto: el launcher borra cualquier mod que no esté en tu lista. Para desactivarlo, quita `"mods"` de `strict` en `ajustes.json`.
- **Fabric**: usa siempre mods de Fabric, no de Forge/NeoForge.
- Los datos del launcher (juego, Java, registro) quedan en `%APPDATA%\NombreDeTuCarpeta`. Si algo falla, ahí está `launcher.log`.
- El launcher compilado es para **Windows 64 bits**.
