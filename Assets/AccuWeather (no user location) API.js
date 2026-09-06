// Europa-Wetterlinse mit AccuWeather.
//
// Bildschirmtexte: Esperanto in h-Schrift.
// A*/M*: Maximum/Minimum im verwendeten Stützpunktnetz.
//
// - Keine Wetterabfrage vor dem Tippen
// - Höchstens zwei gleichzeitige Anfragen
// - 30 Sekunden Zeitlimit je Anfrage
// - Keine automatischen Wiederholungen
//
// pressureMb wird direkt als hPa übernommen.
// Meereshöhenbezug wird angenommen.
//
// Die generierte API-Moduldatei NICHT verändern.

// @input Asset.RemoteServiceModule remoteServiceModule
// @input Component.Text statusText
// @input SceneObject pressureArea
// @input Asset.ObjectPrefab pressureLabelPrefab
// @input Component.RenderMeshVisual isobarVisual
// @input bool showPointValues = false


/* =========================================================
 * KONFIGURATION
 * ========================================================= */

var CFG = {
    lonMin: -30,
    lonMax: 35,
    latMin: 30,
    latMax: 72.5,

    isobarInterval: 4,
    maxTriangleEdgeKm: 1200,

    maxAgeHours: 3,
    maxTimeSpreadMinutes: 90,

    concurrency: 2,
    requestTimeoutSeconds: 30,
    totalTimeoutSeconds: 100,

    successCooldownMinutes: 10,
    partialCooldownMinutes: 1,

    lineWidth: 0.002,
    maxMeshSegments: 12000,

    // Abstand zwischen den sichtbaren Linienrändern.
    // Einheit wie die y-Koordinate der PressureArea.
    isobarGap: 0.006,

    // Kleinere Werte erlauben kürzere Unterbrechungen,
    // benötigen aber mehr Mesh-Segmente.
    clearanceStep: 0.008
};


/* =========================================================
 * ALLE 44 ORTE
 * Keine weiteren LOCATIONS.concat-Blöcke erforderlich.
 * ========================================================= */

var LOCATIONS = [
    { name: "Ponta Delgada", lat: 37.74, lon: -25.67 },
    { name: "Funchal",       lat: 32.65, lon: -16.91 },
    { name: "Rejkjaviko",    lat: 64.15, lon: -21.94 },
    { name: "Torshavn",      lat: 62.01, lon: -6.77 },
    { name: "Dublino",       lat: 53.35, lon: -6.26 },
    { name: "Londono",       lat: 51.51, lon: -0.13 },
    { name: "Lisbono",       lat: 38.72, lon: -9.14 },
    { name: "Madrido",       lat: 40.42, lon: -3.70 },
    { name: "Parizo",        lat: 48.86, lon: 2.35 },
    { name: "Hamburgo",      lat: 53.55, lon: 9.99 },
    { name: "Oslo",          lat: 59.91, lon: 10.75 },
    { name: "Stokholmo",     lat: 59.33, lon: 18.07 },
    { name: "Tromso",        lat: 69.65, lon: 18.96 },
    { name: "Helsinko",      lat: 60.17, lon: 24.94 },
    { name: "Varsovio",      lat: 52.23, lon: 21.01 },
    { name: "Vieno",         lat: 48.21, lon: 16.37 },
    { name: "Romo",          lat: 41.90, lon: 12.50 },
    { name: "Ateno",         lat: 37.98, lon: 23.73 },
    { name: "Bukureshto",    lat: 44.43, lon: 26.10 },
    { name: "Istanbulo",     lat: 41.01, lon: 28.98 },

    { name: "Brest",         lat: 48.39, lon: -4.49 },
    { name: "Barcelono",     lat: 41.39, lon: 2.17 },
    { name: "Milano",        lat: 45.46, lon: 9.19 },
    { name: "Berlino",       lat: 52.52, lon: 13.41 },
    { name: "Prago",         lat: 50.08, lon: 14.44 },
    { name: "Zagrebo",       lat: 45.81, lon: 15.98 },
    { name: "Sofio",         lat: 42.70, lon: 23.32 },
    { name: "Rigo",          lat: 56.95, lon: 24.11 },
    { name: "Bergeno",       lat: 60.39, lon: 5.32 },
    { name: "Oulu",          lat: 65.01, lon: 25.47 },
    { name: "Lerwick",       lat: 60.15, lon: -1.15 },
    { name: "Akureyri",      lat: 65.68, lon: -18.09 },
    { name: "Rabato",        lat: 34.02, lon: -6.84 },
    { name: "Alghero",       lat: 36.75, lon: 3.06 },
    { name: "Tunizo",        lat: 36.81, lon: 10.18 },
    { name: "Antaljo",       lat: 36.88, lon: 30.70 },

    { name: "Galway",         lat: 53.27, lon: -9.05 },
    { name: "Stornoway",      lat: 58.21, lon: -6.39 },
    { name: "Minsko",         lat: 53.90, lon: 27.56 },
    { name: "Kijivo",         lat: 50.45, lon: 30.52 },
    { name: "Odeso",          lat: 46.48, lon: 30.73 },
    { name: "Sankt-Peterburgo", lat: 59.93, lon: 30.34 },
    { name: "Murmansko",      lat: 68.97, lon: 33.08 },
    { name: "Ankaro",         lat: 39.93, lon: 32.86 }
];


