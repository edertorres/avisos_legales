# Manual de Usuario

## Avisos Impresos PDF

Esta herramienta permite crear avisos legales y edictos para prensa con medidas exactas en centimetros, vista previa vectorial y exportacion a PDF listo para impresion.

## Flujo Rapido

1. Selecciona el tamano del aviso en centimetros.
2. Ajusta el margen de texto.
3. Pega o escribe el contenido del aviso.
4. Sube el logo o imagen si aplica.
5. Ajusta fuente, interlineado y alineacion.
6. Revisa que no exista alerta de desborde.
7. Descarga el PDF en el tamano exacto seleccionado.

## Distribucion de la pantalla

- **Panel izquierdo**: tarjetas plegables con el contenido del aviso (**Tamano y margen**, **Logo o escudo**, **Textos**) y **Ajustes finos** (tamano de tabla, grosor del borde y espaciado entre letras; valores negativos compactan el texto).
- **Vista previa**: arriba estan **Deshacer/Rehacer**, la guia de margen y el zoom. Debajo, la barra de tipografia es el unico lugar para fuente, tamano del cuerpo, interlineado y alineacion general. El pie muestra tamano, palabras y estado, y tiene **Auto-Encajar** y **Descargar PDF**.
- **Deshacer y rehacer**: `Ctrl+Z` deshace y `Ctrl+Mayus+Z` (o `Ctrl+Y`) rehace cualquier cambio del aviso, tambien **Limpiar formulario** o cargar un anuncio. Lo que se escribe seguido cuenta como un solo paso. Tambien hay botones junto al titulo de la vista previa.
- **Campos numericos**: ademas de los botones +/-, las flechas del teclado suben o bajan un paso (con `Mayus`, diez pasos). Se admite coma decimal.
- **Editar desde el lienzo**: haz clic en un titulo, en el texto o en el logo de la vista previa y el panel salta al campo correspondiente (si el panel estaba oculto, se abre).

## Barra Superior

- **Manual**, **Guardar**, **Guardados** e **Historial**.
- **Mas**: cargar ejemplo, limpiar formulario, exportar/importar anuncio en JSON, convertir un PDF externo a grises y el PDF experimental con WeasyPrint.

La descarga del PDF esta en el pie de la vista previa. Si hay desborde de texto, se deshabilita hasta corregirlo.

## Dimensiones y Margen

En el panel izquierdo puedes escoger medidas predefinidas como `6.3 x 3 cm`, `6.3 x 4 cm`, etc.

Tambien puedes crear un tamano personalizado:

1. Haz clic en **Anadir Otro Tamano en Centimetros**.
2. Escribe ancho y alto.
3. Opcionalmente agrega una etiqueta.
4. Guarda el nuevo tamano.

El control **Margen de Texto** define el espacio interno entre el borde y el contenido. Para prensa se recomienda mantenerlo entre `1 mm` y `3 mm`, segun el espacio disponible.

## Texto del Aviso

Pega el texto principal en el area **Contenido del Texto y Logo**.

Controles disponibles:

- **Sin Retornos**: elimina saltos de linea innecesarios para que el texto fluya como parrafo continuo.
- **Negrita**: aplica negrita al texto seleccionado.
- **Subrayado**: subraya el texto seleccionado. Puede combinarse con negrita y alineación en cualquier orden; se conserva en la vista previa y el PDF.
- **Resaltar Nombres**: detecta nombres, empresas, NIT, cedulas y documentos para resaltarlos automaticamente.
- **.TXT**: permite importar un archivo de texto plano.
- **Tabla**: abre el editor de tablas (ver **Tablas**). Si el cursor esta dentro de una tabla, la edita.
- **Imagen**: sube una imagen local e inserta su marcador en la posicion del cursor.

## Tablas

Hay tres formas de crear o editar una tabla:

