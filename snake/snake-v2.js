SNAKE = (function() {
  /*
  TODO:
  Web workers.
  Add head.
  Scales?
  */
  // if we are a worker, init scripts
  if (typeof importScripts !== 'undefined') initWorker();

  var M = manifold;

  var PREPARE_FOR_PRINTING = false;
  var CYLINDER_QUALITY = PREPARE_FOR_PRINTING ? 112 : 20;

  var LENGTH = 540;
  var RADIUS1 = 10;
  var RADIUS2 = 10.25;
  var RADIUS3 = 10;
  var SIDE_RADIUS1 = 10;
  var SIDE_RADIUS2 = 11;
  var SIDE_RADIUS3 = 10;
  var DEPTH = .8 * RADIUS3;
  var MIDDLE = .4 * LENGTH;
  var TAPER = .87 * LENGTH;
  var CENTER_HEIGHT = 2.5;
  var LENGTH_CTRL_POINTS = [.333,.333,.333,.333,.333,.1];

  var RIGHT_BOTTOM_SPLINE = lengthSpline(LENGTH_CTRL_POINTS)([
    [0,RADIUS1 * Math.acos(DEPTH/RADIUS1),-DEPTH],
    [MIDDLE,RADIUS2 * Math.acos(DEPTH/RADIUS2),-DEPTH],
    [TAPER,RADIUS3 * Math.acos(DEPTH/RADIUS3),-DEPTH],
    [LENGTH, .01*SIDE_RADIUS3, -DEPTH]
  ]);

  var RIGHT_LOWER_SPLINE = lengthSpline(LENGTH_CTRL_POINTS)([ [0,SIDE_RADIUS1,0], [MIDDLE, SIDE_RADIUS2, 0],
                                  [TAPER, SIDE_RADIUS3, -DEPTH/2], [LENGTH, .01*SIDE_RADIUS3, -DEPTH] ]);

  var TOP_SPLINE = lengthSpline(LENGTH_CTRL_POINTS)([ [0,0,RADIUS1], [MIDDLE, 0, RADIUS2], [TAPER, 0, RADIUS3/2], [LENGTH, 0, -.99*DEPTH] ]);
  var BOTTOM_SPLINE = lengthSpline(LENGTH_CTRL_POINTS)([ [0,0,-DEPTH], [MIDDLE, 0, -DEPTH], [TAPER, 0, -DEPTH], [LENGTH, 0, -DEPTH] ]);

  var OUTER_SPLINES = [BOTTOM_SPLINE, RIGHT_BOTTOM_SPLINE.transform(mirrorXZ), RIGHT_LOWER_SPLINE.transform(mirrorXZ),
                     TOP_SPLINE, RIGHT_LOWER_SPLINE, RIGHT_BOTTOM_SPLINE ];

  var NCENTERS = 28;
  var CENTERS = range(NCENTERS).map(function(x) { return lerp(20, LENGTH-30, x/(NCENTERS-1)); })
  var RADIUS = 12;
  var RADIUS_EPSILON = .2;
  var SOCKET_EPSILON = .4;
  var SOCKET_SPLINE_ARC = Math.PI / 6;

  var CONNECTOR_DEPTH = .1;
  var CONNECTOR_WIDTH = 3;

  var TOP_CONNECTOR_SPLINE = M.Path([-1,0,.9]).line([0,0,.45+CONNECTOR_DEPTH]);
  var RIGHT_CONNECTOR_SPLINE = M.Path([-1,CONNECTOR_WIDTH,.45]).line([0,CONNECTOR_WIDTH,.5]);
  var BOTTOM_CONNECTOR_SPLINE = M.Path([-1,0,0]).line([0,0,.45-CONNECTOR_DEPTH]);

  var CONNECTOR_SPLINES = [BOTTOM_CONNECTOR_SPLINE, RIGHT_CONNECTOR_SPLINE.transform(mirrorXZ), TOP_CONNECTOR_SPLINE, RIGHT_CONNECTOR_SPLINE];

  var ARC_FRACTION = .2;
  var MAX_ARC = .52;

  function render() {
    a3d.cad.init();
    addGeometry();
    a3d.cad.render();
  }

  function addGeometry() {
    var threeGeometry = M.ThreeJSRenderer();
    var geometry = threeGeometry.geometry;
    var renderer = threeGeometry.renderer;

    var mergedGeometry = geometry;

    var mesh = addWireframe(mergedGeometry, '#ffffff', 'snake');

    var segments = CENTERS.length;
    CENTERS.slice(0,segments).forEach(function( center, i ) {
      var startCenter = i ? CENTERS[i-1] : 0;

      var segment = renderSegment( startCenter, center );
      var csgGeometry = THREE.CSG.fromCSG(segment);
      mergeSegment( geometry, csgGeometry, startCenter, i );
    })

    // add tail
    var segment = renderSegment( CENTERS[CENTERS.length-1], 0);
    var csgGeometry = THREE.CSG.fromCSG(segment);
    mergeSegment( geometry, csgGeometry, CENTERS[CENTERS.length-1], CENTERS.length );

    mesh.position.z = DEPTH;
    translateGeometry(geometry, -CENTERS[CENTERS.length-1], 0, 0);

    // add mesh
    mergedGeometry.computeBoundingSphere();
  }

  function renderAsync() {
    var mergedGeometry = new THREE.Geometry();
    var mesh;

    a3d.cad.init();
    var workers = [1,2,3,4,5,6,7,8].map(function() { return new Worker('snake-v2.js') });
    var scheduler = Scheduler(workers);
    CENTERS.forEach(function(center, i) {
      var startCenter = i ? CENTERS[i-1] : 0;
      scheduler.scheduleJob({start:startCenter, end:center, i:i}, resultHandler(startCenter, i));
    })
    scheduler.scheduleJob({start:CENTERS[CENTERS.length-1], end:0, i:CENTERS.length},
      resultHandler(CENTERS[CENTERS.length-1], CENTERS.length, true));
    a3d.cad.render();

    function resultHandler(center, i, done) {
      return function merge(polygons) {
        var sectionGeometry = THREE.CSG.fromCSGPolygons(polygons);
        mergeSegment( mergedGeometry, sectionGeometry, center, i );
        if (done) {
          mesh = addWireframe(mergedGeometry, '#ffffff', 'snake');
          mesh.position.z = DEPTH;
          mesh.position.x = -center;
          a3d.cad.render();
        }
      }
    }
  }

  ////////////////////////////////////////
  // WORKERS
  ////////////////////////////////////////

  function Scheduler(workers) {
    var queuedJobs = []
      , available = workers.slice(0)
      , jobID=0
      , nextResult=0
      , results = {};

    function scheduleJob(message, cb) {
      queuedJobs.push({message:message, cb:cb});
      reschedule();
    }

    function reschedule() {
      while (queuedJobs.length && available.length) {
        var worker = available.pop();
        var job = queuedJobs.splice(0,1)[0];
        worker.postMessage( job.message );
        worker.onmessage = respondWithID( jobID++, job.cb, worker );
      }
    }

    function respondWithID( id, cb, worker ) {
      return function(result) {
        results[id] = {data:result.data, cb:cb};
        respond();
        available.push(worker);
        reschedule();
      }
    }

    function respond() {
      while ( results[nextResult] ) {
        results[nextResult].cb( results[nextResult].data, nextResult );
        delete results[nextResult++];
      }
    }

    return {scheduleJob: scheduleJob};
  }

  function initWorker() {
    importScripts('../csg.js');
    importScripts('manifold.js');

    onmessage = function(message) {
      postMessage(renderSegment(message.data.start, message.data.end).toPolygons())
    }
  }

  //////////////////////////////
  // RENDERING
  //////////////////////////////

  function renderSegment( startCenter, endCenter ) {
    var body = M.CSGRenderer();

    outerBodyGeometry(body.renderer);

    var segment = body.csgObject().intersect(
        xySectionProfile(startCenter, RADIUS-RADIUS_EPSILON, endCenter, RADIUS + RADIUS_EPSILON));

    if (startCenter > 0 && PREPARE_FOR_PRINTING)
      segment = segment.subtract(socket(startCenter, RADIUS+RADIUS_EPSILON));

    if (endCenter > 0 && PREPARE_FOR_PRINTING)
      segment = segment.union(connector(endCenter,RADIUS+RADIUS_EPSILON))

    return segment;
  }

  function mergeSegment( geometry, segmentGeometry, center, i ) {
    var angle = .95 * SOCKET_SPLINE_ARC * Math.max(MAX_ARC,ARC_FRACTION  + (1-ARC_FRACTION) * i/CENTERS.length);

    rotateGeometryAbout(geometry, [center,0,0], 0, 0, angle);
    segmentGeometry.computeFaceNormals();
    THREE.GeometryUtils.merge(geometry, segmentGeometry );
  }

  function connector(center, radius) {
    var height = TOP_SPLINE.vertexBordering(function(v) { return v.x > center}).z;
    var depth = BOTTOM_SPLINE.vertexBordering(function(v) { return v.x > center}).z;
    var scale = scaleTransform(radius,1,height-depth);
    var translate = translateTransform(center, 0, depth);

    var splines = CONNECTOR_SPLINES.map(function(spline) {
      return spline.transform(scale).transform(translate);
    });

    var endHeight = splines[2].vertexAt(1).z;

    var connector = M.CSGRenderer();
    var vertices = M.RibParameterizedPath( M.RibTransform(splines, 10), connectorSpline(), CYLINDER_QUALITY/4 )

    M.lift(vertices).generate(
      M.facers( M.skin, M.closeEdge, M.capBottom, M.capTop )
    ).render(connector.renderer);


    return connector.csgObject().union( axelCSG(center, depth, endHeight, height, 0) );
  }

  function socket(center, radius) {
    var height = TOP_SPLINE.vertexBordering(function(v) { return v.x > center}).z;
    var depth = BOTTOM_SPLINE.vertexBordering(function(v) { return v.x > center}).z;
    var scale = scaleTransform(radius,1,height-depth);
    var translate = translateTransform(center, 0, depth);
    var epsilonOffsets = [[0,-1],[-1,0],[0,1],[0,1]].map(function(o) {
      return translateTransform(0,SOCKET_EPSILON*o[0], SOCKET_EPSILON*o[1]);
    });

    var splines = CONNECTOR_SPLINES.map(function(spline, i) {
      return spline.transform(scale).transform(translate).transform(epsilonOffsets[i]);
    });

    var endHeight = splines[2].vertexAt(1).z;

    var socket = M.CSGRenderer();
    var vertices = M.RibParameterizedPath( M.RibTransform(splines, 10), socketSpline(center), CYLINDER_QUALITY/4 )

    M.lift(vertices).generate(
      M.facers( M.skin, M.closeEdge, M.capBottom, M.capTop )
    ).render(socket.renderer);

    return socket.csgObject().union( axelCSG(center, depth, endHeight, height, SOCKET_EPSILON) );
  }

  function axelCSG( center, lowZ, midZ, highZ, offset ) {
    var axel = M.CSGRenderer();

    M.lift(
        M.Path([center, CONNECTOR_WIDTH + offset, lowZ])
          .line([center,CONNECTOR_WIDTH + offset, midZ + offset])
          .line([center,.1,highZ-1+offset])
          .vertices(3))
     .generate(
        M.CircleRib(CYLINDER_QUALITY/4, [0,0,1], [center,0,lowZ]),
        M.facers( M.skin, M.closeEdge, M.capBottom, M.capTop ))
     .render( axel.renderer );

     return axel.csgObject();
  }

  function outerBodyGeometry(renderer) {
    var vertices = M.RibParameterizedPath( M.RibTransform(OUTER_SPLINES, 40), bodySpline(), CYLINDER_QUALITY )

    M.lift(vertices).generate(
      M.facers( M.skin, M.closeEdge, M.capBottom, M.capTop )
    ).render(renderer);
  }

  function bodySpline() {
    return function(points) {
      return M.Path(points[0])
        .curve(tweenCtlPoints( points[0], points[0], points[1], 1, 0), 1)
        .curve(tweenCtlPoints( points[1], [lerp(points[1][0],points[2][0],.5),points[2][1],points[1][2]], points[2], 1, .333), 1)
        .curve(M.arcToCubic(points[2],M.vadd(points[2],[0,0,1]),points[3]).slice(1), 1)
        .curve(M.arcToCubic(points[3],M.vadd(points[3],[0,1,0]),points[4]).slice(1), 1)
        .curve(tweenCtlPoints( points[4], [lerp(points[4][0],points[5][0],.5),points[4][1],points[5][2]], points[5], .333, 1), 1)
        .curve(tweenCtlPoints( points[5], points[5], points[0], 1, 0), 1)
    }
  }

  function xySectionProfile( startCenter, startRadius, endCenter, endRadius ) {
    var top = 2*RADIUS1, bottom = -top, left=top, back=-10, front=LENGTH+10;
    var include = startCenter
      ? CSG.cylinder({
          start: [startCenter, 0, bottom],
          end: [startCenter, 0, top],
          radius:startRadius,
          slices:CYLINDER_QUALITY
        }).union(CSG.cube({
          center: [lerp(startCenter,front,.5),0,0],
          radius: [(front-startCenter)/2,top,left]
        }))
      : CSG.cube({
          center: [lerp(back,front,.5),0,0],
          radius: [(front-back)/2,top,left]
        })

    if (endCenter) {
      include = include.subtract(CSG.cylinder({
        start: [endCenter, 0, bottom],
        end: [endCenter, 0, top],
        radius:endRadius,
        slices:CYLINDER_QUALITY
      }))
      .subtract(CSG.cube({
        center: [lerp(endCenter,front,.5),0,0],
        radius: [(1+front-endCenter)/2,top+1,left+1]
      }))
    }

    return include;
  }

  function connectorSpline() {
    return function(points) {
      return M.Path(points[0])
        .curve(tweenCtlPoints( points[0], [points[0][0], points[1][1], points[0][2]], points[1], .333, .333), 1)
        .curve(tweenCtlPoints( points[1], [points[1][0], points[1][1], points[2][2]], points[2], .333, .333), 1)
        .curve(tweenCtlPoints( points[2], [points[2][0], points[3][1], points[2][2]], points[3], .333, .333), 1)
        .curve(tweenCtlPoints( points[3], [points[3][0], points[3][1], points[0][2]], points[0], .333, .333), 1)
    }
  }

  function socketSpline(center) {
    return function(points) {
      var leftRotation = rotationTransform( M.Q.rotation( -SOCKET_SPLINE_ARC, [0,0,1] ), [center,0,0] );
      var rightRotation = rotationTransform( M.Q.rotation( SOCKET_SPLINE_ARC, [0,0,1] ), [center,0,0] );

      var left = M.Path(points[0])
        .curve(tweenCtlPoints( points[0], [points[0][0], points[1][1], points[0][2]], points[1], .333, .333), 1)
        .curve(tweenCtlPoints( points[1], [points[1][0], points[1][1], points[2][2]], points[2], .333, .333), 1)
        .transform(leftRotation);

      var right = M.Path(points[2])
        .curve(tweenCtlPoints( points[2], [points[2][0], points[3][1], points[2][2]], points[3], .333, .333), 1)
        .curve(tweenCtlPoints( points[3], [points[3][0], points[3][1], points[0][2]], points[0], .333, .333), 1)
        .transform(rightRotation);

      if (Math.abs(points[0][0] - center) < .001)
        return left.concat(right);

      return M.Path(points[0])
        .arc(M.vadd(points[0],[0,1,0]),left.startPoint(),1)
        .concat(left)
        .arc(leftRotation(M.vadd(points[2],[0,-1,0])), points[2], 1)
        .arc(M.vadd(points[2],[0,-1,0]), right.startPoint(), 1)
        .concat(right)
        .arc(rightRotation(M.vadd(points[0],[0,1,0])), points[0], 1);
    }
  }

  function tweenCtlPoints(p1, ctl, p2, s1, s2) {
    return [
      range(3).map(function(i) {return lerp(p1[i],ctl[i],s1);}),
      range(3).map(function(i) {return lerp(p2[i],ctl[i],s2);}),
      p2 ];
  }

  function arcCtrlPoints( cx, p1, p2, c1z, c2z ) {
    // (cx-p1x)^2 + p1y^2 = (cx-p2x)^2 + p2y^2
    // cx * (2*p2x - 2*p1x) = p2x^2 + p2y^2 - p1x^2 - p1y^2
    console.log()

    var tangent = p1[1] < p2[1] ? [p1[0]+p1[1],p1[1]+cx-p1[0],0] : [p1[0]-p1[1],p1[1]-cx+p1[0],0];
    var cubic = M.arcToCubic([p1[0],p1[1],0],tangent,[p2[0],p2[1],0]).slice(1);

    cubic[0][2] = c1z;
    cubic[1][2] = c2z;
    cubic[2][2] = p2[2];
    return cubic;
  }

  function lengthSpline(ctrWeights) {
    return function(points) {
      var path = M.Path(points[0]).curve([
        forwardCtlPoint(points[0],points[1],LENGTH_CTRL_POINTS[0]),
        reverseCtlPoint(points[0],points[1],points[2],ctrWeights[1]),
        points[1]
      ],5);
      for (var i=1; i<points.length-2; i++) {
        path = path.spline([
          reverseCtlPoint(points[i], points[i+1], points[i+2], ctrWeights[i+1]),
          points[i+1]
        ],5)
      }
      path = path.spline([
        [points[i+1][0], lerp(points[i+1][1],points[i][1],.333), lerp(points[i+1][2],points[i][2],.333)],
        points[i+1]
      ],5)

      return path;
    }
  }

  function forwardCtlPoint( p0, p1, fraction ) {
    return M.vadd( p0, M.vscale(M.vsub(p1,p0), fraction) );
  }

  function reverseCtlPoint( p0, p1, p2, fraction ) {
    var dir = M.vsub(p0,p1);
    if (p2) dir = M.vscale(M.vadd(dir, M.vsub(p1,p2)), .5);
    return M.vadd( p1, M.vscale(dir, fraction) );
  }

  function lerp(a, b, x) {
    return a + x*(b-a);
  }

  function mirrorXZ( point ) { return [point[0], -point[1], point[2]]; }
  function translateTransform(x, y, z) { return function(p) { return [x+p[0],y+p[1],z+p[2]]} }
  function scaleTransform(sx, sy, sz) { return function(p) { return [sx*p[0],sy*p[1],sz*p[2]]} }
  function rotationTransform(rotation, about) { return function(p) {
    return M.vadd(M.Q.rotate(M.vsub(p,about),rotation), about); } }

  function range(n) { for (var i=0,a=[];i<n; i++) a.push(i); return a; }

  function rotateXY(p, angle) {
    var sa = Math.sin(angle), ca = Math.cos(angle);
    return [p[0]*ca + p[1]*sa, p[1]*ca - p[0]*sa, p[2] ];
  }

  function addWireframe( geometry, color, name ) {
    var material = new THREE.MeshBasicMaterial({ wireframe: true, color: color });
    var mesh = new THREE.Mesh(geometry, material );
    a3d.cad.addMesh(mesh, name, {clean:true, noShadow:true, large:true});
    return mesh;
  }

  function addMesh( geometry, color, name ) {
    var material = new THREE.MeshPhongMaterial( { color: color } );
    var mesh = new THREE.Mesh(geometry, material );
    a3d.cad.addMesh(mesh, name, {large:true})
    return mesh;
  }

  function translateGeometry( g, x, y, z ) {
    matrix = new THREE.Matrix4().makeTranslation(x,y,z);
    g.applyMatrix(matrix);
  }

  function rotateGeometry( g, x, y, z ) {
    var matrix;
    if (x)
      matrix = new THREE.Matrix4().makeRotationX(x);
    if (y)
      matrix = (matrix||new THREE.Matrix4()).makeRotationY(y);
    if (z)
      matrix = (matrix||new THREE.Matrix4()).makeRotationZ(z);
    if (matrix)
      g.applyMatrix(matrix);
  }

  function rotateGeometryAbout( g, center, x, y, z ) {
    translateGeometry(g, -center[0], -center[1], -center[2]);
    rotateGeometry( g, x, y, z );
    translateGeometry(g, center[0], center[1], center[2]);
  }

  return {render:render, renderAsync:renderAsync};
})()