/* =========================================================
 * ZUSTAND
 * ========================================================= */

var api = null;
var phase = "idle";
var generation = 0;

var results = [];
var jobs = [];

var nextToStart = 0;
var activeRequests = 0;
var completedRequests = 0;
var failures = 0;

var tappedAt = 0;
var loadingFinishedAt = 0;

var nextAllowedTime = 0;
var stopReason = "";

var labelObjects = [];
var occupiedLabels = [];

var meshReference = null;


/* =========================================================
 * EREIGNISSE
 * ========================================================= */

var updateEvent = script.createEvent("UpdateEvent");
updateEvent.enabled = false;
updateEvent.bind(onUpdate);

var drawEvent = script.createEvent("DelayedCallbackEvent");
drawEvent.bind(function () {
    if (phase !== "drawing") {
        return;
    }

    try {
        drawWeather();
    } catch (error) {
        fail(
            "Eraro dum la desegnado.\n" +
            "Kontrolu la agordojn kaj la protokolon.",
            error
        );
    }
});

script.createEvent("OnStartEvent").bind(function () {
    if (script.pressureArea) {
        script.pressureArea.enabled = false;
    }

    if (script.isobarVisual) {
        script.isobarVisual.enabled = false;
    }

    show(
        "Europo: aerpremo\n\n" +
        "Tushu la ekranon\n" +
        "por shargi veterdatumojn."
    );
});

script.createEvent("TapEvent").bind(function () {
    if (
        phase === "starting" ||
        phase === "loading" ||
        phase === "drawing"
    ) {
        return;
    }

    if (Date.now() < nextAllowedTime) {
        return;
    }

    var missing = missingInputs();

    if (missing.length) {
        show(
            "Mankas agordoj de la skripto:\n\n" +
            missing.join("\n")
        );

        print(
            "MANKANTAJ AGORDOJ: " +
            missing.join(", ")
        );

        return;
    }

    generation++;
    tappedAt = Date.now();

    phase = "starting";

    show("Preparante la konekton al AccuWeather ...");

    updateEvent.enabled = true;
});

script.createEvent("OnDestroyEvent").bind(function () {
    generation++;
    phase = "destroyed";

    updateEvent.enabled = false;
    drawEvent.cancel();
});


/* =========================================================
 * ALLGEMEINE HILFSFUNKTIONEN
 * ========================================================= */

function show(text) {
    if (script.statusText) {
        script.statusText.text = text;
    } else {
        print(text);
    }
}

function numeric(value) {
    if (
        value === null ||
        value === undefined ||
        value === "" ||
        typeof value === "boolean"
    ) {
        return null;
    }

    var n = Number(value);
    return isFinite(n) ? n : null;
}

function formatNumber(value, digits) {
    return Number(value)
        .toFixed(digits)
        .replace(".", ",");
}

function missingInputs() {
    var missing = [];

    // Die technischen Inspector-Feldnamen bleiben unverändert.
    if (!script.remoteServiceModule) {
        missing.push("Remote Service Module");
    }

    if (!script.statusText) {
        missing.push("Status Text");
    }

    if (!script.pressureArea) {
        missing.push("Pressure Area");
    } else if (
        !script.pressureArea.getComponent(
            "Component.ScreenTransform"
        )
    ) {
        missing.push("Screen Transform: Pressure Area");
    }

    if (!script.pressureLabelPrefab) {
        missing.push("Pressure Label Prefab");
    }

    if (!script.isobarVisual) {
        missing.push("Isobar Visual");
    }

    return missing;
}

function clearLabels() {
    labelObjects.forEach(function (obj) {
        obj.destroy();
    });

    labelObjects = [];
    occupiedLabels = [];
}


/* =========================================================
 * ABRUFSTEUERUNG
 * ========================================================= */

function beginLoading() {
    clearLabels();

    script.pressureArea.enabled = true;
    script.isobarVisual.enabled = false;

    results = [];
    jobs = [];

    nextToStart = 0;
    activeRequests = 0;
    completedRequests = 0;
    failures = 0;

    stopReason = "";
    loadingFinishedAt = 0;

    // Modul erst nach dem Tippen initialisieren.
    if (!api) {
        var Module = require(
            "./AccuWeather (no user location) API Module"
        );

        api = new Module.ApiModule(
            script.remoteServiceModule
        );
    }

    phase = "loading";

    print(
        "EKSHARGO: " +
        LOCATIONS.length + " lokoj; " +
        "maksimume " + CFG.concurrency +
        " samtempaj petoj."
    );

    showProgress();
}