1. **Pegar desde Excel, Google Sheets o Word** directamente en el cuerpo del texto: la tabla se detecta y se convierte sola. Se lee la version HTML que esos programas copian, por lo que:
   - las **celdas combinadas** se respetan (el texto queda en la primera celda y el resto vacias);
   - una **celda con varias lineas** (Alt+Intro en Excel, varios parrafos en Word) se une en una sola linea, que luego parte sola si no cabe;
   - si copias en Word **texto y tabla juntos**, se pegan en el mismo orden: el texto como parrafos y la tabla como tabla;
   - tambien sirve **una sola fila** de Excel;
   - las filas ocultas de Excel no se pegan.

   El formato (negritas, colores, numeros) no se copia: los valores llegan tal como se ven en la hoja. Ajusta encabezado, ancho y alineacion en el editor.
2. Pulsar **Tabla** en la barra del texto: abre el editor en la posicion del cursor (o edita la tabla donde esta el cursor).
3. Hacer **clic sobre una tabla en la vista previa**: abre el editor con esa tabla.

En el editor:

- Escribe en las celdas; **Intro** baja a la fila siguiente (y la crea si hace falta) y **Tab** pasa a la celda siguiente.
- **Pegar en una celda** un bloque copiado de una hoja de calculo lo reparte desde esa celda y amplia la tabla.
- **+ Fila**, **+ Columna**, y los botones de cada fila/columna para eliminarlas (hasta 100 filas y 12 columnas).
- **Primera fila es encabezado**: si se desmarca, ninguna fila va en negrita.
- **Ancho**: *Ajustado al contenido* (centrada) o *Todo el ancho* del aviso.
- **Alineacion por columna** (izquierda, centro, derecha), por ejemplo los importes a la derecha.
- **Eliminar tabla** quita la tabla del aviso. Todo se puede deshacer con `Ctrl+Z`.

Las lineas de la tabla miden 0,25 pt y el texto queda centrado verticalmente en cada celda. Las celdas parten linea entre palabras cuando la tabla no cabe; las palabras no se cortan. Si una tabla es mas ancha que el aviso, aparece el aviso de desborde ("Una tabla es X mm mas ancha que el aviso") y el PDF se bloquea: usa **Auto-Encajar** (tambien reduce el tamano de tabla en proporcion), baja **Tamano de tabla** en Ajustes finos o acorta las palabras. Las lineas se imprimen en negro K.

En el texto, la tabla se guarda como un bloque legible que tambien puede editarse a mano:

```
##table ancho=completo alinear=izq,centro,der
| Nombre | Cedula | Valor |
| Ana Perez | 1.234.567 | $ 50.000 |
##/table
```

Opciones de la primera linea: `encabezado=no`, `ancho=completo`, `alinear=izq,centro,der`. Para escribir una barra `|` dentro de una celda usa `\|`. Las tablas antiguas (separadas por `|`, tabuladores o comas) siguen funcionando.

## Resaltado de Nombres y Documentos

El boton **Resaltar Nombres** detecta los elementos y los pone en negrita en todo el aviso. Debajo del texto aparece la lista **Negritas automaticas**: pulsa la **x** de un elemento para quitarle la negrita, o **Quitar todas** para eliminarlas.

Ejemplos de elementos que puede detectar:

- Nombres en mayusculas.
- Razones sociales.
- `NIT 900.743.745-1`.
- `Cedula de Ciudadania No. 1.093.224.471`.
- Nombres despues de `senor`, `senora`, `Sr.` o `Sra.`.

Si necesitas resaltar algo especifico, selecciona el texto y usa **Negrita**.

## Logo o Imagen

En la seccion **Logo o escudo** puedes:

- Subir una imagen.
- Quitar la imagen activa.
- Usar un logo de ejemplo.
- Cambiar el ancho del logo.
- Escoger posicion:
  - Izquierda flotante.
  - Derecha flotante.
  - Centrado arriba.

La exportacion PDF se procesa con Ghostscript en escala de grises DeviceGray/K para que sea apta para impresion en rotativa. La descarga principal usa PDF 1.4 para conservar calidad vectorial y transparencias. La conversion requiere el perfil ICC gris `ISOnewspaper26v4_gr.icc` en el root del proyecto, o una ruta configurada en `GRAY_ICC_PROFILE`.

## Imagenes Dentro del Texto

En el area **Contenido del Texto y Logo** puedes insertar imagenes adicionales en cualquier posicion del aviso:

