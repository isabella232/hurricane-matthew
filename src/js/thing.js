// NPM modules
var d3 = require('d3');
var geo = require('d3-geo-projection');
// console.log(d3.geo);
// console.log(geo);
var topojson = require('topojson');
var _ = require('lodash');

// Local modules
var features = require('./detectFeatures')();
var fm = require('./fm');
var utils = require('./utils');
var geomath = require('./geomath');

// Globals
var MOBILE_BREAKPOINT = 600;                // Screen width at which to enable mobile-specific logic
var ASPECT_RATIO = 16 / 9;                   // Aspect ratio of map (width / height)
var PROJECTION = geo.geoCylindricalEqualArea;     // Map projection to use
var SCALE_FACTOR = 0.5;                     // "Zoom level" (in projection-dependent units)
var DOT_RADIUS = 0.002;                    // The radius of points on the map (in projection-dependent units)

// Nudge labels off their base coords by some degress latitude and longitude
var LABEL_NUDGES = {
    'cities': {
        'default': [0.15, -0.02],
        'Raleigh': [0.15, -0.5]
    },
    'countries': {
    },
    'points': {
        'default': [0.15, -0.01]
    }
}

// Global vars
var isMobile = false;
var identityProjection = null;
var bbox = null;
var topoData = {};


/**
 * Initialize the graphic.
 *
 * Fetch data, format data, cache HTML references, etc.
 */
function init() {
    // Used for computing centroids in coordinate space
    identityProjection = d3.geo.path()
        .projection({stream: function(d) { return d; }})

	d3.json('data/geodata.json', function(error, data) {
        bbox = data['bbox']

        // Extract topojson features
        for (var key in data['objects']) {
            topoData[key] = topojson.feature(data, data['objects'][key]);
        }

        render();
        $(window).resize(utils.throttle(onResize, 250));

    });
}

/**
 * Invoke on resize. By default simply rerenders the graphic.
 */
function onResize() {
	render();
}

/**
 * Figure out the current frame size and render the graphic.
 */
function render() {
	var containerWidth = $('#interactive-content').width();

    if (!containerWidth) {
        containerWidth = DEFAULT_WIDTH;
    }

    if (containerWidth <= MOBILE_BREAKPOINT) {
        isMobile = true;
    } else {
        isMobile = false;
    }

    // Render the chart!
    renderLocatorMap({
        container: '#graphic',
        width: containerWidth,
        data: topoData
    });

    // Resize
    // fm.resize();
}