function onUpdate() {
    try {
        if (phase === "starting") {
            beginLoading();
            return;
        }

        if (phase !== "loading") {
            updateEvent.enabled = false;
            return;
        }

        var now = Date.now();

        if (
            now - tappedAt >=
            CFG.totalTimeoutSeconds * 1000
        ) {
            finishLoading(
                "La tuta shargado atingis la tempolimon."
            );

            return;
        }

        // Laufende Anfragen einzeln überwachen.
        for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];

            if (
                !job.done &&
                now - job.startedAt >=
                    CFG.requestTimeoutSeconds * 1000
            ) {
                /*
                 * Der Wrapper kann laufende Anfragen nicht
                 * aktiv abbrechen. Deshalb keine Ersatzanfrage
                 * nachschieben, sondern Teilergebnisse verwenden.
                 */
                finishLoading(
                    "Tempolimo atingita che " +
                    job.location.name + "."
                );

                return;
            }
        }

        // Freie Plätze besetzen.
        while (
            phase === "loading" &&
            activeRequests < CFG.concurrency &&
            nextToStart < LOCATIONS.length
        ) {
            var index = nextToStart++;
            launchRequest(index);
        }

        if (
            phase === "loading" &&
            nextToStart >= LOCATIONS.length &&
            activeRequests === 0
        ) {
            finishLoading("");
        }
    } catch (error) {
        fail(
            "Eraro dum la datumshargado.\n" +
            "Kontrolu la konekton kaj la protokolon.",
            error
        );
    }
}

function launchRequest(index) {
    var location = LOCATIONS[index];
    var thisGeneration = generation;

    var job = {
        index: index,
        location: location,
        startedAt: Date.now(),
        done: false
    };

    jobs.push(job);
    activeRequests++;

    showProgress();

    try {
        api.current_condition({
            parameters: {
                lat: location.lat.toFixed(4),
                lng: location.lon.toFixed(4)
            }
        }).then(function (response) {
            if (!isCurrentJob(job, thisGeneration)) {
                return;
            }

            var point = readPoint(
                location,
                response.bodyAsJson(),
                index
            );

            settleJob(job);
            results.push(point);

            print(
                point.name +
                " | " + formatNumber(point.pressure, 1) +
                " hPa | API-loko: " + point.assignedName +
                " | Datumtempo: " +
                new Date(point.time).toISOString() +
                " | Petotempo: " +
                formatNumber(
                    (Date.now() - job.startedAt) / 1000,
                    2
                ) + " s"
            );

            afterRequest();
        }).catch(function (error) {
            requestFailed(
                job,
                thisGeneration,
                error
            );
        });

    } catch (error) {
        requestFailed(
            job,
            thisGeneration,
            error
        );
    }
}

function isCurrentJob(job, thisGeneration) {
    return (
        phase === "loading" &&
        thisGeneration === generation &&
        !job.done
    );
}

function settleJob(job) {
    job.done = true;
    activeRequests--;
    completedRequests++;
}

function requestFailed(job, thisGeneration, error) {
    if (!isCurrentJob(job, thisGeneration)) {
        return;
    }

    settleJob(job);
    failures++;

    var message = String(error);

    // Originale externe Fehler nur für die Diagnose im Logger.
    print(
        "ERARO CHE " + job.location.name +
        " | Originala eraro: " + message
    );

    if (
        /Access Denied|429|quota|rate.?limit|Too Many Requests/i.test(
            message
        )
    ) {
        finishLoading(
            "API-limo au alira limigo."
        );

        return;
    }

    afterRequest();
}

function afterRequest() {
    if (phase !== "loading") {
        return;
    }

    showProgress();

    if (completedRequests >= LOCATIONS.length) {
        finishLoading("");
    }

    // Freier Platz wird im nächsten Update neu besetzt.
}

function showProgress() {
    var pending = [];

    jobs.forEach(function (job) {
        if (!job.done) {
            pending.push(job.location.name);
        }
    });

    var text =
        "Europo: aerpremo\n" +
        "Shargante datumojn ...\n" +
        "Finitaj petoj: " +
        completedRequests + "/" + LOCATIONS.length +
        "\nUzeblaj valoroj: " + results.length;

    if (pending.length) {
        text += "\n" + pending.join(" · ");
    }

    if (failures) {
        text += "\nNeuzeblaj respondoj: " + failures;
    }

    show(text);
}

function finishLoading(reason) {
    if (phase !== "loading") {
        return;
    }

    stopReason = reason || "";
    loadingFinishedAt = Date.now();

    // Später eintreffende Antworten ignorieren.
    generation++;

    phase = "drawing";
    updateEvent.enabled = false;

    print(
        "SHARGADO FINITA: " +
        completedRequests + "/" + LOCATIONS.length +
        " petoj finitaj, " +
        results.length + " validaj valoroj, " +
        failures + " eraroj. " +
        "Tempo ekde la tusho: " +
        formatNumber(
            (loadingFinishedAt - tappedAt) / 1000,
            1
        ) + " s." +
        (stopReason ? " Kialo: " + stopReason : "")
    );

    show("Kalkulante la premkampon kaj izobarojn ...");

    drawEvent.reset(0.05);
}


/* =========================================================
 * API-ANTWORT AUSWERTEN
 * ========================================================= */