1. Ubica el cursor en el punto del texto donde debe aparecer la imagen.
2. Haz clic en **Imagen** y selecciona el archivo. Puedes usar imagenes raster (`PNG`, `JPG`, `WEBP`) o vectoriales (`SVG`).
3. La aplicacion inserta un marcador como `##imagen:1`.
4. Mueve ese marcador dentro del texto si necesitas cambiar la posicion.

Cada imagen insertada aparece en la lista **Imagenes del aviso**. Desde ahi puedes:

- Alinear la imagen a izquierda, centro o derecha.
- Aumentar o disminuir su ancho con los botones de flecha. El tamano queda limitado automaticamente al ancho util del aviso.
- Eliminar la imagen del aviso.

Las imagenes antiguas guardadas sin marcador seguiran apareciendo al final del contenido.

## Barra de tipografia

Sobre el lienzo hay una barra de tipografia:

- **Fuente**: cambia la familia tipografica.
- **Letra**: aumenta o reduce el tamano del cuerpo.
- **Inter**: aumenta o reduce el interlineado.
- **Alineacion**: justificado, izquierda, centro o derecha.

**Auto-Encajar** (en el pie y en el aviso de desborde) reduce primero el interlineado y despues la letra hasta que el texto cabe; si sobra espacio, amplia la letra. Mide con el mismo render del PDF, incluidas negritas, logo, tablas e imagenes. Si el texto no cabe ni con la letra minima (5,5 pt), sugiere un tamano de aviso mayor.

Fuentes disponibles:

- Roboto Condensed.
- Asap.
- Barlow Condensed.
- Barlow Semi Condensed.
- PT Sans.
- Arimo.
- Roboto.
- Lato.
- Tinos.
- Lora.
- Courier Prime.

El control **Inter** es util cuando el texto casi cabe: reducirlo ligeramente puede evitar un desborde sin bajar demasiado la letra.

## Vista Previa

La vista previa usa el mismo render HTML/CSS que genera el PDF final. Por eso debe coincidir con la salida exportada.

- **Zoom**: por defecto esta en **Ajustar**, que encaja el aviso en el espacio disponible y se recalcula al cambiar el tamano de la ventana. Los botones de lupa pasan a zoom manual; **100 %** es el tamano de lectura habitual.
- **Guia de margen**: muestra u oculta la guia visual del margen configurado.

En el pie de la vista previa se muestran:

- Tamano exacto del aviso.
- Conteo de palabras.
- Estado: **Cabe en el espacio** o cuanto sobra (por ejemplo, `Sobra ~12 % (≈3 lineas)`).

## Desborde de Texto

La aplicacion detecta cuando el contenido excede el area del aviso.

Cuando hay desborde:

- Aparece una alerta roja que indica cuanto sobra (porcentaje del alto y lineas aproximadas).
- El borde de la vista previa se resalta.
- La exportacion PDF se deshabilita.

Formas de corregirlo:

- Usar **Auto-Encajar**.
- Reducir tamano de letra.
- Reducir interlineado.
- Reducir margen.
- Escoger un aviso mas alto.
- Acortar el texto.

## Exportacion PDF

Hay dos salidas principales:

- **PDF Cm Real**: genera un archivo con las medidas exactas del aviso.

Antes de exportar, confirma:

- No hay alerta de desborde.
- El logo esta en la posicion correcta.
- El conteo de palabras y el tamano son los esperados.
- Los nombres/documentos importantes estan en negrita.

## Recomendaciones Para Rotativa

- Usa imagenes con buen contraste.
- Evita logos demasiado pequenos.
- Revisa que el texto no quede pegado al borde.
- Mantén el margen entre `1 mm` y `3 mm`.
- Prefiere negritas solo para nombres, entidades y documentos importantes.
- Verifica el PDF final antes de enviarlo a impresion.

## Solucion de Problemas

### No se genera el PDF

Revisa si hay alerta de desborde. Si la hay, ajusta texto, fuente o tamano del aviso.

### El logo no aparece

Quita el logo y vuelve a subirlo. Se recomiendan formatos `PNG`, `JPG`, `SVG`, `GIF` o `WEBP`.