var renderLocatorMap = function(config) {
    /*
     * Setup
     */
    // Calculate actual map dimensions
    var mapWidth = config['width'];
    var mapHeight = Math.ceil(config['width'] / ASPECT_RATIO);

    // Clear existing graphic (for redraw)
    var containerElement = d3.select(config['container']);
    containerElement.html('');

    /*
     * Create the map projection.
     */
    // var centroid = [((bbox[0] + bbox[2]) / 2), ((bbox[1] + bbox[3]) / 2)];
    var centroid = [-64, 28.5];
    var mapScale = mapWidth * SCALE_FACTOR;

    var projection = PROJECTION()
        .center(centroid)
        .scale(mapScale)
        .translate([mapWidth / 2, mapHeight / 2]);

    var path = d3.geo.path()
        .projection(projection)
        .pointRadius(DOT_RADIUS * mapScale);

    /*
     * Create the root SVG element.
     */
    var chartWrapper = containerElement.append('div')
        .attr('class', 'graphic-wrapper');

    var chartElement = chartWrapper.append('svg')
        .attr('width', mapWidth)
        .attr('height', mapHeight);

    /*
     * Render paths.
     */
    var pathsElement = chartElement.append('g')
        .attr('class', 'paths');

    function classifyFeature(d) {
        var c = [];

        if (d['id']) {
            c.push(utils.classify(d['id']));
        }

        _.each(d['properties'], function(v, k) {
            c.push(utils.classify(k + '-' + v));
        });

        return c.join(' ');
    }

    function renderPaths(group) {
        pathsElement.append('g')
            .attr('class', group)
            .selectAll('path')
                .data(config['data'][group]['features'])
            .enter().append('path')
                .attr('d', path)
                .attr('class', classifyFeature);
    }

    // Countries
    renderPaths('countries');

    // States
    renderPaths('states');

    // Cities
    if (!isMobile) {
        renderPaths('cities');
    }

    // Tracks
    renderPaths('tracks')

    // Matthew
    renderPaths('matthew')

    if (!isMobile) {
        d3.selectAll('.tracks path,.matthew path')
            .attr("stroke-dashoffset", 0);
    }

    /*
     * Render labels.
     */
    var labelsElement = chartElement.append('g')
        .attr('class', 'labels');

    function renderLabels(group) {
        labelsElement.append('g')
            .attr('class', group)
            .selectAll('text')
                .data(config['data'][group]['features'])
            .enter().append('text')
                .attr('class', classifyFeature)
                .attr('transform', function(d) {
                    var point = null;

                    if (d['geometry']['type'] == 'Point') {
                        // Note: copy by value to prevent insanity
                        point = d['geometry']['coordinates'].slice();
                    } else {
                        point = identityProjection.centroid(d);
                    }

                    var nudge = LABEL_NUDGES[group][d['id']];

                    if (nudge === undefined) {
                        nudge = LABEL_NUDGES[group]['default'];
                    }

                    if (nudge !== undefined) {
                        point[0] += nudge[0];
                        point[1] += nudge[1];
                    }

                    return 'translate(' + projection(point) + ')';
                })
                .text(function(d) {
                    return d['id']
                });
    }

    // Countries
    renderLabels('countries');

    // Cities
    if (!isMobile) {
        renderLabels('cities');
    }

    var waterLabels = labelsElement.append('g')
        .attr('class', 'water')

    waterLabels.append('text')
        .attr('class', 'atlantic-ocean')
        .attr('transform', 'translate(' + projection([-54, 26]) + ')')
        .text('Atlantic Ocean');

    waterLabels.append('text')
        .attr('class', 'pacific-ocean')
        .attr('transform', 'translate(' + projection([-130, 15]) + ')')
        .text('Pacific Ocean');

    labelsElement.append('text')
        .attr('class', 'matthew')
        .attr('transform', 'translate(' + projection([-60, 16]) + ')')
        .text('Hurricane Matthew');

    labelsElement.append('text')
        .attr('class', 'previous')
        .attr('transform', 'translate(' + projection([-64, 33]) + ')')
        .text('Category 5 Hurricanes since 1965');

    /*
     * Render a scale bar.
     */
    var scaleBarDistance = 1000;
    var scaleBarStart = [10, mapHeight - 35];
    var scaleBarEnd = geomath.calculateScaleBarEndPoint(projection, scaleBarStart, scaleBarDistance);

    chartElement.append('g')
        .attr('class', 'scale-bar')
        .append('line')
        .attr('x1', scaleBarStart[0])
        .attr('y1', scaleBarStart[1])
        .attr('x2', scaleBarEnd[0])
        .attr('y2', scaleBarEnd[1]);

    d3.select('.scale-bar')
        .append('text')
        .attr('x', scaleBarEnd[0] + 5)
        .attr('y', scaleBarEnd[1])
        .text(scaleBarDistance + ' miles');

    /*
     * Reposition footer.
     */
    d3.selectAll('.footer')
        .style('top', (mapHeight - 25) + 'px')

    fm.resize();

    // Animate paths on desktop only
    if (!isMobile) {
        d3.selectAll('.tracks path,.matthew path').each(function(d) {
            var path = d3.select(this);
            var totalLength = path.node().getTotalLength();

            path.attr("stroke-dasharray", totalLength + " " + totalLength)
                .attr("stroke-dashoffset", totalLength)
                .transition()
                // Sampled at 6 hour intervals
                .duration(totalLength * (1 / mapScale) * 1200)
                .ease("linear")
                .attr("stroke-dashoffset", 0);
        })
    }
}

// Bind on-load handler
$(document).ready(function() {
	init();
});