function readPoint(location, data, requestIndex) {
    var current = data && data.currentCondition;

    if (!current) {
        throw new Error(
            "La respondo ne enhavas currentCondition."
        );
    }

    var pressure = numeric(current.pressureMb);
    var time = numeric(current.epochMs);

    if (
        pressure === null ||
        pressure < 850 ||
        pressure > 1100
    ) {
        throw new Error(
            "Mankas kredinda premvaloro por la " +
            "supozata marnivela referenco."
        );
    }

    if (
        time === null ||
        !isFinite(new Date(time).getTime())
    ) {
        throw new Error(
            "Mankas valida datumtempo."
        );
    }

    var ageHours = (Date.now() - time) / 3600000;

    if (
        ageHours > CFG.maxAgeHours ||
        ageHours < -0.25
    ) {
        throw new Error(
            "La datumtempo estas tro malnova au estonta. " +
            "Kontrolu la aparatan horloghon kaj la API-datumtempon."
        );
    }

    var address = data.address || {};

    return {
        requestIndex: requestIndex,
        name: location.name,

        // Angefragte Koordinaten, keine bestätigten
        // Messstationskoordinaten.
        lat: location.lat,
        lon: location.lon,

        pressure: pressure,
        time: time,

        assignedName:
            address.locality ||
            address.adminArea1 ||
            address.country ||
            "neniu loknomo",

        // Annähernd metrische Ebene für die Triangulation.
        x: location.lon * Math.cos(55 * Math.PI / 180),
        y: location.lat
    };
}


/* =========================================================
 * BILDSCHIRMPOSITIONEN UND BESCHRIFTUNGEN
 * ========================================================= */

function project(lon, lat) {
    return {
        x: (
            (lon - CFG.lonMin) /
            (CFG.lonMax - CFG.lonMin) * 2 - 1
        ) * 0.88,

        y: (
            (lat - CFG.latMin) /
            (CFG.latMax - CFG.latMin) * 2 - 1
        ) * 0.88
    };
}

function addLabel(textValue, position) {
    var obj = script.pressureLabelPrefab.instantiate(
        script.pressureArea
    );

    labelObjects.push(obj);

    var st = obj.getComponent(
        "Component.ScreenTransform"
    );

    var text = obj.getComponent(
        "Component.Text"
    );

    if (!st || !text) {
        throw new Error(
            "La radiko de PressureLabel devas enhavi " +
            "Screen Transform kaj Text."
        );
    }

    st.anchors.setCenter(
        new vec2(position.x, position.y)
    );

    st.anchors.setSize(
        new vec2(0.28, 0.13)
    );

    st.offsets.setCenter(new vec2(0, 0));
    st.offsets.setSize(new vec2(0, 0));

    text.text = textValue;
    text.setRenderOrder(200);

    obj.enabled = true;

    occupiedLabels.push(position);
}


/* =========================================================
 * DELAUNAY-TRIANGULATION
 * ========================================================= */

function circumcircle(a, b, c) {
    var d = 2 * (
        a.x * (b.y - c.y) +
        b.x * (c.y - a.y) +
        c.x * (a.y - b.y)
    );

    if (Math.abs(d) < 1e-10) {
        return null;
    }

    var aa = a.x * a.x + a.y * a.y;
    var bb = b.x * b.x + b.y * b.y;
    var cc = c.x * c.x + c.y * c.y;

    var x = (
        aa * (b.y - c.y) +
        bb * (c.y - a.y) +
        cc * (a.y - b.y)
    ) / d;

    var y = (
        aa * (c.x - b.x) +
        bb * (a.x - c.x) +
        cc * (b.x - a.x)
    ) / d;

    var dx = x - a.x;
    var dy = y - a.y;

    return {
        x: x,
        y: y,
        r2: dx * dx + dy * dy
    };
}

function triangulate(points) {
    var work = points.slice();
    var n = points.length;

    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;

    points.forEach(function (p) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    });

    var span = Math.max(
        maxX - minX,
        maxY - minY,
        1
    );

    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;

    work.push({
        x: cx - 20 * span,
        y: cy - 10 * span
    });

    work.push({
        x: cx,
        y: cy + 20 * span
    });

    work.push({
        x: cx + 20 * span,
        y: cy - 10 * span
    });

    var triangles = [[n, n + 1, n + 2]];

    for (var i = 0; i < n; i++) {
        var edges = {};
        var kept = [];
        var p = work[i];

        triangles.forEach(function (t) {
            var circle = circumcircle(
                work[t[0]],
                work[t[1]],
                work[t[2]]
            );

            if (!circle) {
                return;
            }

            var dx = p.x - circle.x;
            var dy = p.y - circle.y;

            var inside =
                dx * dx + dy * dy <=
                circle.r2 +
                Math.max(1, circle.r2) * 1e-10;

            if (inside) {
                for (var e = 0; e < 3; e++) {
                    var a = t[e];
                    var b = t[(e + 1) % 3];

                    var key =
                        Math.min(a, b) +
                        "_" +
                        Math.max(a, b);

                    if (edges[key]) {
                        edges[key].count++;
                    } else {
                        edges[key] = {
                            a: a,
                            b: b,
                            count: 1
                        };
                    }
                }
            } else {
                kept.push(t);
            }
        });

        Object.keys(edges).forEach(function (key) {
            var edge = edges[key];

            if (
                edge.count === 1 &&
                circumcircle(
                    work[edge.a],
                    work[edge.b],
                    p
                )
            ) {
                kept.push([
                    edge.a,
                    edge.b,
                    i
                ]);
            }
        });

        triangles = kept;
    }

    return triangles.filter(function (t) {
        return (
            t[0] < n &&
            t[1] < n &&
            t[2] < n
        );
    });
}

