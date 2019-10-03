define([
    'jquery',
    'd3',
    'Formulae_',
    'Layers_',
    'Globe_',
    'Map_',
    'Viewer_',
    'UserInterface_',
    'CursorInfo',
    'leafletDraw',
    'turf',
    'leafletPolylineDecorator',
    'leafletSnap',
    'colorPicker',
    'shp',
    'shpwrite',
], function(
    $,
    d3,
    F_,
    L_,
    Globe_,
    Map_,
    Viewer_,
    UserInterface_,
    CursorInfo,
    leafletDraw,
    turf,
    leafletPolylineDecorator,
    leafletSnap,
    colorPicker,
    shp,
    shpwrite
) {
    var DrawTool = null
    var Drawing = {
        init: function(tool) {
            DrawTool = tool
            DrawTool.drawing = drawing
            DrawTool.drawOver = Drawing.drawOver
            DrawTool.drawThrough = Drawing.drawThrough
            DrawTool.drawUnder = Drawing.drawUnder
            DrawTool.drawOverThroughUnder = Drawing.drawOverThroughUnder
            DrawTool.endDrawing = Drawing.endDrawing
            DrawTool.setDrawingType = Drawing.setDrawingType
            DrawTool.switchDrawingType = Drawing.switchDrawingType
            DrawTool.setDrawing = Drawing.setDrawing
            DrawTool.addArrowToMap = Drawing.addArrowToMap
        },
        drawOver: function(d, clip, callback) {
            var file_id =
                d.file_id == undefined ? DrawTool.currentFileId : d.file_id
            var lk = 'DrawTool_' + file_id

            DrawTool.addDrawing(
                {
                    file_id: file_id,
                    intent: d.intent,
                    properties: JSON.stringify(d.shape.properties),
                    geometry: JSON.stringify(d.shape.geometry),
                    clip: clip,
                },
                (function(shape) {
                    return function(data) {
                        DrawTool.refreshFile(DrawTool.currentFileId, null, true)

                        if (d.end && d.begin) {
                            d.end()
                            d.begin()
                        }

                        if (typeof callback === 'function') callback()
                    }
                })(JSON.parse(JSON.stringify(d.shape))),
                function() {
                    if (d.end && d.begin) {
                        d.end()
                        d.begin()
                    }
                }
            )
        },
        drawThrough: function(d) {
            //Drawn the regular shape
            //DrawTool.drawOver(d)

            //Then modify the ones it overlapped
            var bb = turf.bbox(d.shape)

            var lg = L_.layersGroup['DrawTool_' + DrawTool.currentFileId]

            throughLoop(0)
            function throughLoop(i) {
                if (i >= lg.length) {
                    //Draw the regular shape
                    setTimeout(
                        (function(d) {
                            return function() {
                                DrawTool.drawOver(d)
                            }
                        })(d),
                        2
                    )
                } else {
                    let features = lg[i] ? lg[i].toGeoJSON().features : null
                    if (features != null) {
                        let geojson = features[0]
                        if (
                            F_.doBoundingBoxesIntersect(bb, turf.bbox(geojson))
                        ) {
                            let newGeometry
                            let noChange = false
                            try {
                                newGeometry = turf.difference(geojson, d.shape)
                                    .geometry
                                if (
                                    JSON.stringify(newGeometry) ==
                                    JSON.stringify(geojson)
                                )
                                    noChange = true
                            } catch (error) {
                                CursorInfo.update(
                                    'ERROR: Topology.',
                                    2500,
                                    true,
                                    {
                                        x: 268,
                                        y: 6,
                                    }
                                )
                                if (d.end && d.begin) {
                                    d.end()
                                    d.begin()
                                }
                                return
                            }

                            if (!noChange) {
                                var feature =
                                    lg[i]._layers[Object.keys(lg[i]._layers)[0]]
                                        .feature
                                feature.geometry = newGeometry

                                if (DrawTool.vars.demtilesets) {
                                    F_.lnglatsToDemtileElevs(
                                        feature.geometry,
                                        DrawTool.vars.demtilesets,
                                        function(data) {
                                            feature.geometry = data
                                            drawEdit(feature)
                                            //geoJSON = F_.geojsonAddSpatialProperties(geoJSON)
                                        }
                                    )
                                } else {
                                    drawEdit(feature)
                                }
                            } else {
                                throughLoop(i + 1)
                            }

                            function drawEdit(feature) {
                                calls.api(
                                    'draw_edit',
                                    {
                                        feature_id: feature.properties._.id,
                                        file_id: DrawTool.currentFileId,
                                        geometry: JSON.stringify(
                                            feature.geometry
                                        ),
                                    },
                                    (function(feature, i) {
                                        return function(result) {
                                            feature.properties._.id =
                                                result.body.id
                                            Map_.rmNotNull(lg[i])
                                            lg[i] = L.geoJson(
                                                {
                                                    type: 'FeatureCollection',
                                                    features: [feature],
                                                },
                                                {
                                                    style: function(feature) {
                                                        return feature
                                                            .properties.style
                                                    },
                                                }
                                            ).addTo(Map_.map)

                                            //Reorder the layers
                                            for (let j = i; j >= 0; j--) {
                                                if (lg[j] != null)
                                                    lg[j].bringToBack()
                                            }

                                            //Make sure the last drawn stays on top
                                            lg[i].bringToFront()
                                            setTimeout(
                                                (function(i) {
                                                    return function() {
                                                        throughLoop(i + 1)
                                                    }
                                                })(i),
                                                2
                                            )
                                        }
                                    })(feature, i),
                                    function() {
                                        throughLoop(i + 1)
                                        CursorInfo.update(
                                            'Failed to cut through some shapes.',
                                            6000,
                                            true,
                                            { x: 268, y: 6 }
                                        )
                                    }
                                )
                            }
                        } else {
                            throughLoop(i + 1)
                        }
                    } else {
                        throughLoop(i + 1)
                    }
                }
            }
        },
        drawUnder: function(d) {
            //Modify shape based on intersecting features
            var bb = turf.bbox(d.shape)
            var lg = L_.layersGroup['DrawTool_' + DrawTool.currentFileId]

            for (var i = 0; i < lg.length; i++) {
                if (lg[i] == null) continue
                let geojson =
                    lg[i].feature ||
                    lg[i]._layers[Object.keys(lg[i]._layers)[0]].feature
                if (F_.doBoundingBoxesIntersect(bb, turf.bbox(geojson))) {
                    let newGeometry
                    try {
                        newGeometry = turf.difference(d.shape, geojson).geometry
                        if (
                            JSON.stringify(newGeometry) !=
                            JSON.stringify(d.shape)
                        ) {
                            d.shape.geometry = newGeometry
                        }
                    } catch (error) {
                        CursorInfo.update('ERROR: Topology.', 2500, true, {
                            x: 268,
                            y: 6,
                        })
                        if (d.end && d.begin) {
                            d.end()
                            d.begin()
                        }
                        return
                    }
                }
            }

            // Draw the shape
            DrawTool.drawOver(d)
        },
        drawOverThroughUnder: function(d) {
            var tier = $('#drawToolDrawSettingsTier > div.active').attr('value')
            DrawTool.drawOver(d, tier)
            /*
            if (tier == 'over') {
                DrawTool.drawThrough(d)
            } else if (tier == 'under') {
                DrawTool.drawUnder(d)
            } else if (tier == 'off') {
                DrawTool.drawOver(d)
            }
            */
        },
        endDrawing: function() {
            DrawTool.drawing.polygon.end()
            DrawTool.drawing.line.end()
            DrawTool.drawing.point.end()
            DrawTool.drawing.annotation.end()
            DrawTool.drawing.arrow.end()
        },
        setDrawingType: function(type) {
            switch (type) {
                case 'polygon':
                    DrawTool.drawing.polygon.begin(type)
                    break
                case 'line':
                    DrawTool.drawing.line.begin(type)
                    break
                case 'point':
                    DrawTool.drawing.point.begin(type)
                    break
                case 'text':
                    DrawTool.drawing.annotation.begin(type)
                    break
                case 'arrow':
                    DrawTool.drawing.arrow.begin(type)
                    break
            }
        },
        switchDrawingType: function(type) {
            $('#drawToolDrawingTypeDiv > div').removeClass('active')
            $('#drawToolDrawingTypeDiv > div').css('border-radius', 0)
            var elm = $('.drawToolDrawingType' + type)
            elm.addClass('active')
            elm.prev().css({
                'border-top-right-radius': '10px',
                'border-bottom-right-radius': '10px',
            })
            elm.next().css({
                'border-top-left-radius': '10px',
                'border-bottom-left-radius': '10px',
            })

            DrawTool.setDrawingType($(this).attr('draw'))
        },
        setDrawing: function(onlyIntentChanged) {
            if (onlyIntentChanged) DrawTool.currentFileId = null
            switch (DrawTool.intentType) {
                case 'roi':
                    DrawTool.switchDrawingType('Polygon')
                    DrawTool.drawing.polygon.begin('roi')
                    break
                case 'campaign':
                    DrawTool.switchDrawingType('Polygon')
                    DrawTool.drawing.polygon.begin('campaign')
                    break
                case 'campsite':
                    DrawTool.switchDrawingType('Polygon')
                    DrawTool.drawing.polygon.begin('campsite')
                    break
                case 'signpost':
                    DrawTool.switchDrawingType('Point')
                    DrawTool.drawing.point.begin('signpost')
                    break
                case 'trail':
                    DrawTool.switchDrawingType('Line')
                    DrawTool.drawing.line.begin('trail')
                    break
                case 'note':
                    DrawTool.switchDrawingType('Text')
                    DrawTool.drawing.annotation.begin('note')
                    break
                case 'all':
                    DrawTool.switchDrawingType('Polygon')
                    DrawTool.drawing.polygon.begin('polygon')
                    break
            }

            if (DrawTool.intentType != null) {
                var color = DrawTool.categoryStyles[DrawTool.intentType].color
                $('#drawToolDrawIntentFilterDiv').css('background', color)
                $('#drawToolDrawFilterDiv2').css(
                    'border-left',
                    '7px solid ' + color
                )
                $('#drawToolDrawingTypeDiv > div').css(
                    'background',
                    'var(--color-a)'
                )
                $('#drawToolDrawingTypeDiv div.active').css('background', color)
                $('#drawToolDrawingTypeDiv').css('background', color)
                $('#drawToolDrawingInIndicator').css('background', color)
                $('#drawToolDrawingInIndicator').css(
                    'color',
                    DrawTool.intentType != 'campaign' &&
                        DrawTool.intentType != 'campsite' &&
                        DrawTool.intentType != 'trail'
                        ? '#ededed'
                        : '#222'
                )
                $('#drawToolDrawingInIndicator').text(
                    'Drawing ' + DrawTool.prettyIntent(DrawTool.intentType)
                )
            }
            $('#drawToolDrawFeaturesNewName').attr(
                'placeholder',
                DrawTool.intentType
            )
        },
        addArrowToMap: function(layerId, start, end, style, feature, index) {
            var line

            var length
            if (isNaN(style.length)) length = false
            else length = parseInt(style.length)

            line = new L.Polyline([end, start], {
                color: style.color,
                weight: style.width + style.weight,
            })
            var arrowBodyOutline
            if (length === false) {
                arrowBodyOutline = new L.Polyline([start, end], {
                    color: style.color,
                    weight: style.width + style.weight,
                    dashArray: style.dashArray,
                    lineCap: style.lineCap,
                    lineJoin: style.lineJoin,
                })
            } else {
                arrowBodyOutline = L.polylineDecorator(line, {
                    patterns: [
                        {
                            offset: length / 2 + 'px',
                            repeat: 0,
                            symbol: L.Symbol.dash({
                                pixelSize: style.length,
                                polygon: false,
                                pathOptions: {
                                    stroke: true,
                                    color: style.color,
                                    weight: style.width + style.weight,
                                    dashArray: style.dashArray,
                                    lineCap: style.lineCap,
                                    lineJoin: style.lineJoin,
                                },
                            }),
                        },
                    ],
                })
            }
            line = new L.Polyline([start, end], {
                color: style.color,
                weight: style.width + style.weight,
            })
            var arrowHeadOutline = L.polylineDecorator(line, {
                patterns: [
                    {
                        offset: '100%',
                        repeat: 0,
                        symbol: L.Symbol.arrowHead({
                            pixelSize: style.radius,
                            polygon: false,
                            pathOptions: {
                                stroke: true,
                                color: style.color,
                                weight: style.width + style.weight,
                                lineCap: style.lineCap,
                                lineJoin: style.lineJoin,
                            },
                        }),
                    },
                ],
            })
            line = new L.Polyline([end, start], {
                color: style.fillColor,
                weight: style.width,
            })
            var arrowBody
            if (length === false) {
                arrowBody = new L.Polyline([start, end], {
                    color: style.fillColor,
                    weight: style.width,
                    dashArray: style.dashArray,
                    lineCap: style.lineCap,
                    lineJoin: style.lineJoin,
                })
            } else {
                arrowBody = L.polylineDecorator(line, {
                    patterns: [
                        {
                            offset: length / 2 + 'px',
                            repeat: 0,
                            symbol: L.Symbol.dash({
                                pixelSize: style.length,
                                polygon: false,
                                pathOptions: {
                                    stroke: true,
                                    color: style.fillColor,
                                    weight: style.width,
                                    dashArray: style.dashArray,
                                    lineCap: style.lineCap,
                                    lineJoin: style.lineJoin,
                                },
                            }),
                        },
                    ],
                })
            }
            line = new L.Polyline([start, end], {
                color: style.fillColor,
                weight: style.width,
            })
            var arrowHead = L.polylineDecorator(line, {
                patterns: [
                    {
                        offset: '100%',
                        repeat: 0,
                        symbol: L.Symbol.arrowHead({
                            pixelSize: style.radius,
                            polygon: false,
                            pathOptions: {
                                stroke: true,
                                color: style.fillColor,
                                weight: style.width,
                                lineCap: style.lineCap,
                                lineJoin: style.lineJoin,
                            },
                        }),
                    },
                ],
            })

            if (index != null) {
                Map_.rmNotNull(L_.layersGroup[layerId][index])
                L_.layersGroup[layerId][index] = L.layerGroup([
                    arrowBodyOutline,
                    arrowHeadOutline,
                    arrowBody,
                    arrowHead,
                ]).addTo(Map_.map)
                L_.layersGroup[layerId][index].start = start
                L_.layersGroup[layerId][index].end = end
                L_.layersGroup[layerId][index].feature = feature
                DrawTool.populateShapes()
            } else {
                L_.layersGroup[layerId].push(
                    L.layerGroup([
                        arrowBodyOutline,
                        arrowHeadOutline,
                        arrowBody,
                        arrowHead,
                    ]).addTo(Map_.map)
                )
                L_.layersGroup[layerId][
                    L_.layersGroup[layerId].length - 1
                ].start = start
                L_.layersGroup[layerId][
                    L_.layersGroup[layerId].length - 1
                ].end = end
                L_.layersGroup[layerId][
                    L_.layersGroup[layerId].length - 1
                ].feature = feature
            }
        },
    }

    var drawing = {
        polygon: {
            begin: function(intent) {
                var d = drawing.polygon

                //Overwrite Leaflet.Draw esc key to restart drawing
                L.Draw.Feature.prototype._cancelDrawing = function(e) {
                    if (e.keyCode === 27) {
                        d.end()
                        d.begin()
                    }
                }

                //Clear any other drawing events
                drawing.line.end()
                drawing.point.end()
                drawing.annotation.end()
                drawing.arrow.end()

                d.end()
                d.movemode = false
                d.shiftDisabled = false
                d.lastVertex = null

                if (intent != undefined) {
                    d.intent = intent
                    d.style = DrawTool.categoryStyles[intent]
                }

                d.drawing = new L.Draw.Polygon(Map_.map, {
                    showArea: true,
                    allowIntersection: false,
                    guidelineDistance: 15,
                    icon: new L.DivIcon({
                        iconSize: new L.Point(10, 10),
                        className: 'leaflet-div-icon leaflet-editing-icon',
                    }),
                    shapeOptions: d.style,
                })
                d.drawing.enable()

                d.shape = d.drawing

                Map_.map.on('click', d.start)
                Map_.map.on('draw:drawstop', d.stop)
                $('body').on('keydown', d.keydown)
                $('body').on('keyup', d.keyup)
            },
            end: function() {
                var d = drawing.polygon

                d.stopclick = false

                Map_.map.off('click', d.start)
                Map_.map.off('mousemove', d.move)
                Map_.map.off('draw:drawstop', d.stop)
                $('body').off('keydown', d.keydown)
                $('body').off('keyup', d.keyup)

                if (typeof d.drawing.disable === 'function') d.drawing.disable()
            },
            start: function(e) {
                var d = drawing.polygon

                if (!d.stopclick) {
                    d.stopclick = true
                    Map_.map.on('mousemove', d.move)
                }

                //Store this at start to avoid mixed modes
                if (
                    $('#drawToolDrawSettingsMode > div.active').attr('value') ==
                    'on'
                ) {
                    d.movemode = true
                    Map_.map.on('click', d.complete)
                }

                d.lastVertex = e.latlng
            },
            complete: function() {
                var d = drawing.polygon

                d.drawing.completeShape()
                Map_.map.off('click', d.complete)
            },
            keydown: function(e) {
                var d = drawing.polygon
                //Ctrl-Z
                if (mmgisglobal.ctrlDown && e.which == '90')
                    d.drawing.deleteLastVertex()
                //Ctrl and no drawing
                else if (
                    mmgisglobal.ctrlDown &&
                    (!d.drawing._markers || d.drawing._markers.length === 0)
                ) {
                    d.shiftDisabled = true
                    if (typeof d.drawing.disable === 'function')
                        d.drawing.disable()
                }
            },
            keyup: function(e) {
                var d = drawing.polygon
                if (
                    !d.drawing._enabled &&
                    (e.which == '17' ||
                        e.which == '91' ||
                        e.which == '93' ||
                        e.which == '224')
                ) {
                    d.shiftDisabled = false
                    d.drawing.enable()
                }
            },
            move: function(e) {
                var d = drawing.polygon

                if (e && d.movemode) {
                    let res = parseInt(
                        $('#drawToolDrawSettingsModeVertexRes').val(),
                        d.lastVertex
                    )
                    d.currentrate++
                    let dist = F_.lngLatDistBetween(
                        d.lastVertex.lng,
                        d.lastVertex.lat,
                        e.latlng.lng,
                        e.latlng.lat
                    )

                    if (dist > res) {
                        let pt = F_.getPtSomeDistBetween2OtherPts(
                            d.lastVertex.lng,
                            d.lastVertex.lat,
                            e.latlng.lng,
                            e.latlng.lat,
                            res / dist
                        )
                        pt = { lng: pt.x, lat: pt.y }
                        try {
                            d.drawing.addVertex(pt)
                            d.lastVertex = pt
                        } catch (e) {}
                        d.currentrate = 0
                    }
                }

                d.shape = d.drawing._poly
            },
            stop: function() {
                var d = drawing.polygon
                if (d.shiftDisabled) return

                d.shape = d.shape.toGeoJSON()

                d.shape.geometry.type = 'Polygon'
                d.shape.geometry.coordinates.push(
                    d.shape.geometry.coordinates[0]
                )
                d.shape.geometry.coordinates = [d.shape.geometry.coordinates]
                d.shape.properties.style = d.style
                var n = $('#drawToolDrawFeaturesNewName')
                d.shape.properties.name =
                    n.val() || n.attr('placeholder') || 'Polygon'

                DrawTool.drawOverThroughUnder(d)
            },
            stopclick: false,
            intent: null,
            movemode: false,
            rate: 8,
            currentrate: 0,
            lastVertex: null,
            shiftDisabled: false,
            style: {},
            drawing: {},
            shape: {},
        },
        line: {
            begin: function(intent) {
                var d = drawing.line

                //Overwrite Leaflet.Draw esc key to restart drawing
                L.Draw.Feature.prototype._cancelDrawing = function(e) {
                    if (e.keyCode === 27) {
                        d.end()
                        d.begin()
                    }
                }

                //Clear any other drawing events
                drawing.polygon.end()
                drawing.point.end()
                drawing.annotation.end()
                drawing.arrow.end()

                d.end()

                d.movemode = false
                d.shiftDisabled = false
                d.lastVertex = null

                if (intent != undefined) {
                    d.intent = intent
                    d.style = DrawTool.categoryStyles[intent]
                }

                d.drawing = new L.Draw.Polyline(Map_.map, {
                    icon: new L.DivIcon({
                        iconSize: new L.Point(10, 10),
                        className: 'leaflet-div-icon leaflet-editing-icon',
                    }),
                    shapeOptions: d.style,
                })
                d.drawing.enable()

                d.shape = d.drawing

                Map_.map.on('click', d.start)
                Map_.map.on('draw:drawstop', d.stop)
                $('body').on('keydown', d.keydown)
                $('body').on('keyup', d.keyup)
            },
            end: function() {
                var d = drawing.line

                d.stopclick = false

                Map_.map.off('click', d.start)
                Map_.map.off('mousemove', d.move)
                Map_.map.off('draw:drawstop', d.stop)
                $('body').off('keydown', d.keydown)
                $('body').off('keyup', d.keyup)
                if (typeof d.drawing.disable === 'function') d.drawing.disable()
            },
            start: function(e) {
                var d = drawing.line

                if (!d.stopclick) {
                    d.stopclick = true
                    Map_.map.on('mousemove', d.move)
                }

                //Store this at start to avoid mixed modes
                if (
                    $('#drawToolDrawSettingsMode > div.active').attr('value') ==
                    'on'
                ) {
                    d.movemode = true
                    //Map_.map.on('click', d.complete)
                }

                d.lastVertex = e.latlng
            },
            complete: function() {
                var d = drawing.line

                d.drawing.completeShape()
                Map_.map.off('click', d.complete)
            },
            keydown: function(e) {
                var d = drawing.line
                //Ctrl-Z
                if (mmgisglobal.ctrlDown && e.which == '90')
                    d.drawing.deleteLastVertex()
                //Ctrl and no drawing
                else if (
                    mmgisglobal.ctrlDown &&
                    (!d.drawing._markers || d.drawing._markers.length === 0)
                ) {
                    d.shiftDisabled = true
                    if (typeof d.drawing.disable === 'function')
                        d.drawing.disable()
                }
            },
            keyup: function(e) {
                var d = drawing.line
                if (
                    !d.drawing._enabled &&
                    (e.which == '17' ||
                        e.which == '91' ||
                        e.which == '93' ||
                        e.which == '224')
                ) {
                    d.shiftDisabled = false
                    d.drawing.enable()
                }
            },
            move: function(e) {
                var d = drawing.line

                if (e && d.movemode) {
                    let res = parseInt(
                        $('#drawToolDrawSettingsModeVertexRes').val(),
                        d.lastVertex
                    )
                    d.currentrate++
                    let dist = F_.lngLatDistBetween(
                        d.lastVertex.lng,
                        d.lastVertex.lat,
                        e.latlng.lng,
                        e.latlng.lat
                    )

                    if (dist > res) {
                        let pt = F_.getPtSomeDistBetween2OtherPts(
                            d.lastVertex.lng,
                            d.lastVertex.lat,
                            e.latlng.lng,
                            e.latlng.lat,
                            res / dist
                        )
                        pt = { lng: pt.x, lat: pt.y }
                        try {
                            d.drawing.addVertex(pt)
                            d.lastVertex = pt
                        } catch (e) {}
                        d.currentrate = 0
                    }
                }

                d.shape = d.drawing._poly
            },
            stop: function() {
                var d = drawing.line

                if (d.shiftDisabled) return

                d.shape = d.shape.toGeoJSON()
                d.shape.geometry.type = 'LineString'
                d.shape.properties.style = d.style
                var n = $('#drawToolDrawFeaturesNewName')
                d.shape.properties.name =
                    n.val() || n.attr('placeholder') || 'Line'

                DrawTool.addDrawing(
                    {
                        file_id: DrawTool.currentFileId,
                        intent: d.intent,
                        properties: JSON.stringify(d.shape.properties),
                        geometry: JSON.stringify(d.shape.geometry),
                    },
                    (function(shape) {
                        return function(data) {
                            var lk = 'DrawTool_' + DrawTool.currentFileId

                            L_.layersGroup[lk].push(
                                L.geoJson(
                                    {
                                        type: 'FeatureCollection',
                                        features: [shape],
                                    },
                                    {
                                        style: function(feature) {
                                            return feature.properties.style
                                        },
                                    }
                                ).addTo(Map_.map)
                            )

                            var l =
                                L_.layersGroup[lk][
                                    L_.layersGroup[lk].length - 1
                                ]
                            l.properties = shape.properties
                            l.properties._ = l.properties._ || {}
                            l.properties._.id = data.id
                            l.properties._.intent = data.intent

                            d.end()
                            d.begin()

                            //Add to Globe_
                            var last = L_.layersGroup[lk].length - 1
                            var llast = L_.layersGroup[lk][last]
                            var layer

                            if (llast.hasOwnProperty('_layers'))
                                layer =
                                    llast._layers[Object.keys(llast._layers)[0]]
                            else {
                                layer = Object.assign({}, llast)
                                layer.feature.geometry.coordinates = [
                                    layer.feature.geometry.coordinates[1],
                                    layer.feature.geometry.coordinates[0],
                                ]
                            }

                            Globe_.addVectorTileLayer({
                                id: 'camptool_' + lk + '_' + last,
                                on: true,
                                layers: [layer],
                            })

                            DrawTool.populateShapes()
                        }
                    })(JSON.parse(JSON.stringify(d.shape))),
                    function() {
                        if (d.end && d.begin) {
                            d.end()
                            d.begin()
                        }
                    }
                )
            },
            stopclick: false,
            intent: null,
            movemode: false,
            shiftDisabled: false,
            rate: 8,
            currentrate: 0,
            lastVertex: null,
            style: {},
            drawing: {},
            shape: {},
        },
        point: {
            begin: function(intent) {
                var d = drawing.point

                //Overwrite Leaflet.Draw esc key to restart drawing
                L.Draw.Feature.prototype._cancelDrawing = function(e) {
                    if (e.keyCode === 27) {
                        d.end()
                        d.begin()
                    }
                }

                //Clear any other drawing events
                drawing.polygon.end()
                drawing.line.end()
                drawing.annotation.end()
                drawing.arrow.end()
                shiftDisabled = false

                d.end()

                if (intent != undefined) {
                    d.intent = intent
                    d.style = DrawTool.categoryStyles[intent]
                }

                d.drawing = new L.Draw.CircleMarker(Map_.map, {
                    shapeOptions: d.style,
                })
                d.drawing.enable()

                d.shape = d.drawing

                Map_.map.on('mousemove', d.move)
                Map_.map.on('draw:drawstop', d.stop)
                $('body').on('keydown', d.keydown)
                $('body').on('keyup', d.keyup)
            },
            end: function() {
                var d = drawing.point

                d.stopclick = false

                Map_.map.off('mousemove', d.move)
                Map_.map.off('draw:drawstop', d.stop)
                $('body').off('keydown', d.keydown)
                $('body').off('keyup', d.keyup)
                if (typeof d.drawing.disable === 'function') d.drawing.disable()
            },
            start: function() {},
            keydown: function(e) {
                var d = drawing.polygon

                if (
                    e.which == '17' ||
                    e.which == '91' ||
                    e.which == '93' ||
                    e.which == '224'
                ) {
                    d.shiftDisabled = true
                    if (typeof d.drawing.disable === 'function')
                        d.drawing.disable()
                }
            },
            keyup: function(e) {
                var d = drawing.polygon

                if (
                    e.which == '17' ||
                    e.which == '91' ||
                    e.which == '93' ||
                    e.which == '224'
                ) {
                    d.shiftDisabled = false
                    d.drawing.enable()
                }
            },
            move: function(e) {
                var d = drawing.point
                d.shape = e.latlng
            },
            stop: function() {
                var d = drawing.point
                if (d.shiftDisabled) return

                var coords = [d.shape.lng, d.shape.lat]

                d.shape = {
                    type: 'Feature',
                    properties: {},
                    geometry: {},
                }
                d.shape.geometry.type = 'Point'
                d.shape.geometry.coordinates = coords
                d.shape.properties.style = d.style
                var n = $('#drawToolDrawFeaturesNewName')
                d.shape.properties.name =
                    n.val() || n.attr('placeholder') || 'Point'

                DrawTool.addDrawing(
                    {
                        file_id: DrawTool.currentFileId,
                        intent: d.intent,
                        properties: JSON.stringify(d.shape.properties),
                        geometry: JSON.stringify(d.shape.geometry),
                    },
                    (function(shape) {
                        return function(data) {
                            var lk = 'DrawTool_' + DrawTool.currentFileId

                            coords = [coords[1], coords[0]]

                            L_.layersGroup[lk].push(
                                L.circleMarker(coords, d.style).addTo(Map_.map)
                            )
                            L_.layersGroup[lk][
                                L_.layersGroup[lk].length - 1
                            ].feature = shape

                            var l =
                                L_.layersGroup[lk][
                                    L_.layersGroup[lk].length - 1
                                ]

                            l.properties = shape.properties
                            l.properties._ = l.properties._ || {}
                            l.properties._.id = data.id
                            l.properties._.intent = data.intent

                            d.end()
                            d.begin()

                            //Add to Globe_
                            var last = L_.layersGroup[lk].length - 1
                            var llast = L_.layersGroup[lk][last]
                            var layer

                            if (llast.hasOwnProperty('_layers'))
                                layer =
                                    llast._layers[Object.keys(llast._layers)[0]]
                            else {
                                layer = Object.assign({}, llast)
                                layer.feature.geometry.coordinates = [
                                    layer.feature.geometry.coordinates[1],
                                    layer.feature.geometry.coordinates[0],
                                ]
                            }

                            Globe_.addVectorTileLayer({
                                id: 'camptool_' + lk + '_' + last,
                                on: true,
                                layers: [layer],
                            })

                            DrawTool.populateShapes()
                        }
                    })(JSON.parse(JSON.stringify(d.shape))),
                    function() {
                        if (d.end && d.begin) {
                            d.end()
                            d.begin()
                        }
                    }
                )
            },
            stopclick: false,
            shiftDisabled: false,
            intent: null,
            style: {},
            drawing: {},
            shape: {},
        },
        annotation: {
            begin: function(intent) {
                var d = drawing.annotation

                //Overwrite Leaflet.Draw esc key to restart drawing
                L.Draw.Feature.prototype._cancelDrawing = function(e) {
                    if (e.keyCode === 27) {
                        d.end()
                        d.begin()
                    }
                }

                //Clear any other drawing events
                drawing.polygon.end()
                drawing.line.end()
                drawing.point.end()
                drawing.arrow.end()
                shiftDisabled = false

                d.end()

                if (intent != undefined) {
                    d.intent = intent
                    d.style = DrawTool.categoryStyles[intent]
                }

                d.drawing = new L.Draw.Marker(Map_.map, {
                    icon: DrawTool.noteIcon,
                })

                d.drawing.enable()

                d.shape = d.drawing

                Map_.map.on('mousemove', d.move)
                Map_.map.on('draw:drawstop', d.stop)
                $('body').on('keydown', d.keydown)
                $('body').on('keyup', d.keyup)
            },
            end: function() {
                var d = drawing.annotation

                d.stopclick = false

                Map_.map.off('mousemove', d.move)
                Map_.map.off('draw:drawstop', d.stop)
                if (typeof d.drawing.disable === 'function') d.drawing.disable()
            },
            start: function() {},
            keydown: function(e) {
                var d = drawing.annotation
                if (
                    e.which == '17' ||
                    e.which == '91' ||
                    e.which == '93' ||
                    e.which == '224'
                ) {
                    d.shiftDisabled = true
                    if (typeof d.drawing.disable === 'function')
                        d.drawing.disable()
                } else if (e.which == '27') {
                    //ESC
                    Map_.rmNotNull(DrawTool.activeAnnotation)
                    d.begin()
                }
            },
            keyup: function(e) {
                var d = drawing.annotation

                if (
                    e.which == '17' ||
                    e.which == '91' ||
                    e.which == '93' ||
                    e.which == '224'
                ) {
                    d.shiftDisabled = false
                    d.drawing.enable()
                }
            },
            move: function(e) {
                var d = drawing.annotation
                d.shape = e.latlng
            },
            stop: function() {
                var d = drawing.annotation
                if (d.shiftDisabled) return

                var coords = [d.shape.lat, d.shape.lng]

                var inputId = 'DrawTool_ActiveAnnotation'
                Map_.rmNotNull(DrawTool.activeAnnotation)
                DrawTool.activeAnnotation = L.popup({
                    className: 'leaflet-popup-annotation',
                    closeButton: false,
                    autoClose: false,
                    closeOnEscapeKey: false,
                    closeOnClick: false,
                    autoPan: false,
                    offset: new L.point(0, 0),
                })
                    .setLatLng(coords)
                    .setContent(
                        "<div class='drawToolAnnotationWrapper'>" +
                            "<div><i id='" +
                            inputId +
                            "_Close' class='mdi mdi-close mdi-18px'></i></div>" +
                            "<input id='" +
                            inputId +
                            "' class='drawToolPreannotation' placeholder='Leave a note...'></input>" +
                            "<div><i id='" +
                            inputId +
                            "_Save' class='mdi mdi-content-save mdi-18px'></i></div>" +
                            '</div>'
                    )
                    .addTo(Map_.map)

                setTimeout(function() {
                    document.getElementById(inputId).focus()
                }, 50)

                d.end()
                $('#' + inputId + '_Close').on('click', function() {
                    Map_.rmNotNull(DrawTool.activeAnnotation)
                    d.begin()
                })
                $('#' + inputId + '_Save').on('click', d.save)

                //Save on enter
                $('#' + inputId).keypress(function(e) {
                    if (
                        (e.which && e.which == 13) ||
                        (e.keyCode && e.keyCode == 13)
                    ) {
                        //enter
                        $('#' + inputId).blur()
                        $('#' + inputId + '_Save').click()
                        return false
                    } else return true
                })
            },
            save: function() {
                var d = drawing.annotation
                if (d.shiftDisabled) return

                $('body').off('keydown', d.keydown)
                $('body').off('keyup', d.keyup)

                var coords = [d.shape.lng, d.shape.lat]
                d.shape = {
                    type: 'Feature',
                    properties: {},
                    geometry: {},
                }
                d.shape.geometry.type = 'Point'
                d.shape.geometry.coordinates = coords
                d.shape.properties.style = d.style
                d.shape.properties.annotation = true
                var n = $('#drawToolDrawFeaturesNewName')
                var inputId = 'DrawTool_ActiveAnnotation'
                d.shape.properties.name = $('#' + inputId).val() || ''

                DrawTool.addDrawing(
                    {
                        file_id: DrawTool.currentFileId,
                        intent: d.intent,
                        properties: JSON.stringify(d.shape.properties),
                        geometry: JSON.stringify(d.shape.geometry),
                    },
                    (function(shape) {
                        return function(data) {
                            Map_.rmNotNull(DrawTool.activeAnnotation)
                            var popup = L.popup({
                                className: 'leaflet-popup-annotation',
                                closeButton: false,
                                autoClose: false,
                                closeOnEscapeKey: false,
                                closeOnClick: false,
                                autoPan: false,
                                offset: new L.point(0, 3),
                            })
                                .setLatLng([coords[1], coords[0]])
                                .setContent(
                                    '<div>' +
                                        "<div id='DrawToolAnnotation_" +
                                        DrawTool.currentFileId +
                                        '_' +
                                        data.id +
                                        "' class='drawToolAnnotation DrawToolAnnotation_" +
                                        DrawTool.currentFileId +
                                        "  blackTextBorder' layer='" +
                                        DrawTool.currentFileId +
                                        "' index='" +
                                        L_.layersGroup[
                                            'DrawTool_' + DrawTool.currentFileId
                                        ].length +
                                        "'></div>" +
                                        '</div>'
                                )
                                .addTo(Map_.map)

                            $(
                                '#DrawToolAnnotation_' +
                                    DrawTool.currentFileId +
                                    '_' +
                                    data.id
                            ).text(shape.properties.name)

                            L_.layersGroup[
                                'DrawTool_' + DrawTool.currentFileId
                            ].push(popup)

                            $('.drawToolAnnotation').off('mouseover')
                            $('.drawToolAnnotation').on(
                                'mouseover',
                                function() {
                                    var layer =
                                        'DrawTool_' + $(this).attr('layer')
                                    var index = $(this).attr('index')
                                    $('.drawToolShapeLi').removeClass('hovered')
                                    $(
                                        '.drawToolShapeLi .drawToolShapeLiItem'
                                    ).mouseleave()
                                    $(
                                        '#drawToolShapeLiItem_' +
                                            layer +
                                            '_' +
                                            index
                                    ).addClass('hovered')
                                    $(
                                        '#drawToolShapeLiItem_' +
                                            layer +
                                            '_' +
                                            index +
                                            ' .drawToolShapeLiItem'
                                    ).mouseenter()
                                }
                            )
                            $('.drawToolAnnotation').off('mouseout')
                            $('.drawToolAnnotation').on('mouseout', function() {
                                $('.drawToolShapeLi').removeClass('hovered')
                                $(
                                    '.drawToolShapeLi .drawToolShapeLiItem'
                                ).mouseleave()
                            })
                            $('.drawToolAnnotation').off('click')
                            $('.drawToolAnnotation').on('click', function() {
                                var layer = 'DrawTool_' + $(this).attr('layer')
                                var index = $(this).attr('index')
                                var shape = L_.layersGroup[layer][index]
                                if (!mmgisglobal.shiftDown) {
                                    if (typeof shape.getBounds === 'function')
                                        Map_.map.fitBounds(shape.getBounds())
                                    else Map_.map.panTo(shape._latlng)
                                }

                                shape.fireEvent('click')
                            })

                            var l =
                                L_.layersGroup[
                                    'DrawTool_' + DrawTool.currentFileId
                                ][
                                    L_.layersGroup[
                                        'DrawTool_' + DrawTool.currentFileId
                                    ].length - 1
                                ]

                            l.feature = shape
                            l.properties = shape.properties
                            l.properties._ = l.properties._ || {}
                            l.properties._.file_id = DrawTool.currentFileId
                            l.properties._.id = data.id
                            l.properties._.intent = data.intent

                            d.begin()

                            DrawTool.populateShapes()
                        }
                    })(JSON.parse(JSON.stringify(d.shape))),
                    function() {
                        Map_.rmNotNull(DrawTool.activeAnnotation)
                        if (d.begin) {
                            d.begin()
                        }
                    }
                )
            },
            stopclick: false,
            shiftDisabled: false,
            intent: null,
            style: {},
            drawing: {},
            shape: {},
        },
        arrow: {
            begin: function(intent) {
                var d = drawing.arrow

                //Overwrite Leaflet.Draw esc key to restart drawing
                L.Draw.Feature.prototype._cancelDrawing = function(e) {
                    if (e.keyCode === 27) {
                        d.end()
                        d.begin()
                    }
                }

                //Clear any other drawing events
                drawing.polygon.end()
                drawing.line.end()
                drawing.point.end()
                drawing.annotation.end()
                shiftDisabled = false

                d.end()

                if (intent != undefined) {
                    d.intent = intent
                    d.style = DrawTool.categoryStyles[intent]
                }

                Map_.map.on('click', d.start)
                $('body').on('keydown', d.keydown)
                $('body').on('keyup', d.keyup)
            },
            end: function() {
                var d = drawing.arrow

                d.stopclick = false

                Map_.map.off('click', d.start)
                Map_.map.off('mousemove', d.move)
                Map_.map.off('click', d.stop)
                $('body').off('keydown', d.keydown)
                $('body').off('keyup', d.keyup)
            },
            start: function(e) {
                var d = drawing.arrow

                d.startPt = e.latlng

                for (var i = 0; i < d.arrowHeads.length; i++)
                    Map_.rmNotNull(d.arrowHeads[i])
                d.arrowHeads = []

                d.drawing = new L.Polyline([d.startPt, d.startPt], {
                    color: 'red',
                })

                d.shape = d.drawing

                Map_.map.off('click', d.start)
                Map_.map.on('mousemove', d.move)
                Map_.map.on('click', d.stop)
            },
            keydown: function(e) {
                var d = drawing.arrow

                if (
                    e.which == '17' ||
                    e.which == '91' ||
                    e.which == '93' ||
                    e.which == '224'
                ) {
                    d.shiftDisabled = true
                    if (typeof d.drawing.disable === 'function')
                        d.drawing.disable()
                }
            },
            keyup: function(e) {
                var d = drawing.arrow

                if (
                    e.which == '17' ||
                    e.which == '91' ||
                    e.which == '93' ||
                    e.which == '224'
                ) {
                    d.shiftDisabled = false
                    d.drawing.enable()
                }
            },
            move: function(e) {
                var d = drawing.arrow

                Map_.rmNotNull(d.drawing)

                var line = new L.Polyline([d.startPt, e.latlng])
                d.arrowHeads.push(
                    L.polylineDecorator(line, {
                        patterns: [
                            {
                                offset: '100%',
                                repeat: 0,
                                symbol: L.Symbol.arrowHead({
                                    pixelSize: d.style.radius,
                                    polygon: false,
                                    pathOptions: { stroke: false },
                                }),
                            },
                        ],
                    }).addTo(Map_.map)
                )
                var arrowPts = DrawTool.getInnerLayers(
                    d.arrowHeads[d.arrowHeads.length - 1],
                    3
                )._latlngs

                d.drawing = new L.Polyline(
                    [d.startPt, e.latlng, arrowPts[0], e.latlng, arrowPts[2]],
                    {
                        color: d.style.fillColor,
                        weight: d.style.width,
                        className: 'noPointerEventsImportant',
                    }
                ).addTo(Map_.map)

                clearTimeout(d.arrowTimeout)
                d.arrowTimeout = setTimeout(function() {
                    for (var i = 0; i < d.arrowHeads.length; i++)
                        Map_.rmNotNull(d.arrowHeads[i])
                }, 100)
            },
            stop: function(e) {
                var d = drawing.arrow
                if (d.shiftDisabled) return

                d.shape = new L.Polyline([d.startPt, e.latlng]).toGeoJSON()

                d.shape.properties.style = d.style
                d.shape.properties.name = 'Arrow'
                d.shape.properties.arrow = true

                Map_.rmNotNull(d.drawing)

                DrawTool.addDrawing(
                    {
                        file_id: DrawTool.currentFileId,
                        intent: d.intent,
                        properties: JSON.stringify(d.shape.properties),
                        geometry: JSON.stringify(d.shape.geometry),
                    },
                    (function(shape, start, end) {
                        return function(data) {
                            var lk = 'DrawTool_' + DrawTool.currentFileId

                            var style = shape.properties.style

                            DrawTool.addArrowToMap(lk, start, end, style, shape)

                            var l =
                                L_.layersGroup[lk][
                                    L_.layersGroup[lk].length - 1
                                ]
                            l.properties = shape.properties
                            l.properties._ = l.properties._ || {}
                            l.properties._.id = data.id
                            l.properties._.intent = data.intent

                            d.end()
                            d.begin()

                            //Add to Globe_
                            /*
              var last = L_.layersGroup[ lk ].length - 1;
              var llast = L_.layersGroup[ lk ][last];
              var layer;
    
              if( llast.hasOwnProperty( '_layers' ) )
                layer = llast._layers[ Object.keys(llast._layers)[0] ];
              else {
                layer = Object.assign( {}, llast );
                layer.feature.geometry.coordinates = [ layer.feature.geometry.coordinates[1], layer.feature.geometry.coordinates[0] ];
              }
    
              Globe_.addVectorTileLayer( { id: 'camptool_' + lk + '_' + last,
                on: true,
                layers: [layer] } );
              */

                            //DrawTool.populateShapes();
                        }
                    })(
                        JSON.parse(JSON.stringify(d.shape)),
                        d.startPt,
                        e.latlng
                    ),
                    function() {
                        if (d.end && d.begin) {
                            d.end()
                            d.begin()
                        }
                    }
                )

                d.end()
            },
            save: function() {
                var d = drawing.arrow
                if (d.shiftDisabled) return

                var coords = [d.shape.lat, d.shape.lng]
                d.shape = {
                    type: 'Feature',
                    properties: {},
                    geometry: {},
                }
                d.shape.geometry.type = 'Point'
                d.shape.geometry.coordinates = coords
                d.shape.properties.style = d.style
                d.shape.properties.annotation = true
                var n = $('#drawToolDrawFeaturesNewName')
                var inputId = 'DrawTool_ActiveAnnotation'
                d.shape.properties.name = $('#' + inputId).val() || ''

                DrawTool.addDrawing(
                    {
                        file_id: DrawTool.currentFileId,
                        intent: d.intent,
                        properties: JSON.stringify(d.shape.properties),
                        geometry: JSON.stringify(d.shape.geometry),
                    },
                    (function(shape) {
                        return function(data) {
                            Map_.rmNotNull(DrawTool.activeAnnotation)
                            var popup = L.popup({
                                className: 'leaflet-popup-annotation',
                                closeButton: false,
                                autoClose: false,
                                closeOnEscapeKey: false,
                                closeOnClick: false,
                                autoPan: false,
                                offset: new L.point(0, 3),
                            })
                                .setLatLng(coords)
                                .setContent(
                                    '<div>' +
                                        "<div id='DrawToolAnnotation_" +
                                        DrawTool.currentFileId +
                                        '_' +
                                        data.id +
                                        "' class='drawToolAnnotation DrawToolAnnotation_" +
                                        DrawTool.currentFileId +
                                        "  blackTextBorder' layer='" +
                                        DrawTool.currentFileId +
                                        "' index='" +
                                        L_.layersGroup[
                                            'DrawTool_' + DrawTool.currentFileId
                                        ].length +
                                        "'></div>" +
                                        '</div>'
                                )
                                .addTo(Map_.map)

                            $(
                                '#DrawToolAnnotation_' +
                                    DrawTool.currentFileId +
                                    '_' +
                                    data.id
                            ).text(shape.properties.name)

                            L_.layersGroup[
                                'DrawTool_' + DrawTool.currentFileId
                            ].push(popup)

                            $('.drawToolAnnotation').off('mouseover')
                            $('.drawToolAnnotation').on(
                                'mouseover',
                                function() {
                                    var layer =
                                        'DrawTool_' + $(this).attr('layer')
                                    var index = $(this).attr('index')
                                    $('.drawToolShapeLi').removeClass('hovered')
                                    $(
                                        '.drawToolShapeLi .drawToolShapeLiItem'
                                    ).mouseleave()
                                    $(
                                        '#drawToolShapeLiItem_' +
                                            layer +
                                            '_' +
                                            index
                                    ).addClass('hovered')
                                    $(
                                        '#drawToolShapeLiItem_' +
                                            layer +
                                            '_' +
                                            index +
                                            ' .drawToolShapeLiItem'
                                    ).mouseenter()
                                }
                            )
                            $('.drawToolAnnotation').off('mouseout')
                            $('.drawToolAnnotation').on('mouseout', function() {
                                $('.drawToolShapeLi').removeClass('hovered')
                                $(
                                    '.drawToolShapeLi .drawToolShapeLiItem'
                                ).mouseleave()
                            })
                            $('.drawToolAnnotation').off('click')
                            $('.drawToolAnnotation').on('click', function() {
                                var layer = 'DrawTool_' + $(this).attr('layer')
                                var index = $(this).attr('index')
                                var shape = L_.layersGroup[layer][index]
                                if (!mmgisglobal.shiftDown) {
                                    if (typeof shape.getBounds === 'function')
                                        Map_.map.fitBounds(shape.getBounds())
                                    else Map_.map.panTo(shape._latlng)
                                }

                                shape.fireEvent('click')
                            })

                            var l =
                                L_.layersGroup[
                                    'DrawTool_' + DrawTool.currentFileId
                                ][
                                    L_.layersGroup[
                                        'DrawTool_' + DrawTool.currentFileId
                                    ].length - 1
                                ]

                            l.feature = shape
                            l.properties = shape.properties
                            l.properties._ = l.properties._ || {}
                            l.properties._.id = data.id
                            l.properties._.intent = data.intent

                            d.begin()

                            DrawTool.populateShapes()
                        }
                    })(JSON.parse(JSON.stringify(d.shape))),
                    function() {
                        Map_.rmNotNull(DrawTool.activeAnnotation)
                        if (d.begin) {
                            d.begin()
                        }
                    }
                )
            },
            startPt: null,
            stopclick: false,
            shiftDisabled: false,
            intent: null,
            style: {},
            drawing: {},
            drawingOld: {},
            shape: {},
            arrowTimeout: null,
            arrowHeads: [],
        },
    }

    return Drawing
})
