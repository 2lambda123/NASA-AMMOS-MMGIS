// Part of the LayersTool that deals with filtering

import $ from 'jquery'
import F_ from '../../../Basics/Formulae_/Formulae_'
import L_ from '../../../Basics/Layers_/Layers_'

import LocalFilterer from './LocalFilterer'
import ESFilterer from './ESFilterer'

import Dropy from '../../../../external/Dropy/dropy'

import './Filtering.css'

const filters = {
    Waypoints: {
        spatial: {
            feature: {},
            operator: 'intersects | contains',
        },
        property: [
            {
                type: 'string | number',
                key: '',
                operator: '<, =, >, []',
                value: '',
            },
        ],
    },
}

const Filtering = {
    filters: {},
    current: {},
    make: function (container, layerName) {
        const layerObj = L_.layersNamed[layerName]

        if (layerObj == null) return

        Filtering.filters[layerName] = Filtering.filters[layerName] || {
            spatial: {},
            values: [],
            geojson: L_.layersGroup[layerName].toGeoJSON(),
        }
        Filtering.current = {
            layerName: layerName,
            layerObj: layerObj,
            type: layerObj.type,
        }

        if (Filtering.current.type === 'vector') {
            Filtering.filters[layerName].aggs = LocalFilterer.getAggregations(
                Filtering.filters[layerName].geojson
            )
        } else if (Filtering.current.type === 'query') {
        }

        // prettier-ignore
        const markup = [
            "<div id='layersTool_filtering'>",
                "<div id='layersTool_filtering_header'>",
                    "<div id='layersTool_filtering_title'>Filter</div>",
                    "<div id='layersTool_filtering_adds'>",
                        "<div id='layersTool_filtering_add_value' class='mmgisButton5'><i class='mdi mdi-plus mdi-18px'></i></div>",
                    "</div>",
                "</div>",
                "<div id='layerTool_filtering_filters'>",
                    "<ul id='layerTool_filtering_filters_spatial'>",
                    "</ul>",
                    "<ul id='layerTool_filtering_filters_list'></ul>",
                "</div>",
                "<div id='layersTool_filtering_footer'>",
                    "<div id='layersTool_filtering_clear' class='mmgisButton5'><div>Clear</div></i></div>",
                    "<div id='layersTool_filtering_submit' class='mmgisButton5'><div>Submit</div><i class='mdi mdi-arrow-right mdi-18px'></i></div>",
                "</div>",
            "</div>",
        ].join('\n')

        container.append(markup)

        Filtering.filters[layerName].values.forEach((v) => {
            Filtering.addValue(layerName, v)
        })

        // Add Spatial
        $('#layersTool_filtering_add_spatial').on('click', function () {
            const spatialMarkup = [].join('\n')
        })

        // Add Value
        $('#layersTool_filtering_add_value').on('click', function () {
            Filtering.addValue(layerName)
        })
    },
    destroy: function (layerName) {
        $('#layersTool_filtering').remove()
    },
    addValue: function (layerName, value) {
        let id, key, op, val
        if (value) {
            id = value.id
            key = ` value='${value.key}'`
            op = value.op
            val = ` value='${value.value}'`
        } else id = Filtering.filters[layerName].values.length

        // prettier-ignore
        const valueMarkup = [
            `<div class='layersTool_filtering_value' id='layersTool_filtering_value_${layerName}_${id}'>`,
                "<div class='layersTool_filtering_value_key'>",
                    `<input id='layersTool_filtering_value_key_input_${layerName}_${id}' class='layersTool_filtering_value_key_input' spellcheck='false' type='text'${key} placeholder='Property...'></input>`,
                "</div>",
                "<div class='layersTool_filtering_value_operator'>",
                    `<div id='layersTool_filtering_value_operator_${layerName}_${id}' class='layersTool_filtering_value_operator_select'></div>`,
                "</div>",
                "<div class='layersTool_filtering_value_value'>",
                    `<input id='layersTool_filtering_value_value_input_${layerName}_${id}' class='layersTool_filtering_value_value_input' spellcheck='false' type='text'${val} placeholder='Value...'></input>`,
                "</div>",
            "</div>",
        ].join('\n')

        $('#layerTool_filtering_filters_list').append(valueMarkup)

        if (value == null) {
            Filtering.filters[layerName].values.push({
                id: id,
                type: null,
                key: null,
                op: '=',
                value: null,
            })
        }

        Filtering.attachEvents(id, layerName, { op: op })
    },
    attachEvents: function (id, layerName, options) {
        Filtering.attachValueEvents(id, layerName, options)

        // Submit
        $(`#layersTool_filtering_submit`).on('click', () => {
            console.log(Filtering.filters)
            if (Filtering.current.type === 'vector') {
                LocalFilterer.filter(Filtering.filters[layerName], layerName)
            } else if (Filtering.current.type === 'query') {
            }
        })

        // Clear
        $(`#layersTool_filtering_clear`).on('click', () => {
            Filtering.filters[layerName].values = Filtering.filters[
                layerName
            ].values.filter((v) => {
                $(`#layersTool_filtering_value_${layerName}_${v.id}`).remove()
                return false
            })
        })
    },
    attachValueEvents: function (id, layerName, options) {
        options = options || {}

        let elmId

        // Property Autocomplete
        elmId = `#layersTool_filtering_value_key_input_${layerName}_${id}`

        let arrayToSearch = Object.keys(Filtering.filters[layerName].aggs)
        arrayToSearch = arrayToSearch.sort((a, b) => b.localeCompare(a))

        $(elmId).autocomplete({
            lookup: arrayToSearch,
            lookupLimit: 100,
            minChars: 0,
            transformResult: function (response, originalQuery) {
                let resultSuggestions = []
                $.map(response, function (jsonItem) {
                    if (typeof jsonItem != 'string') {
                        $.map(jsonItem, function (suggestionItem) {
                            resultSuggestions.push(suggestionItem)
                        })
                    }
                })
                resultSuggestions.sort(function (a, b) {
                    const aStart = String(a.value).match(
                            new RegExp(originalQuery, 'i')
                        ) || { index: -1 },
                        bStart = String(b.value).match(
                            new RegExp(originalQuery, 'i')
                        ) || { index: -1 }
                    if (aStart.index != bStart.index)
                        return aStart.index - bStart.index
                    else return a > b ? 1 : -1
                })
                response.suggestions = resultSuggestions
                return response
            },
            onSelect: function (event) {
                const property = Filtering.filters[layerName].aggs[event.value]
                Filtering.filters[layerName].values[id].type = property.type
                Filtering.filters[layerName].values[id].key = event.value
                Filtering.updateValuesAutoComplete(id, layerName)
            },
        })

        // Operator Dropdown
        elmId = `#layersTool_filtering_value_operator_${layerName}_${id}`

        const ops = ['=', '<', '>']
        const opId = Math.max(ops.indexOf(options.op), 0)
        $(elmId).html(
            Dropy.construct(
                [
                    `<i class='mdi mdi-equal mdi-18px'></i>`,
                    `<i class='mdi mdi-less-than mdi-18px'></i>`,
                    `<i class='mdi mdi-greater-than mdi-18px'></i>`,
                ],
                'op',
                opId
            )
        )
        Dropy.init($(elmId), function (idx) {
            Filtering.filters[layerName].values[id].op = ops[idx]
        })

        // Value AutoComplete
        Filtering.updateValuesAutoComplete(id, layerName)
    },
    updateValuesAutoComplete: function (id, layerName) {
        let elmId = `#layersTool_filtering_value_value_input_${layerName}_${id}`
        let arrayToSearch = []
        if (
            Filtering.filters[layerName].values[id].key &&
            Filtering.filters[layerName].aggs[
                Filtering.filters[layerName].values[id].key
            ]
        )
            arrayToSearch = Object.keys(
                Filtering.filters[layerName].aggs[
                    Filtering.filters[layerName].values[id].key
                ].aggs || {}
            )
        $(elmId).autocomplete({
            lookup: arrayToSearch,
            lookupLimit: 100,
            minChars: 0,
            transformResult: function (response, originalQuery) {
                let resultSuggestions = []
                $.map(response, function (jsonItem) {
                    if (typeof jsonItem != 'string') {
                        $.map(jsonItem, function (suggestionItem) {
                            resultSuggestions.push(suggestionItem)
                        })
                    }
                })
                resultSuggestions.sort(function (a, b) {
                    const aStart = String(a.value).match(
                            new RegExp(originalQuery, 'i')
                        ) || { index: -1 },
                        bStart = String(b.value).match(
                            new RegExp(originalQuery, 'i')
                        ) || { index: -1 }
                    if (aStart.index != bStart.index)
                        return aStart.index - bStart.index
                    else return a > b ? 1 : -1
                })
                response.suggestions = resultSuggestions
                return response
            },
            onSelect: function (event) {
                Filtering.filters[layerName].values[id].value = event.value
            },
        })
        $(elmId).on('keyup', function (e) {
            Filtering.filters[layerName].values[id].value = $(this).val()
        })

        $('.autocomplete-suggestions').css({
            'max-height': '300px',
            'overflow-y': 'auto',
            'overflow-x': 'hidden',
            'border-top': 'none',
            'background-color': 'var(--color-a)',
        })
    },
}

export default Filtering