function distanceKm(a, b) {
    var rad = Math.PI / 180;

    var dLat = (b.lat - a.lat) * rad;
    var dLon = (b.lon - a.lon) * rad;

    var h =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(a.lat * rad) *
        Math.cos(b.lat * rad) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    h = Math.max(0, Math.min(1, h));

    return 12742 * Math.asin(Math.sqrt(h));
}

function supportedTriangle(t, points) {
    for (var e = 0; e < 3; e++) {
        var a = points[t[e]];
        var b = points[t[(e + 1) % 3]];

        if (
            distanceKm(a, b) >
            CFG.maxTriangleEdgeKm
        ) {
            return false;
        }
    }

    return true;
}


/* =========================================================
 * ISOBARENSEGMENTE
 * ========================================================= */

function contourSegments(points, triangles, level) {
    var segments = [];

    var values = points.map(function (point) {
        return contourPressure(point);
    });

    triangles.forEach(function (t) {
        var hits = [];

        for (var e = 0; e < 3; e++) {
            var ia = t[e];
            var ib = t[(e + 1) % 3];

            /*
             * Gemeinsame Dreieckskanten stets in derselben
             * Richtung auswerten. Das vermeidet unnötige
             * Rundungsunterschiede an Anschlussstellen.
             */
            if (ia > ib) {
                var temp = ia;
                ia = ib;
                ib = temp;
            }

            var a = points[ia];
            var b = points[ib];

            var pa = values[ia];
            var pb = values[ib];

            var aboveA = pa > level;
            var aboveB = pb > level;

            if (aboveA === aboveB) {
                continue;
            }

            var f = (level - pa) / (pb - pa);

            hits.push(project(
                a.lon + (b.lon - a.lon) * f,
                a.lat + (b.lat - a.lat) * f
            ));
        }

        if (hits.length !== 2) {
            return;
        }

        var dx = hits[1].x - hits[0].x;
        var dy = hits[1].y - hits[0].y;

        if (dx * dx + dy * dy <= 1e-12) {
            return;
        }

        segments.push({
            a: hits[0],
            b: hits[1],
            level: level
        });
    });

    return segments;
}

function labelContour(level, segments) {
    var candidates = segments.slice();

    candidates.sort(function (a, b) {
        var ax = (a.a.x + a.b.x) / 2;
        var ay = (a.a.y + a.b.y) / 2;

        var bx = (b.a.x + b.b.x) / 2;
        var by = (b.a.y + b.b.y) / 2;

        return (
            ax * ax + ay * ay -
            bx * bx - by * by
        );
    });

    for (var i = 0; i < candidates.length; i++) {
        var segment = candidates[i];

        var position = {
            x: (segment.a.x + segment.b.x) / 2,
            y: (segment.a.y + segment.b.y) / 2
        };

        var collision = occupiedLabels.some(
            function (other) {
                return (
                    Math.abs(other.x - position.x) < 0.25 &&
                    Math.abs(other.y - position.y) < 0.10
                );
            }
        );

        if (!collision) {
            addLabel(String(level), position);
            return;
        }
    }
}


/* =========================================================
 * LINIEN-MESH
 * ========================================================= */

function worldDistance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    var dz = a.z - b.z;

    return Math.sqrt(
        dx * dx + dy * dy + dz * dz
    );
}

function isobarStrokeWidth(segment) {
    // Zunächst keine zusätzlich verdickten Hauptisobaren.
    return CFG.lineWidth;
}

function sameContourEndpoint(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;

    return dx * dx + dy * dy < 1e-18;
}

function connectedContourSegments(a, b) {
    if (a.level !== b.level) {
        return false;
    }

    return (
        sameContourEndpoint(a.a, b.a) ||
        sameContourEndpoint(a.a, b.b) ||
        sameContourEndpoint(a.b, b.a) ||
        sameContourEndpoint(a.b, b.b)
    );
}

function pointSegmentDistance2(p, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var length2 = dx * dx + dy * dy;

    var t = 0;

    if (length2 > 0) {
        t = (
            (p.x - a.x) * dx +
            (p.y - a.y) * dy
        ) / length2;

        t = Math.max(0, Math.min(1, t));
    }

    var ex = p.x - (a.x + t * dx);
    var ey = p.y - (a.y + t * dy);

    return ex * ex + ey * ey;
}

function orientation2(a, b, c) {
    return (
        (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x)
    );
}