### Las negritas no se ven

Usa **Resaltar Nombres** o selecciona el texto y presiona **Negrita**. La vista previa se actualiza al instante.

### La alineacion se ve como texto

Si aparecen etiquetas como `[center]`, vuelve a seleccionar el texto y aplica la alineacion desde los botones del panel. Revisa que cada etiqueta de apertura tenga su cierre, por ejemplo `[center]...[/center]`.

### El texto se parte raro alrededor del logo

Reduce un poco el ancho del logo, cambia su posicion o ajusta el interlineado. La aplicacion protege frases legales comunes para evitar cortes no naturales.


## Anuncios guardados e historial compartido

**Guardar** conserva el anuncio en el servidor para que todos puedan cargarlo desde otro PC,
siempre que abran la misma aplicación. Al guardar se incluyen el texto, el formato, el logo
y las imágenes insertadas. El historial registra los últimos 200 PDFs generados y permite
volver a cargar sus avisos; no almacena el archivo PDF descargado.

Los datos que antes estaban en cada navegador se migran automáticamente al abrir la aplicación.
Para reunir los datos de varios PCs, abre la aplicación actualizada en cada navegador de origen.
Las listas se actualizan al abrirlas, al volver a la ventana y cada 15 segundos.
Eliminar un anuncio o borrar el historial afecta a todos los usuarios.
Los tamaños personalizados continúan siendo locales.

El servidor debe tener almacenamiento persistente configurado como se indica en el README.

## Avisos funerarios

La pestaña **Avisos funerarios** abre una sección independiente que conserva el trabajo del editor de avisos legales. Escriba **Anunciante** y **Fallecido**, o importe un archivo **XLSX** o **CSV**. Cada fila genera un aviso; XLSX usa la primera hoja y CSV acepta coma o punto y coma. Puede indicar si hay encabezados y seleccionar las columnas de los dos nombres. La importación reemplaza el lote abierto al pulsar el botón correspondiente. Los nombres vacíos se pueden completar durante la revisión. Se admiten hasta 200 avisos y archivos de datos de hasta 10 MB.

El texto introductorio, las condolencias, la tipografía, el tamaño y los ajustes de posición del logo son comunes para todo el lote. La imagen del logo corresponde a cada anunciante. El borde tiene dos líneas finas de 0,25 pt por defecto; se pueden ajustar el grosor de cada línea, su separación, el color y la distancia al texto. Los tamaños personalizados se comparten con el editor actual. Los logos admiten PNG, JPEG y WebP de hasta 5 MB.

Escriba un nombre y pulse **Guardar plantilla** para guardar el diseño en la biblioteca compartida. Las plantillas conservan el texto fijo y los ajustes del logo, sin las imágenes ni los nombres variables. Las imágenes de plantillas antiguas no se aplican automáticamente a los anunciantes. Seleccione una plantilla para aplicarla al lote. Las plantillas también aparecen en **Guardados**, donde pueden eliminarse o exportarse como JSON.

Seleccione cada aviso en la tabla, corrija sus nombres y compruebe la vista previa. Pulse **Marcar revisado y continuar**. Cambiar los nombres anula la revisión del aviso; cambiar el diseño anula la revisión de todo el lote. La exportación se habilita cuando todos los avisos tienen el nombre del fallecido, sus logos están resueltos y están revisados. El servidor vuelve a comprobar que el texto cabe y señala el número del aviso si detecta desbordamiento.

**PDF multipágina** descarga un PDF con un aviso por página a su tamaño real. **PDF individuales (ZIP)** descarga un archivo ZIP con un PDF por aviso, con el nombre del anunciante (por ejemplo, `Empresa ABC.pdf`). Si no hay nombre de anunciante, se utiliza `aviso_funerario_001.pdf`, con el consecutivo de su fila en el lote. Los nombres repetidos llevan un sufijo como `_002` para conservar todos los archivos. Ambas opciones usan el renderizado vectorial del editor y la conversión de imprenta DeviceGray/K; los colores del borde y del logo se convierten a escala de grises. La generación de lotes grandes puede tardar varios minutos. El lote y sus imágenes permanecen al cambiar de pestaña, pero no se guardan al recargar la aplicación; conserve el archivo fuente y los logos para volver a cargarlos.

