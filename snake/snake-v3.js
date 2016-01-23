SNAKE = (function() {
  /*
  TODO:
  Same for connector and socket splines.
  Cut spline groups using path.split(path.vertexBordering) to cut segments along rotation cylinders.
  Sequence together.
  Use CSG only for axel and axel socket.

  Add head.
  Scales?
  */
  // if we are a worker, init scripts
  if (typeof importScripts !== 'undefined') initWorker();

  var M = manifold;

  var PREPARE_FOR_PRINTING = false;
  var CYLINDER_QUALITY = 4*(PREPARE_FOR_PRINTING ? 32 : 10) + 1;

  var LENGTH = 600;
  var RADIUS1 = 9;
  var RADIUS2 = 10.25;
  var RADIUS3 = 7;
  var RADIUS4 = 2;
  var DEPTH = .8 * RADIUS3;
  var MIDDLE = .4 * LENGTH;
  var TAPER = .85 * LENGTH;
  var END = .99 * LENGTH;
  var CENTER_HEIGHT = 2.5;
  var TAIL_Z_OFFSET = -5;

  var BODY_SPLINES = bundleSplines([
    snakeSection(-50, .1),
    ['curve',5,snakeSection(-50,.333*RADIUS1), snakeSection(-40,RADIUS1), snakeSection(0,RADIUS1)],
    ['spline',5,snakeSection(MIDDLE - 25,RADIUS2), snakeSection(MIDDLE,RADIUS2)],
    ['spline',5,snakeSection(lerp(MIDDLE,TAPER,.85), lerp(RADIUS2,RADIUS3,.85)), snakeSection(TAPER,RADIUS3)],
    ['spline',5,snakeSection(lerp(TAPER,END,.92), lerp(RADIUS3,RADIUS4,.92),TAIL_Z_OFFSET+1), snakeSection(END,RADIUS4,TAIL_Z_OFFSET+1.5)],
    ['spline',2,snakeSection(LENGTH,.5,TAIL_Z_OFFSET+1), snakeSection(LENGTH,.1,TAIL_Z_OFFSET+1)]
  ], CYLINDER_QUALITY);

  var AXEL_RADIUS = 2.6;
  var CONNECTOR_START_FRACTION = .9;
  var CONNECTOR_END_FRACTION = .14;
  var CONNECTOR_END_OFFSET = .1;
  var AXEL_CONE_FRACTION = .6;

  var NCENTERS = 32;
  var CENTERS = range(NCENTERS).map(function(x) { return lerp(20, LENGTH-30, x/(NCENTERS-1)); })
  var RADIUS = 12;
  var RADIUS_EPSILON = .2;
  var SOCKET_EPSILON = .4;
  var SOCKET_SPLINE_ARC = Math.PI / 8;

  var CONNECTOR_DEPTH = .1;
  var CONNECTOR_WIDTH = 3;

  var TOP_CONNECTOR_SPLINE = M.Path([-1,0,.9]).line([0,0,.45+CONNECTOR_DEPTH]);
  var RIGHT_CONNECTOR_SPLINE = M.Path([-1,CONNECTOR_WIDTH,.45]).line([0,CONNECTOR_WIDTH,.5]);
  var BOTTOM_CONNECTOR_SPLINE = M.Path([-1,0,0]).line([0,0,.45-CONNECTOR_DEPTH]);

  var CONNECTOR_SPLINES = [BOTTOM_CONNECTOR_SPLINE, RIGHT_CONNECTOR_SPLINE.transform(mirrorXZ), TOP_CONNECTOR_SPLINE, RIGHT_CONNECTOR_SPLINE];

  var ARC_FRACTION = .5;
  var MAX_ARC = .65;

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


    // var segments = CENTERS.length;
    CENTERS.forEach(function( center, i ) {
      var startCenter = i ? CENTERS[i-1] : 0;

      // if (startCenter == 0) return
      if (i == 5) {
        var segment = renderSegment( startCenter, center );
        var csgGeometry = segment;//THREE.CSG.fromCSG(segment);
        mergeSegment( geometry, csgGeometry, startCenter, i );
      }
    })

    // add tail
    var segment = renderSegment( CENTERS[CENTERS.length-1], 0);
    var csgGeometry = segment; //THREE.CSG.fromCSG(segment);
    mergeSegment( geometry, csgGeometry, CENTERS[CENTERS.length-1], CENTERS.length );

    translateGeometry(geometry, -CENTERS[CENTERS.length-1], 0, 0);

    // add mesh
    mergedGeometry.computeBoundingSphere();
    mergedGeometry.computeFaceNormals();

    var mesh = addWireframe(mergedGeometry, '#ffffff', 'snake');
    mesh.position.z = DEPTH;
  }

  function bundleSplines(spec, count) {
    var paths = [];
    spec[0].vertices(count,0)(function(v) { paths.push(M.Path(v)) });
    spec.slice(1).forEach(function(segment) {
      paths.forEach(function(path,i) {
        path[segment[0]](segment.slice(2).map(function(curve) { return curve.vertexAt(i/(paths.length-1)); }), segment[1]);
      });
    })
    return paths;
  }


  //////////////////////////////
  // RENDERING
  //////////////////////////////

  function renderSegment( startCenter, endCenter ) {
    var body = M.ThreeJSRenderer(); M.CSGRenderer();

    var splines = bodySplines(startCenter, RADIUS-RADIUS_EPSILON, endCenter, RADIUS + RADIUS_EPSILON);

    var sources = [];

    if (startCenter > 0)
      sources = sources.concat(socket(startCenter, RADIUS + RADIUS_EPSILON));

    // sources.push([5,M.PathSource(splines, 20)])

    // if (endCenter > 0)
    //   sources = sources.concat(connector(endCenter, RADIUS + RADIUS_EPSILON))


    M.lift(M.Stage(sources)).generate(
      M.facers( M.skin, M.closeEdge, M.debugFacer ) // , M.capBottom, M.capTop
    ).render(body.renderer);

    var segment = body.geometry; //body.csgObject();


    return segment;
  }

  function bodySplines( startAxis, startRadius, endAxis, endRadius ) {
    var splines = BODY_SPLINES;
    if (startAxis)
      splines = splines.map(function(path) {
        var cut = path.vertexBordering(afterRadius(startAxis,startRadius), .000001);
        return path.split(cut.transformStep)[1];
      });

    if (endAxis)
      splines = splines.map(function(path) {
        var cut = path.vertexBordering(afterRadius(endAxis,endRadius), .000001);
        return path.split(cut.transformStep)[0];
      });

    return splines;
  }

  function connector( center, radius ) {
    var topCurve = BODY_SPLINES[parseInt(BODY_SPLINES.length/2)];

    var startTop = topCurve.vertexBordering(afterX(center - radius), .000001);
    var startHeight = startTop.z - Math.max( -startTop.z, -DEPTH );
    var endTop = topCurve.vertexBordering(afterX(center), .000001);
    var endHeight = endTop.z - Math.max( -endTop.z, -DEPTH );
    var endOffset = endTop.z - endHeight/2 - CONNECTOR_END_OFFSET*endHeight;

    var connector = bundleSplines(
      [connectorSection(center-radius-3*RADIUS_EPSILON, AXEL_RADIUS,
          CONNECTOR_START_FRACTION*startHeight/2, startTop.z - startHeight/2),
        ['curve',5,connectorSection(center, AXEL_RADIUS, CONNECTOR_END_FRACTION*endHeight/2, endOffset)]
      ], CYLINDER_QUALITY)
      .map(function(path) {
        var cut = path.vertexBordering(afterRadius(center,AXEL_RADIUS), .000001);
        return path.split(cut.transformStep)[0];
      });

    var endPoints = connector.map(function(c) { return c.vertexAt(1); });
    var leftBottom = endPoints.filter(function(p) { return p.z<endOffset + .00001 && p.y<0; });
    var top = endPoints.filter(function(p) { return p.z>endOffset - .00001; });
    var rightBottom = endPoints.filter(function(p) { return p.z<endOffset + .00001 && p.y>=0; });

    var axelSplines = leftBottom.map(axelLineForBottom(center,endTop.z))
      .concat(top.map(axelLineForTop(center,endTop.z)))
      .concat(rightBottom.map(axelLineForBottom(center,endTop.z)))

    return [
      [5,M.PathSource(connector, 20)],
      [5,M.PathSource(axelSplines, 5)]
    ];
  }

  function socket( center, radius ) {
    var topCurve = BODY_SPLINES[parseInt(BODY_SPLINES.length/2)];
    var epsilon = .000001;

    var startTop = topCurve.vertexBordering(afterX(center - radius), epsilon);
    var startHeight = startTop.z - Math.max( -startTop.z, -DEPTH );
    var endTop = topCurve.vertexBordering(afterX(center), epsilon);
    var endHeight = endTop.z - Math.max( -endTop.z, -DEPTH );
    var endOffset = endTop.z - endHeight/2 - CONNECTOR_END_OFFSET*endHeight;

    var connector = bundleSplines([
        socketSection(center-radius, AXEL_RADIUS,
          CONNECTOR_START_FRACTION*startHeight/2, startTop.z-startHeight/2, center),
        ['curve',5,socketSection(center, AXEL_RADIUS, CONNECTOR_END_FRACTION*endHeight/2, endOffset, center)]
      ], CYLINDER_QUALITY)
      .map(function(path) {
        var cut = path.vertexBordering(afterRadius(center,radius), epsilon);
        path = cut ? path.split(cut.transformStep)[1] : path;
        var cut = path.vertexBordering(afterRadius(center,AXEL_RADIUS+1), epsilon);
        return cut ? path.split(cut.transformStep)[0] : path;
      });

    var endPoints = connector.map(function(c) { return c.vertexAt(1); });
    var leftBottom = endPoints.filter(function(p) { return p.z<endOffset + epsilon && p.y<0; });
    var top = endPoints.filter(function(p) { return p.z>endOffset - epsilon; });
    var rightBottom = endPoints.filter(function(p) { return p.z<endOffset + epsilon && p.y>=0; });

    var axelSplines = leftBottom.map(axelLineForBottom(center,endTop.z))
      .concat(top.map(axelLineForTop(center,endTop.z)))
      .concat(rightBottom.map(axelLineForBottom(center,endTop.z)));

//    axelSplines = top.map(axelLineForTop(center,endTop.z));

    return [
//      [5,M.PathSource(connector, 20)],
      [5,M.PathSource(axelSplines, 20)]
    ];
  }

  function snakeSection(x,radius,zOffset) {
    zOffset = zOffset || 0;
    var bottom = radius + zOffset > DEPTH ? [x,-Math.acos(DEPTH/radius),-DEPTH] : [x,0,-radius+zOffset];
    var side = [x,-radius,zOffset];
    var arc = M.arcToCubic(side,[x,-radius,-DEPTH],bottom);
    return symetricPath( M.Path(bottom)
      .curve([[x,arc[2][1],bottom[2]],arc[1],side],5)
      .arc([x,-radius,radius+zOffset],[x,0,radius+zOffset],5) );
  }

  function connectorSection(x,yRadius,zRadius,zOffset) {
    zOffset = zOffset || 0;
    return symetricPath( M.Path([x,0,-zRadius + zOffset])
      .curve([[x,-yRadius,-zRadius + zOffset],[x,-yRadius,zOffset]],5)
      .curve([[x,-yRadius,zRadius + zOffset],[x,0,zRadius + zOffset]],5) );
  }

  function socketSection(x,yRadius,zRadius,zOffset,center) {
    zOffset = zOffset || 0;
    var leftRotation = rotationTransform( M.Q.rotation( -SOCKET_SPLINE_ARC, [0,0,1] ), [center,0,0] );
    var path = M.Path([x,0,-zRadius + zOffset])
      .curve([[x,-yRadius,-zRadius + zOffset],[x,-yRadius,zOffset]],5)
      .curve([[x,-yRadius,zRadius + zOffset],[x,0,zRadius + zOffset]],5)
      .transform(leftRotation);

    var start = path.vertexAt(0), end = path.vertexAt(1);
    path = M.Path([start.x,0,-zRadius + zOffset]).line(start)
      .concat(path)
      .concat(M.Path(end).line([end.x,0,zRadius + zOffset]));

    return symetricPath( path );
  }

  function axelLineForTop(center,endHeight,reverse) {
    return function(p) {
      return M.Path(p)
        .line([p.x,p.y,endHeight*AXEL_CONE_FRACTION])
       .line([lerp(p.x,center,.9999), lerp(p.y,0,.9999), endHeight-.5]);
    }
  }

  function axelLineForBottom(center,endHeight,reverse) {
    return function(p) {
      return M.Path(p)
        .line([p.x,p.y,-DEPTH])
        .line([2*center-p.x,p.y,-DEPTH])
        .line([2*center-p.x,p.y,endHeight*AXEL_CONE_FRACTION])
        .line([2*center-lerp(p.x,center,.9999), lerp(p.y,0,.9999), endHeight-.5]);
    }
  }

  function mergeSegment( geometry, segmentGeometry, center, i ) {
    var angle = .95 * SOCKET_SPLINE_ARC * Math.max(MAX_ARC,ARC_FRACTION  + (1-ARC_FRACTION) * i/CENTERS.length);

    rotateGeometryAbout(geometry, [center,0,0], 0, 0, angle);
    segmentGeometry.computeFaceNormals();
    THREE.GeometryUtils.merge(geometry, segmentGeometry );
  }

  // function socket(center, radius) {
  //   var height = TOP_SPLINE.vertexBordering(function(v) { return v.x > center}).z;
  //   var depth = BOTTOM_SPLINE.vertexBordering(function(v) { return v.x > center}).z;
  //   var scale = scaleTransform(radius,1,height-depth);
  //   var translate = translateTransform(center, 0, depth);
  //   var epsilonOffsets = [[0,-1],[-1,0],[0,1],[0,1]].map(function(o) {
  //     return translateTransform(0,SOCKET_EPSILON*o[0], SOCKET_EPSILON*o[1]);
  //   });

  //   var splines = CONNECTOR_SPLINES.map(function(spline, i) {
  //     return spline.transform(scale).transform(translate).transform(epsilonOffsets[i]);
  //   });

  //   var endHeight = splines[2].vertexAt(1).z;

  //   var socket = M.CSGRenderer();
  //   var vertices = M.RibParameterizedPath( M.RibTransform(splines, 10), socketSpline(center), CYLINDER_QUALITY/4 )

  //   M.lift(vertices).generate(
  //     M.facers( M.skin, M.closeEdge, M.capBottom, M.capTop )
  //   ).render(socket.renderer);

  //   return socket.csgObject().union( axelCSG(center, depth, endHeight, height, SOCKET_EPSILON) );
  // }

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

  function lerp(a, b, x) { return a + x*(b-a); }

  function afterRadius(axis,radius) { return function(v) { return v.x >= axis || Math.pow(axis-v.x,2) + v.y * v.y <= radius*radius } }
  function afterX(axis) { return function(v) { return v.x >= axis } }

  function mirrorXZ( point ) { return [point[0], -point[1], point[2]]; }
  function translateTransform(x, y, z) { return function(p) { return [x+p[0],y+p[1],z+p[2]]} }
  function scaleTransform(sx, sy, sz) { return function(p) { return [sx*p[0],sy*p[1],sz*p[2]]} }
  function rotationTransform(rotation, about) { return function(p) {
    return M.vadd(M.Q.rotate(M.vsub(p,about),rotation), about); } }

  function symetricPath(path) { return path.concat( path.reverse().transform(mirrorXZ)); }

  function mirror( direction, about ) {
    about = about || [0,0,0];
    return function(p) { M.vadd(about, M.vscale(direction,-2*M.vdot(direction,M.vsub(p,about)))); }
  }

  function range(n) { for (var i=0,a=[];i<n; i++) a.push(i); return a; }

  function close(a,b) { return Math.abs(a-b) > .00001; }

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

  return {render:render};
})()