function segmentDistance2(a, b, c, d) {
    var o1 = orientation2(a, b, c);
    var o2 = orientation2(a, b, d);
    var o3 = orientation2(c, d, a);
    var o4 = orientation2(c, d, b);

    var boxesOverlap = !(
        Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
        Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
        Math.max(c.y, d.y) < Math.min(a.y, b.y)
    );

    var crossesAB =
        (o1 <= 0 && o2 >= 0) ||
        (o1 >= 0 && o2 <= 0);

    var crossesCD =
        (o3 <= 0 && o4 >= 0) ||
        (o3 >= 0 && o4 <= 0);

    if (boxesOverlap && crossesAB && crossesCD) {
        return 0;
    }

    return Math.min(
        pointSegmentDistance2(a, c, d),
        pointSegmentDistance2(b, c, d),
        pointSegmentDistance2(c, a, b),
        pointSegmentDistance2(d, a, b)
    );
}

function separateIsobarSegments(segments, aspect) {
    /*
     * In derselben Metrik arbeiten wie die Linienbreite
     * in buildLineMesh(): x wird mit aspect skaliert.
     */
    var metric = segments.map(function (s) {
        var a = {
            x: s.a.x * aspect,
            y: s.a.y
        };

        var b = {
            x: s.b.x * aspect,
            y: s.b.y
        };

        return {
            a: a,
            b: b,
            width: isobarStrokeWidth(s),

            minX: Math.min(a.x, b.x),
            maxX: Math.max(a.x, b.x),
            minY: Math.min(a.y, b.y),
            maxY: Math.max(a.y, b.y)
        };
    });

    var output = [];
    var removedPieces = 0;

    for (var i = 0; i < segments.length; i++) {
        var source = segments[i];
        var current = metric[i];
        var nearby = [];

        // Nur räumlich relevante Nachbarsegmente sammeln.
        for (var j = 0; j < segments.length; j++) {
            if (
                i === j ||
                connectedContourSegments(source, segments[j])
            ) {
                continue;
            }

            var other = metric[j];

            var clearance =
                (current.width + other.width) / 2 +
                CFG.isobarGap;

            if (
                current.maxX + clearance < other.minX ||
                other.maxX + clearance < current.minX ||
                current.maxY + clearance < other.minY ||
                other.maxY + clearance < current.minY
            ) {
                continue;
            }

            nearby.push({
                segment: other,
                clearance2: clearance * clearance
            });
        }

        // Ohne mögliche Kollision ist keine Unterteilung nötig.
        if (!nearby.length) {
            output.push(source);
            continue;
        }

        var dx = current.b.x - current.a.x;
        var dy = current.b.y - current.a.y;

        var length = Math.sqrt(dx * dx + dy * dy);

        var count = Math.max(
            1,
            Math.ceil(length / CFG.clearanceStep)
        );

        for (var k = 0; k < count; k++) {
            var t0 = k / count;
            var t1 = (k + 1) / count;

            var a = {
                x: current.a.x + dx * t0,
                y: current.a.y + dy * t0
            };

            var b = {
                x: current.a.x + dx * t1,
                y: current.a.y + dy * t1
            };

            var safe = true;

            for (var n = 0; n < nearby.length; n++) {
                var candidate = nearby[n];
                var obstacle = candidate.segment;

                /*
                 * Abstand des GANZEN Teilsegments prüfen,
                 * nicht nur seiner Endpunkte.
                 */
                if (
                    segmentDistance2(
                        a, b,
                        obstacle.a, obstacle.b
                    ) <= candidate.clearance2
                ) {
                    safe = false;
                    break;
                }
            }

            if (safe) {
                output.push({
                    a: {
                        x: a.x / aspect,
                        y: a.y
                    },
                    b: {
                        x: b.x / aspect,
                        y: b.y
                    },
                    level: source.level
                });
            } else {
                removedPieces++;
            }
        }
    }

    print(
        "IZOBARA DISTANCKONTROLO: " +
        removedPieces + " pecoj ne desegnitaj."
    );

    return output;
}

