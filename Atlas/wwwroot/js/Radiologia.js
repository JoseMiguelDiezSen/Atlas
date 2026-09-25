jQuery(function () {

    const MIN_SCALE = 0.1;
    const MAX_SCALE = 10;

    // Estado del visor y de las herramientas
    let currentImage = null;
    let baseVOI = null;
    let locked = false;
    let toolMode = "none";
    let pixelSpacing = [1, 1];

    // Herramienta Puntos
    let points = [];

    // Herramienta Línea (Medición)
    let linePoints = [];
    let linePreviewPoint = null;
    let linesHistory = [];

    // Herramienta Rectángulo (ROI)
    let isDrawingRect = false;
    let rectStart = null;
    let rectEnd = null;
    let rectPreview = null;
    let rectsHistory = [];

    // Herramienta Ángulo (3 puntos)
    let anglePoints = [];
    let anglePreviewPoint = null;
    let anglesHistory = [];

    // Herramienta Lupa (Magnifier)
    let isMagnifierActive = false;
    let magnifierSize = 150;
    let magnifierZoom = 2.5;

    // Limitador de escala de zoom
    const clampScale = (value) => {
        return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    };

    // ==========================================================
    // INICIALIZACIÓN DE CORNERSTONE Y DEPENDENCIAS
    // ==========================================================
    try {
        cornerstoneTools.external.cornerstone = cornerstone;
        cornerstoneTools.external.Hammer = Hammer;
        cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
        cornerstoneTools.init();

        cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
        cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
        cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);

        cornerstoneWADOImageLoader.webWorkerManager.initialize({
            maxWebWorkers: 1,
            startWebWorkersOnDemand: true,
            decodeConfig: {
                useWebWorkers: true
            },
            taskConfiguration: {
                decodeTask: {
                    initializeCodecsOnStartup: false
                }
            }
        });
    } catch (err) {
        console.warn("Inicialización de WebWorkers diferida o fallback:", err);
    }

    const element = document.getElementById("dicomViewer");
    cornerstone.enable(element);

    // Herramientas nativas de navegación
    cornerstoneTools.addTool(cornerstoneTools.PanTool);
    cornerstoneTools.addTool(cornerstoneTools.ZoomMouseWheelTool);

    // ==========================================================
    // ACTUALIZACIÓN DE HUD Y ESTADOS
    // ==========================================================
    const updateHUD = (vp) => {
        if (!currentImage) return;
        const viewport = vp || cornerstone.getViewport(element);
        if (!viewport) return;

        // Zoom y modo dinámico
        const zoomPercent = Math.round((viewport.scale || 1) * 100);
        let modoTexto = "PAN";
        if (toolMode === "point") modoTexto = "PUNTO";
        else if (toolMode === "line") modoTexto = "LÍNEA (MEDICIÓN)";
        else if (toolMode === "rectangle") modoTexto = isDrawingRect ? "TRAZANDO ROI..." : "RECTÁNGULO (ROI)";
        else if (toolMode === "angle") modoTexto = anglePoints.length > 0 ? `ÁNGULO (${anglePoints.length}/3)` : "ÁNGULO";
        else if (toolMode === "magnifier") modoTexto = "LUPA";

        let rotFlipInfo = "";
        if (viewport.rotation) rotFlipInfo += ` | ${viewport.rotation}°`;
        if (viewport.hflip) rotFlipInfo += " | Flip H";
        if (viewport.vflip) rotFlipInfo += " | Flip V";
        if (viewport.invert) rotFlipInfo += " | Invertido";

        $("#hudZoom").html(`<i class="fa-solid fa-crosshairs text-success me-1"></i> MODO: ${modoTexto}${rotFlipInfo}`);
        $("#telZoom").text(`${zoomPercent}%`);
        $("#tamanio, #fs_tamanio").val(Math.round((viewport.scale || 1) * 50));

        // Ventana (VOI)
        if (viewport.voi) {
            const wc = Math.round(viewport.voi.windowCenter);
            const ww = Math.round(viewport.voi.windowWidth);
            $("#hudVOI").html(`<i class="fa-solid fa-circle-half-stroke text-warning me-1"></i> WC: ${wc} | WW: ${ww}`);
        }

        // Telemetría de orientación
        let orientText = `Rot: ${viewport.rotation || 0}°`;
        if (viewport.hflip) orientText += " (Flip H)";
        if (viewport.vflip) orientText += " (Flip V)";
        if (viewport.invert) orientText += " (Negativo)";
        $("#telOrientation").text(orientText);
    };

    const applyToolState = () => {
        if (locked) {
            cornerstoneTools.setToolDisabled("Pan");
            cornerstoneTools.setToolDisabled("ZoomMouseWheel");
            $("#zoomIn, #zoomOut, #zoomFit, #tamanio, #fs_tamanio, #brightness, #fs_brightness, #contrast, #fs_contrast, #toolMode, #fs_toolMode, #wlPresets, #reset, #fs_reset, #limpiarDibujos, #fs_limpiarDibujos, #btnRotateLeft, #btnRotateRight, #btnFlipH, #btnFlipV, #btnInvert").prop("disabled", true);
            $("#dicomViewer").removeClass("drawing-mode");
        } else {
            $("#zoomIn, #zoomOut, #zoomFit, #tamanio, #fs_tamanio, #brightness, #fs_brightness, #contrast, #fs_contrast, #toolMode, #fs_toolMode, #wlPresets, #reset, #fs_reset, #limpiarDibujos, #fs_limpiarDibujos, #btnRotateLeft, #btnRotateRight, #btnFlipH, #btnFlipV, #btnInvert").prop("disabled", false);
            cornerstoneTools.setToolActive("ZoomMouseWheel", { mouseButtonMask: 0 });

            if (toolMode === "none") {
                cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 1 });
                $("#dicomViewer").removeClass("drawing-mode");
            } else {
                cornerstoneTools.setToolDisabled("Pan");
                $("#dicomViewer").addClass("drawing-mode");
            }
        }
        updateHUD();
    };

    applyToolState();

    // ==========================================================
    // AJUSTES VOI (BRILLO Y CONTRASTE) - SINCRONIZADOS
    // ==========================================================
    const updateVOI = (source) => {
        const viewport = cornerstone.getViewport(element);
        if (!viewport || !viewport.voi || !baseVOI) return;

        let brightness, contrast;

        if (source === "fullscreen") {
            brightness = parseInt($("#fs_brightness").val() || 0);
            contrast = parseInt($("#fs_contrast").val() || 0);
            $("#brightness").val(brightness);
            $("#contrast").val(contrast);
        } else {
            brightness = parseInt($("#brightness").val() || 0);
            contrast = parseInt($("#contrast").val() || 0);
            $("#fs_brightness").val(brightness);
            $("#fs_contrast").val(contrast);
        }

        viewport.voi.windowCenter = baseVOI.windowCenter - brightness;
        viewport.voi.windowWidth = Math.max(1, baseVOI.windowWidth + (contrast - 2000));

        cornerstone.setViewport(element, viewport);
        updateHUD();
    };

    $("#brightness, #contrast").on("input", () => updateVOI("base"));
    $("#fs_brightness, #fs_contrast").on("input", () => updateVOI("fullscreen"));

    // ==========================================================
    // CONTROLES DE ZOOM, FIT Y ORIENTACIÓN
    // ==========================================================
    $("#zoomIn").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.scale = clampScale(viewport.scale + 0.15);
        cornerstone.setViewport(element, viewport);
        const scaleVal = Math.round(viewport.scale * 50);
        $("#tamanio, #fs_tamanio").val(scaleVal);
        updateHUD();
    });

    $("#zoomOut").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.scale = clampScale(viewport.scale - 0.15);
        cornerstone.setViewport(element, viewport);
        const scaleVal = Math.round(viewport.scale * 50);
        $("#tamanio, #fs_tamanio").val(scaleVal);
        updateHUD();
    });

    $("#zoomFit").click(function () {
        if (!currentImage) return;
        cornerstone.fitToWindow(element);
        const viewport = cornerstone.getViewport(element);
        if (viewport) {
            const scaleVal = Math.round(viewport.scale * 50);
            $("#tamanio, #fs_tamanio").val(scaleVal);
        }
        updateHUD();
    });

    $("#tamanio").on("input", function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        const val = $(this).val();
        $("#fs_tamanio").val(val);
        viewport.scale = clampScale(val / 50);
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    $("#fs_tamanio").on("input", function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        const val = $(this).val();
        $("#tamanio").val(val);
        viewport.scale = clampScale(val / 50);
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    // Rotación
    $("#btnRotateLeft").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.rotation = (viewport.rotation - 90 + 360) % 360;
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    $("#btnRotateRight").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.rotation = (viewport.rotation + 90) % 360;
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    // Flip horizontal y vertical
    $("#btnFlipH").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.hflip = !viewport.hflip;
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    $("#btnFlipV").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.vflip = !viewport.vflip;
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    // Invertir (Negativo / Positivo)
    $("#btnInvert").click(function () {
        const viewport = cornerstone.getViewport(element);
        if (!viewport) return;
        viewport.invert = !viewport.invert;
        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    // Presets de Ventana WL / WW
    $("#wlPresets").change(function () {
        const preset = $(this).val();
        const viewport = cornerstone.getViewport(element);
        if (!viewport || !viewport.voi || !baseVOI) return;

        switch (preset) {
            case "bone":
                viewport.voi.windowCenter = 300;
                viewport.voi.windowWidth = 2000;
                break;
            case "softTissue":
                viewport.voi.windowCenter = 50;
                viewport.voi.windowWidth = 400;
                break;
            case "lung":
                viewport.voi.windowCenter = -600;
                viewport.voi.windowWidth = 1500;
                break;
            case "brain":
                viewport.voi.windowCenter = 40;
                viewport.voi.windowWidth = 80;
                break;
            case "default":
            default:
                viewport.voi.windowCenter = baseVOI.windowCenter;
                viewport.voi.windowWidth = baseVOI.windowWidth;
                break;
        }

        cornerstone.setViewport(element, viewport);
        updateHUD();
    });

    // ==========================================================
    // LIMPIAR ANOTACIONES Y RESET
    // ==========================================================
    const renderMeasurementsList = () => {
        const $list = $("#measurementsList");
        $list.empty();

        let allItems = [];

        // Puntos
        points.forEach((p, idx) => {
            allItems.push({
                id: `point_${idx}`,
                category: 'point',
                index: idx,
                title: `Punto #${idx + 1}`,
                badge: 'Marcador',
                badgeClass: 'bg-danger bg-opacity-25 text-danger border border-danger',
                details: `X: ${Math.round(p.x)} px, Y: ${Math.round(p.y)} px`
            });
        });

        // Líneas fijas
        linesHistory.forEach((l, idx) => {
            allItems.push({
                id: `line_${idx}`,
                category: 'line',
                index: idx,
                title: `Línea #${idx + 1}`,
                badge: 'Distancia',
                badgeClass: 'bg-success bg-opacity-25 text-success border border-success',
                details: `${l.distMM.toFixed(2)} mm`
            });
        });

        // Rectángulos fijos
        rectsHistory.forEach((r, idx) => {
            allItems.push({
                id: `rect_${idx}`,
                category: 'rect',
                index: idx,
                title: `ROI #${idx + 1}`,
                badge: 'Área',
                badgeClass: 'bg-warning bg-opacity-25 text-warning border border-warning',
                details: `${r.wMM.toFixed(1)} x ${r.hMM.toFixed(1)} mm (${r.areaMM2.toFixed(1)} mm²)`
            });
        });

        // Ángulos fijos
        anglesHistory.forEach((a, idx) => {
            allItems.push({
                id: `angle_${idx}`,
                category: 'angle',
                index: idx,
                title: `Ángulo #${idx + 1}`,
                badge: 'Grados',
                badgeClass: 'bg-info bg-opacity-25 text-info border border-info',
                details: `${a.deg.toFixed(1)}°`
            });
        });

        $("#measurementsCount").text(allItems.length);

        if (allItems.length === 0) {
            $list.html(`
                <div class="text-muted text-center py-4" style="font-size:0.78rem;">
                    <i class="fa-solid fa-pen-ruler fa-2x mb-2 text-secondary"></i><br />
                    No hay mediciones en este estudio.<br />
                    Usa la herramienta Línea, Rectángulo, Ángulo o Punto.
                </div>
            `);
            return;
        }

        allItems.forEach(item => {
            const $el = $(`
                <div class="measurement-item" data-id="${item.id}">
                    <div class="measurement-meta">
                        <div class="d-flex align-items-center gap-2">
                            <span class="measurement-type">${item.title}</span>
                            <span class="badge ${item.badgeClass}" style="font-size:0.6rem;">${item.badge}</span>
                        </div>
                        <span class="measurement-val">${item.details}</span>
                    </div>
                    <button class="measurement-delete-btn" data-cat="${item.category}" data-idx="${item.index}" title="Eliminar medición">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `);
            $list.append($el);
        });

        // Evento eliminar individual
        $(".measurement-delete-btn").on("click", function () {
            const cat = $(this).data("cat");
            const idx = $(this).data("idx");

            if (cat === 'point') points.splice(idx, 1);
            else if (cat === 'line') linesHistory.splice(idx, 1);
            else if (cat === 'rect') rectsHistory.splice(idx, 1);
            else if (cat === 'angle') anglesHistory.splice(idx, 1);

            cornerstone.updateImage(element);
            renderMeasurementsList();
        });
    };

    const limpiarDibujos = () => {
        points = [];
        linePoints = [];
        linePreviewPoint = null;
        linesHistory = [];

        rectStart = null;
        rectEnd = null;
        rectPreview = null;
        isDrawingRect = false;
        rectsHistory = [];

        anglePoints = [];
        anglePreviewPoint = null;
        anglesHistory = [];

        cornerstone.updateImage(element);
        renderMeasurementsList();
        updateHUD();
    };

    $("#limpiarDibujos, #fs_limpiarDibujos").click(limpiarDibujos);

    $("#reset, #fs_reset").click(function () {
        if (!currentImage || !baseVOI) return;

        const viewport = cornerstone.getViewport(element);
        if (viewport) {
            viewport.voi.windowCenter = baseVOI.windowCenter;
            viewport.voi.windowWidth = baseVOI.windowWidth;
            viewport.scale = baseVOI.scale || 1;
            viewport.translation.x = 0;
            viewport.translation.y = 0;
            viewport.rotation = 0;
            viewport.hflip = false;
            viewport.vflip = false;
            viewport.invert = false;
            cornerstone.setViewport(element, viewport);
        }

        $("#brightness, #fs_brightness").val(0);
        $("#contrast, #fs_contrast").val(2000);
        $("#tamanio, #fs_tamanio").val(50);
        $("#wlPresets").val("default");
        $("#toolMode, #fs_toolMode").val("none");
        toolMode = "none";
        applyToolState();

        limpiarDibujos();
    });

    $("#toggleBtn").change(function () {
        locked = this.checked;
        $("#toggleState").text(locked ? "🔒" : "🔓");
        applyToolState();
    });

    const setModoHerramienta = (nuevoModo) => {
        toolMode = nuevoModo;
        $("#toolMode").val(toolMode);
        $("#fs_toolMode").val(toolMode);

        // Cancelar dibujos en curso si cambia de herramienta
        isDrawingRect = false;
        rectPreview = null;
        linePreviewPoint = null;
        anglePreviewPoint = null;
        $("#magnifierCanvas").hide();

        applyToolState();
        cornerstone.updateImage(element);
    };

    $("#toolMode").change(function () {
        setModoHerramienta($(this).val());
    });

    $("#fs_toolMode").change(function () {
        setModoHerramienta($(this).val());
    });

    // Cancelar dibujo en curso con Escape
    $(document).on("keydown", function (e) {
        if (e.key === "Escape") {
            if (isDrawingRect) {
                isDrawingRect = false;
                rectStart = null;
                rectPreview = null;
            }
            linePoints = [];
            linePreviewPoint = null;
            anglePoints = [];
            anglePreviewPoint = null;
            $("#magnifierCanvas").hide();
            cornerstone.updateImage(element);
            updateHUD();
        }
    });

    // ==========================================================
    // EXPORTAR CAPTURA PNG EN ALTA RESOLUCIÓN
    // ==========================================================
    $("#btnExportCapture").click(function () {
        if (!currentImage) return;

        // Cornerstone renderiza directamente en un elemento canvas hijo
        const canvas = element.querySelector("canvas");
        if (!canvas) return;

        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.download = `Atlas_Radiografia_${timestamp}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    });

    // Exportar mediciones en JSON
    $("#btnExportMedJson").click(function () {
        const report = {
            paciente: $("#cardPatientName").text(),
            fechaEstudio: $("#cardStudyDate").text(),
            puntos: points,
            lineas: linesHistory,
            rectangulos: rectsHistory,
            angulos: anglesHistory,
            exportadoEn: new Date().toISOString()
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `Mediciones_${new Date().toISOString().slice(0, 10)}.json`);
        dlAnchor.click();
    });

    // ==========================================================
    // INSPECTOR DE TAGS DICOM (HEADER DUMP DINÁMICO)
    // ==========================================================
    const poblarTagsDICOM = (image) => {
        const $tbody = $("#tagsTableBody");
        $tbody.empty();

        if (!image || !image.data) {
            $tbody.html(`
                <tr>
                    <td colspan="3" class="text-center text-muted py-3">
                        Sin datos de cabecera DICOM analizables.
                    </td>
                </tr>
            `);
            return;
        }

        const tagsDic = [
            { tag: "x00100010", code: "(0010,0010)", name: "Patient's Name" },
            { tag: "x00100020", code: "(0010,0020)", name: "Patient ID" },
            { tag: "x00100030", code: "(0010,0030)", name: "Patient's Birth Date" },
            { tag: "x00100040", code: "(0010,0040)", name: "Patient's Sex" },
            { tag: "x00080020", code: "(0008,0020)", name: "Study Date" },
            { tag: "x00080030", code: "(0008,0030)", name: "Study Time" },
            { tag: "x00080060", code: "(0008,0060)", name: "Modality" },
            { tag: "x00080070", code: "(0008,0070)", name: "Manufacturer" },
            { tag: "x00081030", code: "(0008,1030)", name: "Study Description" },
            { tag: "x0008103e", code: "(0008,103E)", name: "Series Description" },
            { tag: "x00180015", code: "(0018,0015)", name: "Body Part Examined" },
            { tag: "x00280010", code: "(0028,0010)", name: "Rows" },
            { tag: "x00280011", code: "(0028,0011)", name: "Columns" },
            { tag: "x00280030", code: "(0028,0030)", name: "Pixel Spacing" },
            { tag: "x00280100", code: "(0028,0100)", name: "Bits Allocated" },
            { tag: "x00280101", code: "(0028,0101)", name: "Bits Stored" },
            { tag: "x00280102", code: "(0028,0102)", name: "High Bit" },
            { tag: "x00280103", code: "(0028,0103)", name: "Pixel Representation" },
            { tag: "x00281050", code: "(0028,1050)", name: "Window Center" },
            { tag: "x00281051", code: "(0028,1051)", name: "Window Width" },
            { tag: "x00281052", code: "(0028,1052)", name: "Rescale Intercept" },
            { tag: "x00281053", code: "(0028,1053)", name: "Rescale Slope" },
            { tag: "x00280004", code: "(0028,0004)", name: "Photometric Interpretation" },
            { tag: "x00020010", code: "(0002,0010)", name: "Transfer Syntax UID" }
        ];

        let patientNameVal = "Archivo Demo";
        let patientIdVal = "PAC-2026-001";
        let studyDateVal = "05/09/2026";

        tagsDic.forEach(item => {
            let val = image.data.string(item.tag);
            if (val === undefined || val === null || val === "") {
                val = image[item.name.toLowerCase()] || "--";
            }

            if (item.tag === "x00100010" && val !== "--") patientNameVal = val;
            if (item.tag === "x00100020" && val !== "--") patientIdVal = val;
            if (item.tag === "x00080020" && val !== "--") studyDateVal = val;

            const $row = $(`
                <tr class="dicom-tag-row">
                    <td class="text-info">${item.code}</td>
                    <td class="text-slate-300">${item.name}</td>
                    <td class="text-light fw-bold">${val}</td>
                </tr>
            `);
            $tbody.append($row);
        });

        // Actualizar ficha demográfica
        if (!$("#selectorPaciente").val()) {
            $("#cardPatientName").text(patientNameVal);
        }
        $("#cardPatientId").text(patientIdVal);
        $("#cardStudyDate").text(studyDateVal);
        if (studyDateVal && studyDateVal !== "--") {
            $("#cardPatientDate").text(studyDateVal);
        }
        $("#hudPatient").html(`<i class="fa-solid fa-hospital-user text-info me-1"></i> PACIENTE: ${patientNameVal}`);
    };

    // ==========================================================
    // CARGA DE RADIOGRAFÍAS (DICOM)
    // ==========================================================
    const mostrarCargador = (mostrar, texto) => {
        const $spinner = $("#textoVisor");
        if (mostrar) {
            $("#textoVisorMsg").text(texto || "Cargando estudio DICOM...");
            $spinner.addClass("show");
        } else {
            $spinner.removeClass("show");
        }
    };

    const showAlertBanner = (msg) => {
        $("#dicomAlertText").text(msg);
        $("#dicomAlertBanner").fadeIn();
    };

    $("#btnCloseAlert").click(function () {
        $("#dicomAlertBanner").fadeOut();
    });

    const cargarRadiografia = (rutaDicom, studyTitle, isLocalFile = false) => {
        if (!rutaDicom) return;

        $("#dicomAlertBanner").hide();
        mostrarCargador(true, "Cargando estudio DICOM...");

        let imageId = rutaDicom;
        if (!isLocalFile && !rutaDicom.startsWith("wadouri:")) {
            const origin = window.location.origin;
            imageId = "wadouri:" + origin + (rutaDicom.startsWith("/") ? "" : "/") + rutaDicom;
        }

        cornerstone.loadImage(imageId).then(function (image) {
            currentImage = image;
            cornerstone.displayImage(element, image);

            // Leer espaciado de píxel
            const spacingTag = image.data ? image.data.string('x00280030') : null;
            pixelSpacing = spacingTag ? spacingTag.split("\\").map(Number) : [1, 1];
            if (isNaN(pixelSpacing[0]) || isNaN(pixelSpacing[1])) {
                pixelSpacing = [1, 1];
            }

            const viewport = cornerstone.getViewport(element);
            baseVOI = {
                windowCenter: viewport.voi.windowCenter,
                windowWidth: viewport.voi.windowWidth,
                scale: viewport.scale || 1
            };

            // Sincronizar controles
            $("#brightness, #fs_brightness").val(0);
            $("#contrast, #fs_contrast").val(2000);
            const initialScale = Math.round(viewport.scale * 50);
            $("#tamanio, #fs_tamanio").val(initialScale);
            $("#wlPresets").val("default");

            // Telemetría
            $("#telMatrix").text(`${image.columns} x ${image.rows} px`);
            $("#telSpacing").text(`${pixelSpacing[0].toFixed(2)} x ${pixelSpacing[1].toFixed(2)} mm`);

            // Sincronizar HUD
            $("#hudStudy").html(`<i class="fa-solid fa-file-medical text-primary me-1"></i> ESTUDIO: ${studyTitle || rutaDicom.split("/").pop()}`);
            updateHUD();

            // Sincronizar miniaturas y selectores
            $(".thumbnail-item").removeClass("active");
            $(`.thumbnail-item[data-dcm='${rutaDicom}']`).addClass("active");
            $("#listadoRadiografias").val(rutaDicom);

            // Extraer e inspeccionar cabecera DICOM en vivo
            poblarTagsDICOM(image);

            mostrarCargador(false);
        }).catch(function (error) {
            console.error("Error al cargar la imagen DICOM:", error);
            mostrarCargador(false);

            // Mensaje claro y no bloqueante
            showAlertBanner(`Aviso: Este archivo utiliza una compresión o sintaxis no disponible en este entorno (${error.message || 'Codec'}). Te recomendamos usar el estudio R-00 verificado o cargar un archivo local.`);
        });
    };

    // Carga de archivo local desde disco duro (.dcm)
    $("#localDicomInput").on("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
            cargarRadiografia(imageId, `Local: ${file.name}`, true);
        } catch (err) {
            console.error("Error cargando DICOM local:", err);
            showAlertBanner("Error al procesar el archivo DICOM local seleccionado.");
        }
    });

    // Evento de selección de Paciente desde el dropdown
    $("#selectorPaciente").on("change", function () {
        const idPaciente = $(this).val();
        if (!idPaciente) {
            $("#cardPatientName").text("N/D");
            $("#cardPatientHist").text("N/D");
            $("#cardPatientBirth").text("N/D");
            $("#cardPatientSex").text("N/D");
            $("#cardPatientPhone").text("N/D");
            $("#cardPatientEmail").text("N/D").attr("title", "");
            $("#cardPatientCity").text("N/D");
            $("#cardPatientDate").text("N/D");
            return;
        }

        $.getJSON("/Visor/GetDatosPaciente", { idPaciente: idPaciente })
            .done(function (paciente) {
                if (!paciente) {
                    $("#cardPatientName").text("N/D");
                    $("#cardPatientHist").text("N/D");
                    $("#cardPatientBirth").text("N/D");
                    $("#cardPatientSex").text("N/D");
                    $("#cardPatientPhone").text("N/D");
                    $("#cardPatientEmail").text("N/D").attr("title", "");
                    $("#cardPatientCity").text("N/D");
                    $("#cardPatientDate").text("N/D");
                    return;
                }

                // Rellenar ficha demográfica del paciente
                const nombreCompleto = ((paciente.nombre || "") + " " + (paciente.apellidos || "")).trim();
                $("#cardPatientName").text(nombreCompleto || "N/D");
                $("#cardPatientHist").text(paciente.numeroHistoriaClinica || "N/D");
                $("#cardPatientBirth").text(paciente.fechaNacimiento || "N/D");

                let sexoTexto = "N/D";
                if (paciente.sexo === "M" || paciente.sexo === "Masculino") sexoTexto = "Masculino";
                else if (paciente.sexo === "F" || paciente.sexo === "Femenino") sexoTexto = "Femenino";
                else if (paciente.sexo) sexoTexto = paciente.sexo;
                $("#cardPatientSex").text(sexoTexto);

                $("#cardPatientPhone").text(paciente.telefono || "N/D");
                $("#cardPatientEmail").text(paciente.email || "N/D").attr("title", paciente.email || "");
                $("#cardPatientCity").text(paciente.ciudad || "N/D");

                // Volcar radiografías en Estudios DCM (panel izquierdo) manteniendo el icono
                const $thumbnails = $("#thumbnailsList");
                $thumbnails.empty();

                if (paciente.radiografias && paciente.radiografias.length > 0) {
                    const primerEstudio = paciente.radiografias[0];
                    $("#cardPatientDate").text(primerEstudio.studyDate || "N/D");

                    paciente.radiografias.forEach(function (r, idx) {
                        const isActive = idx === 0 ? " active" : "";
                        const ruta = "/media/images/Radiografias/5.dcm";
                        const code = r.nombreEstudio || `Radiografía ${idx + 1}`;
                        const date = r.studyDate || "N/D";
                        const extra = [r.zonaAnatomica, r.tipoRadiografia].filter(Boolean).join(" • ");

                        $thumbnails.append(
                            `<div class="thumbnail-item${isActive}" data-dcm="${ruta}" data-code="${code}" data-date="${date}">` +
                                `<div class="thumbnail-icon-box">` +
                                    `<i class="fa-solid fa-x-ray"></i>` +
                                `</div>` +
                                `<div class="thumbnail-meta">` +
                                    `<div class="thumbnail-code">${code}</div>` +
                                    `<div class="thumbnail-date">${date}${extra ? " • " + extra : ""}</div>` +
                                `</div>` +
                            `</div>`
                        );
                    });

                    // Cargar primer estudio verificado
                    cargarRadiografia("/media/images/Radiografias/5.dcm", primerEstudio.nombreEstudio || "R-00 Principal");
                } else {
                    $("#cardPatientDate").text("N/D");
                    $thumbnails.html('<div class="text-white text-center py-3" style="font-size:0.75rem;">Sin radiografías registradas</div>');
                }
            })
            .fail(function (err) {
                console.error("Error al cargar datos del paciente:", err);
                $("#cardPatientName").text("N/D");
                $("#cardPatientHist").text("N/D");
                $("#cardPatientBirth").text("N/D");
                $("#cardPatientSex").text("N/D");
                $("#cardPatientPhone").text("N/D");
                $("#cardPatientEmail").text("N/D").attr("title", "");
                $("#cardPatientCity").text("N/D");
                $("#cardPatientDate").text("N/D");
            });
    });

    // Eventos de selección de radiografía
    $("#listadoRadiografias").change(function () {
        const rutaDicom = $(this).val();
        const texto = $(this).find("option:selected").text();
        cargarRadiografia(rutaDicom, texto);
    });

    // Clic en elemento de miniatura / estudio (delegado para soportar items dinámicos)
    $("#thumbnailsList").on("click", ".thumbnail-item", function () {
        const rutaDicom = $(this).data("dcm");
        const code = $(this).data("code");
        const date = $(this).data("date");
        if (date && date !== "N/D") {
            $("#cardPatientDate").text(date);
        }
        cargarRadiografia(rutaDicom, `${code} (${date})`);
    });

    // Cargar automáticamente el estudio principal 5.dcm verificado
    const primerEstudio = "/media/images/Radiografias/5.dcm";
    cargarRadiografia(primerEstudio, "R-00 Principal (Verificado)");

    // ==========================================================
    // INTERACCIÓN DE DIBUJO Y MEDICIÓN (MOUSEDOWN / MOUSEMOVE)
    // ==========================================================

    // Cálculo de ángulo entre 3 puntos (P1, P2=vértice, P3)
    function calculateAngleDegrees(p1, p2, p3) {
        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 === 0 || mag2 === 0) return 0;
        let cosine = dot / (mag1 * mag2);
        cosine = Math.max(-1, Math.min(1, cosine));
        return Math.acos(cosine) * (180 / Math.PI);
    }

    // Clavado e inicio de puntos, líneas, rectángulos, ángulos
    element.addEventListener("mousedown", function (e) {
        if (e.button !== 0 || locked || !currentImage || toolMode === "none") return;

        const coords = cornerstone.pageToPixel(element, e.clientX, e.clientY);

        // 1. MODO PUNTO
        if (toolMode === "point") {
            points.push(coords);
            cornerstone.updateImage(element);
            renderMeasurementsList();
            return;
        }

        // 2. MODO LÍNEA (Medición en 2 clics)
        if (toolMode === "line") {
            if (linePoints.length === 0 || linePoints.length === 2) {
                linePoints = [coords];
                linePreviewPoint = coords;
            } else if (linePoints.length === 1) {
                linePoints.push(coords);
                linePreviewPoint = null;
                const distMM = getDistanceMM(linePoints[0], linePoints[1]);
                linesHistory.push({ p1: linePoints[0], p2: linePoints[1], distMM });
                linePoints = [];
                renderMeasurementsList();
            }
            cornerstone.updateImage(element);
            return;
        }

        // 3. MODO RECTÁNGULO (2 clics)
        if (toolMode === "rectangle") {
            if (!isDrawingRect) {
                rectStart = coords;
                rectPreview = coords;
                rectEnd = null;
                isDrawingRect = true;
            } else {
                rectEnd = coords;
                rectPreview = null;
                isDrawingRect = false;

                const p1 = rectStart;
                const p2 = rectEnd;
                const w = Math.abs(p1.x - p2.x);
                const h = Math.abs(p1.y - p2.y);
                const wMM = w * pixelSpacing[1];
                const hMM = h * pixelSpacing[0];
                const areaMM2 = wMM * hMM;
                rectsHistory.push({ p1, p2, wMM, hMM, areaMM2 });

                rectStart = null;
                rectEnd = null;
                renderMeasurementsList();
            }
            cornerstone.updateImage(element);
            updateHUD();
            return;
        }

        // 4. MODO ÁNGULO (3 clics: A -> Vértice B -> C)
        if (toolMode === "angle") {
            if (anglePoints.length === 0 || anglePoints.length === 3) {
                anglePoints = [coords];
                anglePreviewPoint = coords;
            } else if (anglePoints.length === 1) {
                anglePoints.push(coords);
                anglePreviewPoint = coords;
            } else if (anglePoints.length === 2) {
                anglePoints.push(coords);
                anglePreviewPoint = null;
                const deg = calculateAngleDegrees(anglePoints[0], anglePoints[1], anglePoints[2]);
                anglesHistory.push({ p1: anglePoints[0], p2: anglePoints[1], p3: anglePoints[2], deg });
                anglePoints = [];
                renderMeasurementsList();
            }
            cornerstone.updateImage(element);
            updateHUD();
            return;
        }
    });

    // Desplazamiento dinámico (mousemove) para preview de dibujo, telemetría y lupa
    element.addEventListener("mousemove", function (e) {
        if (!currentImage) return;

        const coords = cornerstone.pageToPixel(element, e.clientX, e.clientY);

        // Telemetría en tiempo real (X, Y y valor de pixel / HU)
        const inBounds = coords.x >= 0 && coords.x < currentImage.columns && coords.y >= 0 && coords.y < currentImage.rows;
        if (inBounds) {
            $("#telCoord").text(`X: ${Math.round(coords.x)} | Y: ${Math.round(coords.y)}`);

            try {
                const pixelData = currentImage.getPixelData();
                const pixelIndex = Math.floor(coords.y) * currentImage.columns + Math.floor(coords.x);
                if (pixelData && pixelIndex >= 0 && pixelIndex < pixelData.length) {
                    const rawVal = pixelData[pixelIndex];
                    const slope = currentImage.slope || 1;
                    const intercept = currentImage.intercept || 0;
                    const hu = Math.round(rawVal * slope + intercept);
                    $("#telPixelValue").text(`${hu} HU`);
                } else {
                    $("#telPixelValue").text(`-- HU`);
                }
            } catch (err) {
                $("#telPixelValue").text(`-- HU`);
            }
        } else {
            $("#telCoord").text(`X: -- | Y: --`);
            $("#telPixelValue").text(`-- HU`);
        }

        // Lupa diagnóstica (Magnifier)
        if (toolMode === "magnifier" && inBounds) {
            const $mag = $("#magnifierCanvas");
            $mag.show();
            const rect = element.getBoundingClientRect();
            $mag.css({
                left: (e.clientX - rect.left - 75) + "px",
                top: (e.clientY - rect.top - 75) + "px"
            });

            // Dibujar región magnificada en el canvas interno de la lupa
            const canvasSource = element.querySelector("canvas");
            const magCanvas = document.getElementById("magnifierInnerCanvas");
            if (canvasSource && magCanvas) {
                magCanvas.width = 150;
                magCanvas.height = 150;
                const mCtx = magCanvas.getContext("2d");
                mCtx.imageSmoothingEnabled = false;

                const sx = (e.clientX - rect.left) * (canvasSource.width / rect.width);
                const sy = (e.clientY - rect.top) * (canvasSource.height / rect.height);
                const sw = 60;
                const sh = 60;

                mCtx.drawImage(canvasSource, sx - sw / 2, sy - sh / 2, sw, sh, 0, 0, 150, 150);

                // Retícula central de la lupa
                mCtx.strokeStyle = "rgba(56, 189, 248, 0.7)";
                mCtx.lineWidth = 1;
                mCtx.beginPath();
                mCtx.moveTo(75, 65); mCtx.lineTo(75, 85);
                mCtx.moveTo(65, 75); mCtx.lineTo(85, 75);
                mCtx.stroke();
            }
        } else {
            $("#magnifierCanvas").hide();
        }

        // Previews de herramientas de dibujo
        if (locked || toolMode === "none") return;

        if (toolMode === "rectangle" && isDrawingRect && rectStart) {
            rectPreview = coords;
            cornerstone.updateImage(element);
        } else if (toolMode === "line" && linePoints.length === 1) {
            linePreviewPoint = coords;
            cornerstone.updateImage(element);
        } else if (toolMode === "angle" && anglePoints.length > 0) {
            anglePreviewPoint = coords;
            cornerstone.updateImage(element);
        }
    });

    element.addEventListener("mouseleave", function () {
        $("#magnifierCanvas").hide();
        $("#telCoord").text(`X: -- | Y: --`);
        $("#telPixelValue").text(`-- HU`);
    });

    // ==========================================================
    // RENDERIZADO EN CANVAS (CORNERSTONEIMAGERENDERED)
    // ==========================================================
    element.addEventListener("cornerstoneimagerendered", function (e) {
        if (e.detail && e.detail.viewport) {
            updateHUD(e.detail.viewport);
        }

        const ctx = e.detail.canvasContext;
        if (!ctx) return;

        ctx.save();

        // 1. RENDERIZAR PUNTOS
        if (points.length > 0) {
            points.forEach((p, idx) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = "#ef4444";
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();

                drawLabelBadge(ctx, `P${idx + 1}`, p.x + 8, p.y - 8);
            });
        }

        // 2. RENDERIZAR LÍNEAS HISTÓRICAS
        linesHistory.forEach((l, idx) => {
            renderLine(ctx, l.p1, l.p2, false, `${l.distMM.toFixed(2)} mm`);
        });

        // LÍNEA EN CURSO
        if (linePoints.length === 1 && linePreviewPoint) {
            const distMM = getDistanceMM(linePoints[0], linePreviewPoint).toFixed(2);
            renderLine(ctx, linePoints[0], linePreviewPoint, true, `${distMM} mm`);
        }

        // 3. RENDERIZAR RECTÁNGULOS HISTÓRICOS
        rectsHistory.forEach((r, idx) => {
            renderRect(ctx, r.p1, r.p2, false, `${r.wMM.toFixed(1)}x${r.hMM.toFixed(1)} mm`);
        });

        // RECTÁNGULO EN CURSO
        if (isDrawingRect && rectStart && rectPreview) {
            const wMM = (Math.abs(rectStart.x - rectPreview.x) * pixelSpacing[1]).toFixed(1);
            const hMM = (Math.abs(rectStart.y - rectPreview.y) * pixelSpacing[0]).toFixed(1);
            renderRect(ctx, rectStart, rectPreview, true, `${wMM}x${hMM} mm`);
        }

        // 4. RENDERIZAR ÁNGULOS HISTÓRICOS
        anglesHistory.forEach((a, idx) => {
            renderAngle(ctx, a.p1, a.p2, a.p3, `${a.deg.toFixed(1)}°`);
        });

        // ÁNGULO EN CURSO
        if (anglePoints.length === 1 && anglePreviewPoint) {
            renderLine(ctx, anglePoints[0], anglePreviewPoint, true, "");
        } else if (anglePoints.length === 2 && anglePreviewPoint) {
            renderLine(ctx, anglePoints[0], anglePoints[1], false, "");
            const tempDeg = calculateAngleDegrees(anglePoints[0], anglePoints[1], anglePreviewPoint).toFixed(1);
            renderLine(ctx, anglePoints[1], anglePreviewPoint, true, `${tempDeg}°`);
        }

        ctx.restore();
    });

    // Funciones auxiliares de renderizado gráfico
    function renderLine(ctx, p1, p2, isPreview, label) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = isPreview ? "#38bdf8" : "#22c55e";
        ctx.lineWidth = 2;
        if (isPreview) ctx.setLineDash([4, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);

        [p1, p2].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = isPreview ? "#38bdf8" : "#22c55e";
            ctx.fill();
        });

        if (label) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            drawLabelBadge(ctx, label, midX + 6, midY - 6);
        }
    }

    function renderRect(ctx, p1, p2, isPreview, label) {
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p1.x - p2.x);
        const h = Math.abs(p1.y - p2.y);

        if (isPreview) {
            ctx.setLineDash([6, 5]);
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "rgba(56, 189, 248, 0.15)";
            ctx.fillRect(x, y, w, h);
            ctx.setLineDash([]);
        } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "rgba(251, 191, 36, 0.08)";
            ctx.fillRect(x, y, w, h);

            drawHandle(ctx, x, y);
            drawHandle(ctx, x + w, y);
            drawHandle(ctx, x, y + h);
            drawHandle(ctx, x + w, y + h);
        }

        if (label) {
            drawLabelBadge(ctx, label, x, y - 6);
        }
    }

    function renderAngle(ctx, p1, p2, p3, label) {
        // p2 es el vértice
        renderLine(ctx, p1, p2, false, "");
        renderLine(ctx, p2, p3, false, "");

        // Vértice resaltado
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawLabelBadge(ctx, label, p2.x + 8, p2.y - 8);
    }

    // ==========================================================
    // FUNCIONES AUXILIARES DE CÁLCULO Y DISEÑO
    // ==========================================================
    function getDistanceMM(p1, p2) {
        const dx = (p2.x - p1.x) * pixelSpacing[1];
        const dy = (p2.y - p1.y) * pixelSpacing[0];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function drawLabelBadge(ctx, text, x, y) {
        ctx.save();
        ctx.font = "bold 11px ui-monospace, SFMono-Regular, Consolas, monospace";
        const metrics = ctx.measureText(text);
        const padding = 5;
        const boxHeight = 18;
        const boxWidth = metrics.width + padding * 2;

        const drawY = Math.max(boxHeight + 2, y);

        ctx.fillStyle = "rgba(11, 15, 25, 0.88)";
        ctx.fillRect(x, drawY - boxHeight, boxWidth, boxHeight);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, drawY - boxHeight, boxWidth, boxHeight);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x + padding, drawY - 5);
        ctx.restore();
    }

    function drawHandle(ctx, x, y) {
        ctx.save();
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
        ctx.restore();
    }

    // ==========================================================
    // PANELES COLAPSABLES Y RESIZE DINÁMICO
    // ==========================================================
    const triggerResize = () => {
        setTimeout(() => {
            cornerstone.resize(element, true);
        }, 310);
    };

    // Toggle Panel Izquierdo
    $("#btnToggleLeftPanel, #btnCloseLeftPanel").click(function () {
        $("#panelIzquierdo").toggleClass("collapsed");
        const isCollapsed = $("#panelIzquierdo").hasClass("collapsed");
        $("#btnOpenLeftPanel").toggleClass("visible", isCollapsed);
        triggerResize();
    });

    $("#btnOpenLeftPanel").click(function () {
        $("#panelIzquierdo").removeClass("collapsed");
        $(this).removeClass("visible");
        triggerResize();
    });

    // Toggle Panel Derecho
    $("#btnToggleRightPanel, #btnCloseRightPanel").click(function () {
        $("#panelDerecho").toggleClass("collapsed");
        const isCollapsed = $("#panelDerecho").hasClass("collapsed");
        $("#btnOpenRightPanel").toggleClass("visible", isCollapsed);
        triggerResize();
    });

    $("#btnOpenRightPanel").click(function () {
        $("#panelDerecho").removeClass("collapsed");
        $(this).removeClass("visible");
        triggerResize();
    });

    // ==========================================================
    // PANTALLA COMPLETA Y RESIZE OBSERVER
    // ==========================================================
    abrirVisorFullScreen = function () {
        const visorWrapper = document.querySelector(".viewer-wrapper");
        if (visorWrapper.requestFullscreen) {
            visorWrapper.requestFullscreen();
        } else if (visorWrapper.webkitRequestFullscreen) {
            visorWrapper.webkitRequestFullscreen();
        }
        $(".viewer-wrapper").addClass("fullscreen-mode");

        setTimeout(function () {
            cornerstone.resize(element, true);
        }, 150);
    };

    salirVisorFullScreen = function () {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        $(".viewer-wrapper").removeClass("fullscreen-mode");
    };

    document.addEventListener("fullscreenchange", function () {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        $(".viewer-wrapper").toggleClass("fullscreen-mode", isFs);
        setTimeout(function () {
            cornerstone.resize(element, true);
        }, 80);
    });

    const observer = new ResizeObserver(() => {
        cornerstone.resize(element, true);
    });
    observer.observe(element);

    // ==========================================================
    // MENÚ CONTEXTUAL CLÍNICO PACS (CLIC DERECHO EN VISOR)
    // ==========================================================
    const $contextMenu = $("#pacsContextMenu");

    // Abrir menú contextual al hacer clic derecho sobre el visor
    $("#dicomViewer, .pacs-viewer-viewport").on("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();

        const mouseX = e.clientX;
        const mouseY = e.clientY;
        const menuWidth = 210;
        const menuHeight = 250;
        const windowWidth = $(window).width();
        const windowHeight = $(window).height();

        let posX = mouseX;
        let posY = mouseY;
        if (mouseX + menuWidth > windowWidth) {
            posX = mouseX - menuWidth;
        }
        if (mouseY + menuHeight > windowHeight) {
            posY = mouseY - menuHeight;
        }

        $contextMenu.css({
            top: posY + "px",
            left: posX + "px",
            display: "block"
        });
    });

    // Cerrar menú contextual al hacer clic fuera o con Escape
    $(document).on("click", function (e) {
        if (!$(e.target).closest("#pacsContextMenu").length) {
            $contextMenu.hide();
        }
    });

    $(document).on("keydown", function (e) {
        if (e.key === "Escape") {
            $contextMenu.hide();
        }
    });

    // Despacho de acciones del menú contextual
    $contextMenu.on("click", ".pacs-ctx-item", function () {
        const action = $(this).data("action");
        const val = $(this).data("val");
        $contextMenu.hide();

        if (action === "tool") {
            $("#toolMode").val(val).trigger("change");
        } else if (action === "clear") {
            $("#limpiarDibujos").trigger("click");
        } else if (action === "reset") {
            $("#reset").trigger("click");
        }
    });
});