### Tamaño y posición del logo funerario

En **Diseño de los logos** encontrará controles de ancho proporcional, posición (izquierda, derecha, arriba centrado o abajo centrado), referencia de alineación (nombre de quien paga o todo el bloque), separación del texto y desplazamientos horizontal y vertical en milímetros. El logo ocupa una fila propia, sin texto a los lados. Con la referencia «Nombre de quien paga», la fila se coloca antes o después de ese nombre; con «Todo el bloque», antes o después del conjunto de textos. Los desplazamientos reservan espacio para evitar que el logo invada el texto. Estos ajustes se guardan en la plantilla y se aplican al lote completo; modificarlos requiere revisar nuevamente los avisos.


### Logos por anunciante en un lote

Incluya una columna opcional **logo** en el XLSX/CSV con el nombre completo del archivo, incluida su extensión; por ejemplo, `empresa-abc.png`. La columna se detecta por su encabezado y también puede seleccionarse manualmente al importar. Una celda vacía significa **sin logo**. El nombre debe coincidir exactamente, incluidas mayúsculas y minúsculas; se ignoran los espacios al principio y al final de la referencia.

En **Logos del lote**, seleccione varias imágenes PNG, JPEG o WebP juntas. Puede cargarlas antes o después de importar la hoja. Se admiten hasta 5 MB por imagen y 15 MB de imágenes cargadas en total. La tabla muestra el archivo y su estado para cada aviso. Los archivos faltantes y las coincidencias duplicadas bloquean la revisión del aviso y la exportación. Para resolver un duplicado, elimine la imagen sobrante en la lista, conservando la correcta.

Durante la revisión puede cambiar la referencia del archivo, elegir un nombre cargado mediante las sugerencias, cargar y asignar una imagen a ese aviso o pulsar **Sin logo para este aviso**. Cambiar una imagen o eliminarla anula la revisión de los avisos que la utilizan. El mismo archivo puede ser referenciado por varias filas. Las plantillas guardan tamaño, posición y separación, pero cada fila decide qué imagen se publica.

El nombre del anunciante es opcional: puede dejarse vacío cuando el logo lo identifica. Su ausencia no bloquea la revisión ni la exportación. El nombre del fallecido sigue siendo obligatorio.

### Paneles de diseño y revisión

La interfaz funeraria usa el mismo estilo de controles que los avisos legales. El panel lateral tiene dos pestañas: **Diseño y plantilla** agrupa plantillas, texto común, dimensiones, tipografía, borde y posición del logo; **Importación y logos** contiene la carga de hojas e imágenes. Las tarjetas pueden plegarse, y los valores numéricos se ajustan con los botones +/− o escribiendo el valor (se admite coma decimal). Para el borde hay accesos a 0,25, 0,5 y 1 pt; los desplazamientos del logo se pueden restablecer a cero.

En escritorio, cada panel tiene desplazamiento independiente y la barra de exportación permanece visible. En móvil, la revisión aparece antes del panel de diseño. La vista previa se ajusta automáticamente al ancho disponible y ofrece zoom manual, escala 100 %, el botón **Ajustar**, medidas y guías de margen. Use **Aviso anterior/siguiente** o los números de la tabla para navegar. **Marcar revisado y continuar** abre el siguiente aviso pendiente de revisión. La tabla permite buscar por anunciante, fallecido o archivo del logo y filtrar todos, sin revisar o con pendientes. La barra inferior muestra el progreso y explica qué falta para exportar.


### Cruz opcional por aviso

Active **Incluir cruz en este aviso** durante la revisión para añadir una cruz latina negra de dos trazos. Los avisos nuevos e importados empiezan con la cruz desactivada. Con logo, la cruz queda a su izquierda y a la misma altura, con espacio reservado; sin logo, aparece arriba a la izquierda, dentro del borde. En la tarjeta **Cruz opcional** ajuste altura, grosor y separación adicional al margen interior. Los ajustes se guardan en la plantilla; la activación pertenece a cada aviso. Cambiar la activación requiere revisar ese aviso de nuevo.