function buildLineMesh(segments) {
    if (!segments.length) {
        script.isobarVisual.enabled = false;
        return;
    }

    if (segments.length > CFG.maxMeshSegments) {
        throw new Error(
            "Tro multaj izobaraj segmentoj."
        );
    }

    var area = script.pressureArea.getComponent(
        "Component.ScreenTransform"
    );

    var inverse = script.isobarVisual
        .getSceneObject()
        .getTransform()
        .getInvertedWorldTransform();

    var worldWidth = worldDistance(
        area.localPointToWorldPoint(new vec2(-1, 0)),
        area.localPointToWorldPoint(new vec2(1, 0))
    );

    var worldHeight = worldDistance(
        area.localPointToWorldPoint(new vec2(0, -1)),
        area.localPointToWorldPoint(new vec2(0, 1))
    );

    if (worldWidth <= 0 || worldHeight <= 0) {
        throw new Error(
            "PressureArea ne havas videblan amplekson."
        );
    }

    var aspect = worldWidth / worldHeight;

    segments = separateIsobarSegments(segments, aspect);

    if (!segments.length) {
        script.isobarVisual.enabled = false;
        return;
    }

    // Nach der Unterteilung erneut prüfen!
    if (segments.length > CFG.maxMeshSegments) {
        throw new Error(
        "Tro multaj segmentoj post la distanckontrolo."
        );
    }

    // Nur tatsächlich sichtbare Linien beschriften.
    var levels = {};

    segments.forEach(function (segment) {
      var key = String(segment.level);

     if (!levels[key]) {
        levels[key] = [];
     }

    levels[key].push(segment);
    });

    Object.keys(levels).sort(function (a, b) {
    return Number(a) - Number(b);
    }).forEach(function (key) {
    labelContour(Number(key), levels[key]);
    });

    var vertices = [];
    var indices = [];

    function appendVertex(x, y) {
        var world = area.localPointToWorldPoint(
            new vec2(x, y)
        );

        var local = inverse.multiplyPoint(world);

        vertices.push(
            local.x,
            local.y,
            local.z
        );
    }

    segments.forEach(function (segment) {
        var dx =
            (segment.b.x - segment.a.x) * aspect;

        var dy =
            segment.b.y - segment.a.y;

        var length = Math.sqrt(
            dx * dx + dy * dy
        );

        if (length < 1e-10) {
            return;
        }

        var width = isobarStrokeWidth(segment);

        var nx =
            -dy / length * width / 2 / aspect;

        var ny =
            dx / length * width / 2;

        var base = vertices.length / 3;

        appendVertex(
            segment.a.x + nx,
            segment.a.y + ny
        );

        appendVertex(
            segment.a.x - nx,
            segment.a.y - ny
        );

        appendVertex(
            segment.b.x - nx,
            segment.b.y - ny
        );

        appendVertex(
            segment.b.x + nx,
            segment.b.y + ny
        );

        indices.push(
            base, base + 1, base + 2,
            base, base + 2, base + 3
        );
    });

    if (!indices.length) {
        script.isobarVisual.enabled = false;
        return;
    }

    var builder = new MeshBuilder([
        {
            name: "position",
            components: 3
        }
    ]);

    builder.topology = MeshTopology.Triangles;
    builder.indexType = MeshIndexType.UInt16;

    builder.appendVerticesInterleaved(vertices);
    builder.appendIndices(indices);

    if (!builder.isValid()) {
        throw new Error(
            "MeshBuilder raportas nevalidan izobaran geometrion."
        );
    }

    builder.updateMesh();

    meshReference = builder.getMesh();

    script.isobarVisual.mesh = meshReference;
    script.isobarVisual.setRenderOrder(100);
    script.isobarVisual.enabled = true;

    print(
        "IZOBARA GEOMETRIO: " +
        (vertices.length / 3) + " verticoj, " +
        (indices.length / 3) + " grafikaj trianguloj."
    );
}


/* =========================================================
 * GESAMTDARSTELLUNG
 * ========================================================= */

function drawWeather() {
    if (results.length < 3) {
        fail(
            "Tro malmultaj aktualaj premvaloroj.\n" +
            "Kontrolu la konekton kaj la protokolon."
        );

        return;
    }

    var newest = Math.max.apply(
        null,
        results.map(function (p) {
            return p.time;
        })
    );

    var points = results.filter(function (p) {
        return (
            newest - p.time <=
            CFG.maxTimeSpreadMinutes * 60000
        );
    });

    // Reihenfolge unabhängig vom Eintreffen der Antworten.
    points.sort(function (a, b) {
        return a.requestIndex - b.requestIndex;
    });

    if (points.length < 3) {
        fail(
            "Tro malmultaj valoroj kun sufiche " +
            "proksimaj datumtempoj."
        );

        return;
    }

    var allTriangles = triangulate(points);

    var triangles = allTriangles.filter(function (t) {
        return supportedTriangle(t, points);
    });

    print(
        "AREOKONTROLO: " +
        points.length + " punktoj, " +
        allTriangles.length + " trianguloj entute, " +
        triangles.length + " uzataj, " +
        (allTriangles.length - triangles.length) +
        " ekskluditaj pro tro longaj flankoj."
    );

    if (!triangles.length) {
        fail(
            "Ne eblas formi sufiche subtenatan " +
            "interpolacian areon."
        );

        return;
    }

    // Extrema nur aus dem verwendeten Flächennetz bestimmen.
    var used = {};

    triangles.forEach(function (t) {
        used[t[0]] = true;
        used[t[1]] = true;
        used[t[2]] = true;
    });

    var supportedPoints = Object.keys(used).map(
        function (key) {
            return points[Number(key)];
        }
    );

    supportedPoints.sort(function (a, b) {
        if (a.pressure !== b.pressure) {
            return a.pressure - b.pressure;
        }

        return a.requestIndex - b.requestIndex;
    });

    var low = supportedPoints[0];

    var high =
        supportedPoints[supportedPoints.length - 1];

    var markedLow = null;
    var markedHigh = null;

    // Bei nahezu gleichmäßigem Druck keine Extrema erzwingen.
    if (high.pressure - low.pressure >= 1) {
        addLabel(
            "M*\n" + Math.round(low.pressure),
            project(low.lon, low.lat)
        );

        addLabel(
            "A*\n" + Math.round(high.pressure),
            project(high.lon, high.lat)
        );

        markedLow = low;
        markedHigh = high;
    }

    if (script.showPointValues) {
        points.forEach(function (p) {
            if (p === markedLow || p === markedHigh) {
                return;
            }

            addLabel(
                String(Math.round(p.pressure)),
                project(p.lon, p.lat)
            );
        });
    }

    var allSegments = [];

    var first =
        Math.ceil(
            low.pressure / CFG.isobarInterval
        ) * CFG.isobarInterval;

    for (
        var level = first;
        level < high.pressure;
        level += CFG.isobarInterval
    ) {
        if (level <= low.pressure) {
            continue;
        }

        var segments = contourSegments(
            points,
            triangles,
            level
        );

        allSegments = allSegments.concat(
            segments
        );
    }

    print(
        "KALKULO: " +
        triangles.length + " trianguloj, " +
        allSegments.length + " izobaraj segmentoj."
    );

    // Keine technische Diagnoseumrandung.
    buildLineMesh(allSegments);

    var oldest = Math.min.apply(
        null,
        points.map(function (p) {
            return p.time;
        })
    );

    var spanMinutes = Math.round(
        (newest - oldest) / 60000
    );

    var partial =
        !!stopReason ||
        failures > 0 ||
        points.length < LOCATIONS.length;

    var waitMinutes = partial
        ? CFG.partialCooldownMinutes
        : CFG.successCooldownMinutes;

    var totalSeconds =
        (Date.now() - tappedAt) / 1000;

    var loadingSeconds =
        (loadingFinishedAt - tappedAt) / 1000;

    phase = "ready";

    nextAllowedTime =
        Date.now() + waitMinutes * 60000;

    var status =
        "Europo: aerpremo · AccuWeather\n" +

        points.length + "/" + LOCATIONS.length +
        " valoroj · izobaroj je 4 hPa\n" +

        "Shargotempo: " +
        formatNumber(totalSeconds, 1) + " s\n" +

        "Diferenco inter datumtempoj: " +
        spanMinutes + " min\n" +

        "Nordo supre · premo en hPa\n" +

        "A*/M*: maksimumo/minimumo en la uzata punktaro\n" +

        "Premredukto al marnivelo supozata\n";

    if (stopReason) {
        status += stopReason + "\n";
    }

    if (!allSegments.length) {
        status +=
            "Neniu desegnebla izobaro je la 4-hPa-pashoj.\n";
    }

    status +=
        "Post " + waitMinutes +
        " min, tushu por resharghi.";

    show(status);

    print(
        "DESEGNO: " +
        triangles.length + " trianguloj, " +
        allSegments.length + " izobaraj segmentoj."
    );

    print(
        "TEMPOMEZURADO: " +
        "datumshargado " +
        formatNumber(loadingSeconds, 1) + " s; " +

        "de tusho ghis fino " +
        formatNumber(totalSeconds, 1) + " s; " +

        "maksimume " + CFG.concurrency +
        " samtempaj petoj."
    );
//    addMapCheckLabels();
}


/* =========================================================
 * FEHLERBEHANDLUNG
 * ========================================================= */

function fail(message, technicalError) {
    generation++;
    phase = "failed";

    updateEvent.enabled = false;
    drawEvent.cancel();

    if (script.isobarVisual) {
        script.isobarVisual.enabled = false;
    }

    clearLabels();

    nextAllowedTime =
        Date.now() +
        CFG.partialCooldownMinutes * 60000;

    print("ERARO: " + message);

    // Externe Fehlermeldungen nicht unverändert auf den Bildschirm
    // übernehmen; für technische Diagnose im Logger erhalten.
    if (technicalError) {
        print(
            "Originala teknika eraro: " +
            String(technicalError)
        );
    }

    show(
        message +
        "\n\nReprovu post " +
        CFG.partialCooldownMinutes +
        " min."
    );
}

/*
 * Nur für die Konturgeometrie:
 * Exakte Treffer auf ein Isobarenniveau vermeiden.
 *
 * Derselbe Stützpunkt erhält in ALLEN Dreiecken
 * und bei ALLEN Konturberechnungen denselben Hilfswert.
 */
function contourPressure(point) {
    var interval = CFG.isobarInterval;
    var nearestLevel =
        Math.round(point.pressure / interval) * interval;

    var equalityTolerance = 1e-7;
    var offsetHpa = 0.01;

    if (
        Math.abs(point.pressure - nearestLevel) <
        equalityTolerance
    ) {
        return nearestLevel + offsetHpa;
    }

    return point.pressure;
}

function addMapCheckLabels() {
    var checks = [
        { name: "Reykjavik", lat: 64.15, lon: -21.94 },
        { name: "Lisboa",    lat: 38.72, lon: -9.14 },
        { name: "London",    lat: 51.51, lon: -0.13 },
        { name: "Roma",      lat: 41.90, lon: 12.50 },
        { name: "Helsinki",  lat: 60.17, lon: 24.94 },
        { name: "Istanbul", lat: 41.01, lon: 28.98 }
    ];

    checks.forEach(function (p) {
        addLabel(
            "+",
            project(p.lon, p.lat)
        );
    });
}